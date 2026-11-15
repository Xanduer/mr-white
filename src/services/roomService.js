// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const crypto = require('crypto');
const wordService = require('./wordService');

const rooms = new Map();
const MIN_PLAYERS = 3;
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '50', 10);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mr. Whites must always be strictly fewer than civilians, otherwise the game would start already decided. */
const maxMrWhites = n => Math.max(0, Math.floor((n - 1) / 2));
const cleanName = raw => String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, 20);

function generateCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
}

function newPlayer(name) {
  return {
    id: crypto.randomBytes(4).toString('hex'),     // public identifier
    token: crypto.randomBytes(16).toString('hex'), // private reconnect secret (never broadcast)
    name, socketId: null, connected: false, ready: false, role: null, alive: true
  };
}

function createRoom(hostName) {
  const host = newPlayer(hostName);
  const room = {
    code: generateCode(), hostId: host.id, players: [host],
    settings: { mrWhiteCount: 1, category: wordService.categoryNames()[0] },
    phase: 'lobby', phaseEndsAt: null, game: null, chat: [], timers: {}, lastActive: Date.now()
  };
  rooms.set(room.code, room);
  return room;
}

const getRoom = code => rooms.get(String(code || '').trim().toUpperCase()) || null;
const nameTaken = (room, name) => room.players.some(p => p.name.toLowerCase() === name.toLowerCase());

function normalizeSettings(room) {
  const max = maxMrWhites(room.players.length);
  let n = room.settings.mrWhiteCount;
  n = max >= 1 ? Math.min(Math.max(1, n), max) : 1;
  room.settings.mrWhiteCount = n;
}

function addPlayer(room, name) {
  const p = newPlayer(name);
  room.players.push(p);
  normalizeSettings(room);
  return p;
}

function removePlayer(room, id) {
  room.players = room.players.filter(p => p.id !== id);
  if (room.hostId === id) {
    const next = room.players.find(p => p.connected) || room.players[0];
    room.hostId = next ? next.id : null;
  }
  normalizeSettings(room);
}

function deleteRoom(room) {
  Object.values(room.timers).forEach(clearTimeout);
  rooms.delete(room.code);
}

/** Drops rooms nobody has been connected to for 10 minutes. */
function cleanup() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.players.some(p => p.connected) && now - room.lastActive > 10 * 60 * 1000) deleteRoom(room);
  }
}
setInterval(cleanup, 5 * 60 * 1000).unref();

module.exports = {
  MIN_PLAYERS, MAX_PLAYERS, maxMrWhites, cleanName, createRoom, getRoom, nameTaken,
  addPlayer, removePlayer, normalizeSettings, deleteRoom
};
