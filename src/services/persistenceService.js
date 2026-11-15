// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const db = require('../config/db');

/** Stores a finished game in MySQL. Fully optional: silently skipped when no database is configured. */
async function saveGame(room) {
  const pool = db.getPool();
  const g = room.game;
  if (!pool || !g) return;
  try {
    const [res] = await pool.query(
      'INSERT INTO games (room_code, category, secret_word, player_count, mr_white_count, winner, started_at, ended_at) VALUES (?,?,?,?,?,?,?,NOW())',
      [room.code, room.settings.category, g.secretWord, room.players.length, room.settings.mrWhiteCount, g.winner, g.startedAt]
    );
    const id = res.insertId;
    const name = pid => (room.players.find(p => p.id === pid) || {}).name || '?';
    await pool.query('INSERT INTO game_players (game_id, display_name, role, eliminated) VALUES ?',
      [room.players.map(p => [id, p.name, p.role, p.alive ? 0 : 1])]);
    if (g.words.length) {
      await pool.query('INSERT INTO game_words (game_id, round_no, display_name, word) VALUES ?',
        [g.words.map(w => [id, w.round, w.name, w.word])]);
    }
    if (g.voteHistory.length) {
      await pool.query('INSERT INTO game_votes (game_id, vote_round, voter_name, target_name) VALUES ?',
        [g.voteHistory.map(v => [id, v.round, name(v.voterId), name(v.targetId)])]);
    }
    const typingRows = [];
    for (const [pid, list] of Object.entries(g.typingResults)) {
      list.forEach((r, i) => r && typingRows.push([id, name(pid), i + 1, r.wpm, r.accuracy, r.errors]));
    }
    if (typingRows.length) {
      await pool.query('INSERT INTO game_typing_results (game_id, display_name, challenge_no, wpm, accuracy, errors) VALUES ?', [typingRows]);
    }
  } catch (err) {
    console.warn('[db] Failed to save game:', err.message);
  }
}

module.exports = { saveGame };
