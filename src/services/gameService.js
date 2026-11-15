// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/**
 * Server-authoritative game state machine.
 *
 * lobby -> role_reveal -> word_round(1) -> typing(1) -> cooldown -> word_round(2) -> typing(2)
 *   (the typing challenges are skipped entirely when the game has only one Mr. White)
 *       -> discussion -> voting -> vote_result (staged suspense reveal)
 *            -> voting again on a tie
 *            -> discussion (game continues)
 *            -> mrwhite_guess -> guess_reveal -> game_over   (EVERY ending: the Mr. Whites always get a final guess.
 *               Decisive when the civilians caught everyone (a correct guess steals the win); when the Mr. Whites
 *               already won by outnumbering the civilians the guess is revealed but cannot change the result.)
 *
 * There is deliberately NO general discussion after either word round: each word round is
 * followed immediately by a typing challenge. The first general discussion only starts after
 * the second typing challenge has ended.
 */
const crypto = require('crypto');
const rooms = require('./roomService');
const wordService = require('./wordService');
const typingService = require('./typingService');
const persistence = require('./persistenceService');

const secs = (name, def) => (parseInt(process.env[name], 10) || def) * 1000;
// Typing challenge length depends on how many Mr. Whites were chosen for the game:
//   1 Mr. White      -> no typing challenge at all
//   2 or 3 Mr. Whites -> 1 minute
//   4 or more         -> 2 minutes
// (env overrides exist for automated tests only)
const TYPING_LONG_MS = secs('TYPING_SECONDS', 120);
const TYPING_SHORT_MS = secs('TYPING_SHORT_SECONDS', 60);
function typingPlan(mrWhiteCount) {
  if (mrWhiteCount <= 1) return { enabled: false, ms: 0 };
  return { enabled: true, ms: mrWhiteCount >= 4 ? TYPING_LONG_MS : TYPING_SHORT_MS };
}
const COOLDOWN_MS = secs('COOLDOWN_SECONDS', 5);   // env override exists for automated tests only
const GUESS_MS = secs('GUESS_SECONDS', 60);
// Suspense reveal: each stage is shown for a fixed time. STAGE_SCALE exists for automated tests only.
const STAGE_SCALE = parseFloat(process.env.STAGE_SCALE) || 1;
const STAGE_BASE = {
  counting: 3000, tally: 4500, tie: 3500, name: 3500, role: 5000, caught: 3500, lastchance: 4000,
  outnumbered: 3500, checking: 3500, guesses: 4500, verdict: 5500
};
const stageMs = k => Math.max(30, Math.round(STAGE_BASE[k] * STAGE_SCALE));
const SKIP_GRACE_MS = 20000;   // a disconnected player's turn is skipped after this long
const LOBBY_GRACE_MS = 15000;  // a disconnected lobby player is removed after this long

let notifier = { state() {}, chat() {}, white() {}, kicked() {} };
const setNotifier = n => { notifier = n; };
const broadcast = room => notifier.state(room);
const fail = error => ({ ok: false, error });
const OK = { ok: true };

// ---------- helpers ----------
const byId = (room, id) => room.players.find(p => p.id === id);
const alive = room => room.players.filter(p => p.alive);
const aliveConnected = room => alive(room).filter(p => p.connected);
const normalizeWord = w => String(w || '').trim().replace(/\s+/g, ' ').toLowerCase();

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setTimer(room, key, ms, fn) {
  clearTimer(room, key);
  room.timers[key] = setTimeout(() => {
    delete room.timers[key];
    try { fn(); } catch (err) { console.error(err); }
  }, ms);
}
function clearTimer(room, key) {
  if (room.timers[key]) { clearTimeout(room.timers[key]); delete room.timers[key]; }
}
function clearAllTimers(room) { Object.keys(room.timers).forEach(k => clearTimer(room, k)); }

function setPhase(room, phase, ms) {
  room.phase = phase;
  room.phaseEndsAt = ms ? Date.now() + ms : null;
  room.lastActive = Date.now();
}

function makeMessage(name, text, system) {
  return { id: crypto.randomBytes(4).toString('hex'), name, text, ts: Date.now(), system: !!system };
}
function pushChat(room, msg) {
  room.chat.push(msg);
  if (room.chat.length > 500) room.chat.shift();
  notifier.chat(room, msg);
}

/** Posts a system line into the room chat (delivered as a chat event, no full state push). */
function announce(room, text) { pushChat(room, makeMessage('SYSTEM', text, true)); }

const normGuess = w => String(w || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

/** Plays a list of timed stages (suspense reveals), then calls done(room). Server-driven so no client sees data early. */
function playStages(room, phase, stages, done) {
  const g = room.game;
  let i = 0;
  g.stagesShown = [];
  g.stage = null;
  setPhase(room, phase);
  const show = () => {
    if (room.phase !== phase) return;
    g.stage = stages[i];
    g.stagesShown.push(stages[i]);
    broadcast(room);
    setTimer(room, 'phase', stageMs(stages[i]), () => {
      i++;
      if (i < stages.length) show(); else done(room);
    });
  };
  show();
}

function proceedInfo(room) {
  const g = room.game;
  const connected = aliveConnected(room);
  const needed = Math.floor(connected.length / 2) + 1; // strict majority
  const count = connected.filter(p => g.agree.has(p.id)).length;
  return { count, needed, total: connected.length };
}

function checkWin(room) {
  const mr = alive(room).filter(p => p.role === 'mrwhite').length;
  const civ = alive(room).filter(p => p.role === 'civilian').length;
  if (mr === 0) return 'civilians';
  if (mr >= civ) return 'mrwhite';
  return null;
}

// ---------- lobby ----------
function setSettings(room, player, { mrWhiteCount, category }) {
  if (room.phase !== 'lobby') return fail('Settings can only be changed in the lobby.');
  if (player.id !== room.hostId) return fail('Only the host can change settings.');
  if (category !== undefined) {
    if (!wordService.isValidCategory(category)) return fail('Unknown category.');
    room.settings.category = category;
  }
  if (mrWhiteCount !== undefined) {
    const n = parseInt(mrWhiteCount, 10);
    const max = rooms.maxMrWhites(room.players.length);
    if (!Number.isInteger(n) || n < 1 || n > max) return fail(`Choose between 1 and ${max} Mr. Whites for ${room.players.length} players.`);
    room.settings.mrWhiteCount = n;
  }
  broadcast(room);
  return OK;
}

function setReady(room, player, ready) {
  if (room.phase !== 'lobby') return fail('The game has already started.');
  player.ready = !!ready;
  broadcast(room);
  return OK;
}

function kick(room, host, targetId) {
  if (room.phase !== 'lobby') return fail('Players can only be removed before the game begins.');
  if (host.id !== room.hostId) return fail('Only the host can remove players.');
  const target = byId(room, targetId);
  if (!target || target.id === host.id) return fail('Invalid player.');
  rooms.removePlayer(room, target.id);
  notifier.kicked(target);
  broadcast(room);
  return OK;
}

function removeFromLobby(room, id) {
  if (room.phase !== 'lobby') return;
  rooms.removePlayer(room, id);
  if (room.players.length === 0) { rooms.deleteRoom(room); return; }
  broadcast(room);
}

// ---------- start / roles ----------
function startGame(room, player) {
  if (room.phase !== 'lobby') return fail('The game has already started.');
  if (player.id !== room.hostId) return fail('Only the host can start the game.');
  const members = room.players.filter(p => p.connected);
  if (members.length < rooms.MIN_PLAYERS) return fail(`At least ${rooms.MIN_PLAYERS} players are required.`);
  room.players = members;
  rooms.normalizeSettings(room);
  const max = rooms.maxMrWhites(members.length);
  if (room.settings.mrWhiteCount < 1 || room.settings.mrWhiteCount > max) return fail(`Choose between 1 and ${max} Mr. Whites.`);
  if (members.some(p => p.id !== room.hostId && !p.ready)) return fail('All players must be ready.');

  shuffle(members).forEach((p, i) => {
    p.role = i < room.settings.mrWhiteCount ? 'mrwhite' : 'civilian';
    p.alive = true;
  });
  // Turn order: a civilian always goes first (random civilian), everyone else follows in random order.
  const civilians = members.filter(p => p.role === 'civilian');
  const first = civilians[crypto.randomInt(civilians.length)];
  const order = [first.id, ...shuffle(members.filter(p => p.id !== first.id)).map(p => p.id)];
  room.game = {
    secretWord: wordService.pickWord(room.settings.category),
    order,
    mrWhiteCount: room.settings.mrWhiteCount,
    typingPlan: typingPlan(room.settings.mrWhiteCount),
    round: 1, turnIndex: -1, currentTurn: null,
    words: [], usedWords: new Set(), roleConfirmed: new Set(),
    typing: null, usedPassages: new Set(), typingResults: {}, whiteChat: [],
    agree: new Set(), votes: {}, voteRound: 0, candidates: [], voteHistory: [],
    lastResult: null, eliminated: [], winner: null, winReason: null, startedAt: new Date(),
    stage: null, stagesShown: [], guesses: {}, guessWon: false
  };
  room.chat = [];
  setPhase(room, 'role_reveal');
  broadcast(room);
  return OK;
}

function confirmRole(room, player) {
  if (room.phase !== 'role_reveal') return fail('Not in the role reveal.');
  room.game.roleConfirmed.add(player.id);
  if (!checkRoleReveal(room)) broadcast(room);
  return OK;
}

function checkRoleReveal(room) {
  if (room.phase !== 'role_reveal') return false;
  const players = aliveConnected(room);
  if (players.length && players.every(p => room.game.roleConfirmed.has(p.id))) {
    startWordRound(room, 1);
    return true;
  }
  return false;
}

// ---------- word rounds ----------
function startWordRound(room, round) {
  const g = room.game;
  g.round = round;
  g.turnIndex = -1;
  setPhase(room, 'word_round');
  advanceTurn(room);
}

function advanceTurn(room) {
  const g = room.game;
  clearTimer(room, 'turn');
  g.turnIndex++;
  while (g.turnIndex < g.order.length) {
    const p = byId(room, g.order[g.turnIndex]);
    if (p && p.alive) break;
    g.turnIndex++;
  }
  if (g.turnIndex >= g.order.length) {
    g.currentTurn = null;
    afterWordRound(room); // Round ends automatically
    return;
  }
  const p = byId(room, g.order[g.turnIndex]);
  g.currentTurn = p.id;
  if (!p.connected) scheduleSkip(room, p.id);
  broadcast(room);
}

/** After a word round: typing challenge straight away, unless this game has none (only one Mr. White). */
function afterWordRound(room) {
  const g = room.game;
  if (g.typingPlan.enabled) startTyping(room, g.round);
  else if (g.round === 1) startCooldown(room);
  else startDiscussion(room);
}

function scheduleSkip(room, pid) {
  setTimer(room, 'turn', SKIP_GRACE_MS, () => {
    const p = byId(room, pid);
    if (room.phase === 'word_round' && room.game.currentTurn === pid && p && !p.connected) advanceTurn(room);
  });
}

function submitWord(room, player, raw) {
  const g = room.game;
  if (room.phase !== 'word_round') return fail('Words can only be submitted during a word round.');
  if (g.currentTurn !== player.id) return fail('It is not your turn.');
  const word = String(raw || '').trim();
  if (!/^[\p{L}\p{N}'-]{1,30}$/u.test(word)) return fail('Submit exactly one word (letters or numbers, up to 30 characters).');
  const norm = normalizeWord(word);
  if (g.usedWords.has(norm)) return fail('That word has already been used. Choose another one.');
  g.usedWords.add(norm);
  g.words.push({ round: g.round, playerId: player.id, name: player.name, word });
  advanceTurn(room);
  return OK;
}

// ---------- typing challenge ----------
function startTyping(room, index) {
  const g = room.game;
  const now = Date.now();
  const ms = g.typingPlan.ms;
  g.typing = { index, startedAt: now, endsAt: now + ms, passages: {}, inputs: {}, finished: {} };
  for (const p of room.players) {
    if (p.alive && p.role === 'civilian') g.typing.passages[p.id] = typingService.generatePassage(g.usedPassages);
  }
  setPhase(room, 'typing', ms);
  setTimer(room, 'phase', ms, () => endTyping(room));
  broadcast(room);
}

function endTyping(room) {
  if (room.phase !== 'typing') return;
  const g = room.game, t = g.typing;
  for (const [pid, passage] of Object.entries(t.passages)) {
    const end = t.finished[pid] || t.endsAt;
    const stats = typingService.computeStats(passage, t.inputs[pid], (end - t.startedAt) / 1000);
    if (!g.typingResults[pid]) g.typingResults[pid] = [];
    g.typingResults[pid][t.index - 1] = stats;
  }
  if (t.index === 1) startCooldown(room);
  else startDiscussion(room); // first general discussion happens only now
}

function typingProgress(room, player, text) {
  if (room.phase !== 'typing') return fail('No typing challenge is running.');
  const t = room.game.typing;
  const passage = t.passages[player.id];
  if (!passage || !player.alive) return fail('You are not part of the typing challenge.');
  if (t.finished[player.id]) return OK;
  t.inputs[player.id] = String(text || '').slice(0, passage.length);
  return OK;
}

function typingFinish(room, player) {
  if (room.phase !== 'typing') return fail('No typing challenge is running.');
  const t = room.game.typing;
  const passage = t.passages[player.id];
  if (!passage) return fail('You are not part of the typing challenge.');
  if ((t.inputs[player.id] || '').length < passage.length) return fail('Passage not complete yet.');
  if (!t.finished[player.id]) t.finished[player.id] = Date.now();
  return OK;
}

function whiteChat(room, player, text) {
  if (room.phase !== 'typing') return fail('The private room is only open during the typing challenge.');
  if (!player.alive || player.role !== 'mrwhite') return fail('Not allowed.');
  if (alive(room).filter(p => p.role === 'mrwhite').length < 2) return fail('There is nobody else in the private room.');
  const clean = String(text || '').trim().slice(0, 300);
  if (!clean) return fail('Empty message.');
  const msg = makeMessage(player.name, clean);
  room.game.whiteChat.push(msg);
  notifier.white(room, msg);
  return OK;
}

// ---------- cooldown ----------
function startCooldown(room) {
  setPhase(room, 'cooldown', COOLDOWN_MS);
  setTimer(room, 'phase', COOLDOWN_MS, () => startWordRound(room, 2));
  broadcast(room);
}

// ---------- discussion / proceed ----------
function startDiscussion(room) {
  const g = room.game;
  g.agree = new Set();
  clearTimer(room, 'phase');
  setPhase(room, 'discussion');
  pushChat(room, makeMessage('SYSTEM', 'Discussion is open. There is no time limit. Press PROCEED TO VOTING when you are ready.', true));
  broadcast(room);
}

function chat(room, player, text) {
  if (room.phase !== 'discussion' && room.phase !== 'lobby') return fail('Chat is only open in the lobby and during the discussion.');
  if (!player.alive) return fail('Eliminated players cannot send messages.');
  const clean = String(text || '').trim().slice(0, 300);
  if (!clean) return fail('Empty message.');
  pushChat(room, makeMessage(player.name, clean));
  return OK;
}

function proceed(room, player) {
  if (room.phase !== 'discussion') return fail('Not in the discussion.');
  if (!player.alive) return fail('Eliminated players cannot vote.');
  room.game.agree.add(player.id);
  if (!checkProceed(room)) broadcast(room);
  return OK;
}

function checkProceed(room) {
  if (room.phase !== 'discussion') return false;
  const info = proceedInfo(room);
  if (info.total > 0 && info.count >= info.needed) {
    startVoting(room, null);
    return true;
  }
  return false;
}

// ---------- voting ----------
function startVoting(room, candidates) {
  const g = room.game;
  g.voteRound++;
  g.candidates = candidates || alive(room).map(p => p.id);
  g.votes = {};
  setPhase(room, 'voting'); // no time limit
  broadcast(room);
}

function vote(room, player, targetId) {
  const g = room.game;
  if (room.phase !== 'voting') return fail('Voting is not open.');
  if (!player.alive) return fail('Eliminated players cannot vote.');
  if (g.votes[player.id]) return fail('You have already voted.');
  if (targetId === player.id) return fail('You cannot vote for yourself.');
  if (!g.candidates.includes(targetId)) return fail('Invalid choice.');
  g.votes[player.id] = targetId;
  g.voteHistory.push({ round: g.voteRound, voterId: player.id, targetId });
  if (!checkVotes(room)) broadcast(room);
  return OK;
}

function checkVotes(room) {
  if (room.phase !== 'voting') return false;
  const voters = aliveConnected(room);
  if (!voters.length || !voters.every(v => room.game.votes[v.id])) return false;
  tally(room);
  return true;
}

function tally(room) {
  const g = room.game;
  const buckets = {};
  g.candidates.forEach(id => { buckets[id] = []; });
  for (const [voterId, targetId] of Object.entries(g.votes)) {
    if (buckets[targetId]) buckets[targetId].push((byId(room, voterId) || {}).name || '?');
  }
  const rows = g.candidates
    .map(id => ({ id, name: byId(room, id).name, count: buckets[id].length, voters: buckets[id] }))
    .sort((a, b) => b.count - a.count);
  const top = rows.filter(r => r.count === rows[0].count);
  const result = { voteRound: g.voteRound, rows, tie: top.length > 1, tiedIds: top.map(r => r.id), eliminated: null, winner: null };

  let stages;
  if (result.tie) {
    stages = ['counting', 'tally', 'tie'];
  } else {
    const p = byId(room, top[0].id);
    p.alive = false;
    result.eliminated = { id: p.id, name: p.name, role: p.role };
    g.eliminated.push(result.eliminated);
    result.winner = checkWin(room); // checked after every elimination (kept hidden until its reveal stage)
    stages = ['counting', 'tally', 'name', 'role'];
    if (result.winner === 'civilians') stages.push('caught', 'lastchance');
    else if (result.winner === 'mrwhite') stages.push('outnumbered');
  }
  g.lastResult = result;
  playStages(room, 'vote_result', stages, afterResult);
}

function afterResult(room) {
  if (room.phase !== 'vote_result') return;
  const r = room.game.lastResult;
  if (r.tie) startVoting(room, r.tiedIds);                       // revote between tied players only
  else if (r.winner) startGuess(room);                           // every ending: final Mr. White guess
  else startDiscussion(room);
}

// ---------- Mr. White final guess ----------
function startGuess(room) {
  const g = room.game;
  g.guesses = {};
  g.stage = null;
  setPhase(room, 'mrwhite_guess', GUESS_MS);
  setTimer(room, 'phase', GUESS_MS, () => finishGuess(room));
  broadcast(room);
}

function submitGuess(room, player, text) {
  const g = room.game;
  if (room.phase !== 'mrwhite_guess') return fail('Guessing is not open.');
  if (player.role !== 'mrwhite') return fail('Only Mr. Whites can guess.');
  if (g.guesses[player.id]) return fail('You have already locked in your guess.');
  const clean = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!normGuess(clean)) return fail('Enter your guess.');
  // Correctness is decided here and never sent to clients until the verdict stage.
  g.guesses[player.id] = { name: player.name, text: clean, correct: normGuess(clean) === normGuess(g.secretWord) };
  if (room.players.filter(p => p.role === 'mrwhite').every(p => g.guesses[p.id])) finishGuess(room);
  else broadcast(room);
  return OK;
}

function finishGuess(room) {
  if (room.phase !== 'mrwhite_guess') return;
  const g = room.game;
  clearTimer(room, 'phase');
  g.guessWon = Object.values(g.guesses).some(x => x.correct);
  const civiliansWouldWin = g.lastResult.winner === 'civilians';
  playStages(room, 'guess_reveal', ['checking', 'guesses', 'verdict'], () => {
    if (!civiliansWouldWin) endGame(room, 'mrwhite', 'outnumbered');   // already won: guess cannot change it
    else endGame(room, g.guessWon ? 'mrwhite' : 'civilians', g.guessWon ? 'guess' : 'eliminated');
  });
}

function endGame(room, winner, reason) {
  clearAllTimers(room);
  room.game.winner = winner;
  room.game.winReason = reason;
  setPhase(room, 'game_over');
  persistence.saveGame(room);
  broadcast(room);
}

function resetToLobby(room, player) {
  if (room.phase !== 'game_over') return fail('The game is not over yet.');
  const host = byId(room, room.hostId);
  if (player.id !== room.hostId && host && host.connected) return fail('Only the host can start a new game.');
  clearAllTimers(room);
  room.players = room.players.filter(p => p.connected);
  if (!byId(room, room.hostId)) room.hostId = player.id;
  room.players.forEach(p => { p.role = null; p.alive = true; p.ready = false; });
  room.game = null;
  room.chat = [];
  rooms.normalizeSettings(room);
  setPhase(room, 'lobby');
  broadcast(room);
  return OK;
}

// ---------- connection lifecycle ----------
function handleDisconnect(room, player) {
  player.connected = false;
  player.socketId = null;
  room.lastActive = Date.now();
  switch (room.phase) {
    case 'lobby':
      setTimer(room, 'lobby-' + player.id, LOBBY_GRACE_MS, () => {
        const p = byId(room, player.id);
        if (p && !p.connected) removeFromLobby(room, player.id);
      });
      broadcast(room);
      break;
    case 'role_reveal': if (!checkRoleReveal(room)) broadcast(room); break;
    case 'word_round':
      if (room.game.currentTurn === player.id) scheduleSkip(room, player.id);
      broadcast(room);
      break;
    case 'discussion': if (!checkProceed(room)) broadcast(room); break;
    case 'voting': if (!checkVotes(room)) broadcast(room); break;
    default: broadcast(room);
  }
}

function handleReconnect(room, player, socketId) {
  player.connected = true;
  player.socketId = socketId;
  room.lastActive = Date.now();
  clearTimer(room, 'lobby-' + player.id);
  if (room.phase === 'word_round' && room.game.currentTurn === player.id) clearTimer(room, 'turn');
  broadcast(room);
}

function leave(room, player) {
  if (room.phase === 'lobby' || room.phase === 'game_over') {
    rooms.removePlayer(room, player.id);
    if (!room.players.length) { rooms.deleteRoom(room); return; }
    broadcast(room);
  } else {
    handleDisconnect(room, player);
  }
}

module.exports = {
  setNotifier, broadcast, announce, typingPlan, proceedInfo, submitGuess, setSettings, setReady, kick, startGame, confirmRole,
  submitWord, typingProgress, typingFinish, whiteChat, chat, proceed, vote, resetToLobby,
  handleDisconnect, handleReconnect, leave
};
