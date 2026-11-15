// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const rooms = require('../services/roomService');
const wordService = require('../services/wordService');

exports.health = (req, res) => res.json({ ok: true });

exports.categories = (req, res) => res.json({ categories: wordService.categoryNames() });

exports.roomInfo = (req, res) => {
  const room = rooms.getRoom(req.params.code);
  if (!room) return res.status(404).json({ exists: false });
  res.json({ exists: true, joinable: room.phase === 'lobby', playerCount: room.players.length });
};
