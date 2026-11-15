// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const rooms = require('../services/roomService');
const game = require('../services/gameService');
const { viewFor } = require('../services/stateService');

module.exports = function registerSockets(io) {
  const emitTo = (p, event, payload) => { if (p.connected && p.socketId) io.to(p.socketId).emit(event, payload); };

  game.setNotifier({
    state: room => room.players.forEach(p => emitTo(p, 'state', viewFor(room, p))),
    chat: (room, msg) => room.players.forEach(p => emitTo(p, 'chat:message', msg)),
    // Private Mr. White messages are delivered ONLY to living Mr. Whites.
    white: (room, msg) => room.players
      .filter(p => p.alive && p.role === 'mrwhite')
      .forEach(p => emitTo(p, 'white:message', msg)),
    kicked: p => emitTo(p, 'kicked', {})
  });

  io.on('connection', socket => {
    socket.data = {};

    const bind = (room, player) => {
      player.socketId = socket.id;
      player.connected = true;
      socket.data = { code: room.code, playerId: player.id };
    };
    const context = () => {
      const { code, playerId } = socket.data;
      const room = code && rooms.getRoom(code);
      const player = room && room.players.find(p => p.id === playerId);
      return player ? { room, player } : null;
    };
    // Registers an event whose handler needs an authenticated room/player context.
    const on = (event, handler) => socket.on(event, (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : () => {};
      try {
        const ctx = context();
        if (!ctx) return reply({ ok: false, error: 'You are not in a room.' });
        reply(handler(ctx.room, ctx.player, payload || {}) || { ok: true });
      } catch (err) {
        console.error(err);
        reply({ ok: false, error: 'Server error.' });
      }
    });

    socket.on('room:create', (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : () => {};
      const name = rooms.cleanName((payload || {}).name);
      if (!name) return reply({ ok: false, error: 'Enter a display name.' });
      const room = rooms.createRoom(name);
      const host = room.players[0];
      bind(room, host);
      reply({ ok: true, code: room.code, token: host.token, playerId: host.id });
      game.broadcast(room);
    });

    socket.on('room:join', (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : () => {};
      const { code, name: rawName } = payload || {};
      const name = rooms.cleanName(rawName);
      const room = rooms.getRoom(code);
      if (!name) return reply({ ok: false, error: 'Enter a display name.' });
      if (!room) return reply({ ok: false, error: 'Room not found. Check the code.' });
      if (room.phase !== 'lobby') return reply({ ok: false, error: 'That game has already started.' });
      if (room.players.length >= rooms.MAX_PLAYERS) return reply({ ok: false, error: 'This room is full.' });
      if (rooms.nameTaken(room, name)) return reply({ ok: false, error: 'That display name is already taken in this room.' });
      const player = rooms.addPlayer(room, name);
      bind(room, player);
      reply({ ok: true, code: room.code, token: player.token, playerId: player.id });
      game.announce(room, `${player.name} joined the room.`);
      game.broadcast(room);
    });

    socket.on('room:rejoin', (payload, cb) => {
      const reply = typeof cb === 'function' ? cb : () => {};
      const { code, token } = payload || {};
      const room = rooms.getRoom(code);
      const player = room && token && room.players.find(p => p.token === token);
      if (!player) return reply({ ok: false, error: 'Session expired.' });
      bind(room, player);
      reply({ ok: true, code: room.code, playerId: player.id });
      game.handleReconnect(room, player, socket.id);
    });

    on('room:leave', (room, player) => {
      socket.data = {};
      game.leave(room, player);
    });
    on('room:kick', (room, player, p) => game.kick(room, player, p.playerId));
    on('room:settings', (room, player, p) => game.setSettings(room, player, p));
    on('room:ready', (room, player, p) => game.setReady(room, player, p.ready));
    on('game:start', (room, player) => game.startGame(room, player));
    on('game:reset', (room, player) => game.resetToLobby(room, player));
    on('role:continue', (room, player) => game.confirmRole(room, player));
    on('word:submit', (room, player, p) => game.submitWord(room, player, p.word));
    on('typing:progress', (room, player, p) => game.typingProgress(room, player, p.text));
    on('typing:finish', (room, player) => game.typingFinish(room, player));
    on('chat:send', (room, player, p) => game.chat(room, player, p.text));
    on('white:send', (room, player, p) => game.whiteChat(room, player, p.text));
    on('vote:proceed', (room, player) => game.proceed(room, player));
    on('guess:submit', (room, player, p) => game.submitGuess(room, player, p.text));
    on('vote:cast', (room, player, p) => game.vote(room, player, p.targetId));

    socket.on('disconnect', () => {
      const ctx = context();
      // Ignore if this player has already re-bound to a newer socket.
      if (ctx && ctx.player.socketId === socket.id) game.handleDisconnect(ctx.room, ctx.player);
    });
  });
};
