// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/* 3 players (1 Mr. White -> no typing challenge), same room played three times: wrong guess, correct guess (steal the win), no guess (timeout). */
process.env.TYPING_SECONDS = '2';
process.env.COOLDOWN_SECONDS = '1';
process.env.STAGE_SCALE = '0.02';
process.env.GUESS_SECONDS = '2';
process.env.PORT = '4597';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server, ready } = require('../server');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const s = io('http://localhost:4597', { transports: ['websocket'], forceNew: true });
  const c = { name, s, state: null, raw: [] };
  s.on('state', st => { c.state = st; c.raw.push(JSON.stringify(st)); });
  c.emit = (ev, p) => new Promise(res => s.emit(ev, p || {}, res));
  return c;
}
async function until(fn, label, ms = 25000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('Timed out waiting for: ' + label);
}
const ok = (r, m) => assert.ok(r && r.ok, m + ' -> ' + JSON.stringify(r));
const bad = (r, m) => assert.ok(r && r.ok === false, 'expected failure: ' + m);

async function playToGuess(all, host, label) {
  for (const c of all) if (c !== host) ok(await c.emit('room:ready', { ready: true }), 'ready');
  ok(await host.emit('game:start'), label + ' start');
  await until(() => all.every(c => c.state.phase === 'role_reveal'), 'roles');
  const W = all.find(c => c.state.secret.role === 'mrwhite');
  const civs = all.filter(c => c !== W);
  const word = civs[0].state.secret.word;
  W.raw.length = 0; // only inspect what the Mr. White receives from here on
  for (const c of all) await c.emit('role:continue');
  for (const round of [1, 2]) {
    await until(() => all.every(c => c.state.phase === 'word_round' && c.state.round === round), 'round ' + round);
    assert.ok(civs.some(c => c.state.me.id === all[0].state.turnOrder[0].id), 'a civilian always goes first');
    for (let i = 0; i < 3; i++) {
      const n = (round - 1) * 3 + i;
      const cur = await until(() => all.find(c => c.state.currentTurn === c.state.me.id && c.state.words.length === n), 'turn');
      ok(await cur.emit('word:submit', { word: `${label}${round}${i}` }), 'word');
    }
  }
  await until(() => all.every(c => c.state.phase === 'discussion'), 'discussion');
  ok(await all[0].emit('vote:proceed'), 'proceed 1'); ok(await all[1].emit('vote:proceed'), 'proceed 2');
  await until(() => all.every(c => c.state.phase === 'voting'), 'voting');
  for (const v of all) ok(await v.emit('vote:cast', { targetId: v === W ? civs[0].state.me.id : W.state.me.id }), 'vote');
  await until(() => all.every(c => c.state.phase === 'mrwhite_guess'), 'guess phase');
  return { W, civs, word };
}

(async () => {
  await ready;
  const all = ['Ann', 'Ben', 'Cy'].map(client);
  await until(() => all.every(c => c.s.connected), 'connect');
  const host = all[0];
  const created = await host.emit('room:create', { name: 'Ann' });
  for (const c of all.slice(1)) ok(await c.emit('room:join', { code: created.code, name: c.name }), 'join');
  await until(() => host.state.players.length === 3, 'three players');

  // ---- game 1: wrong guess -> civilians win ----
  let g = await playToGuess(all, host, 'a');
  assert.ok(g.civs.every(c => c.state.guess.canGuess === false));
  bad(await g.civs[0].emit('guess:submit', { text: g.word }), 'civilian guess');
  ok(await g.W.emit('guess:submit', { text: 'not it' }), 'wrong guess');
  await until(() => all.every(c => c.state.phase === 'game_over'), 'game over 1');
  assert.strictEqual(host.state.reveal.winner, 'civilians');
  assert.strictEqual(host.state.reveal.reason, 'eliminated');
  assert.strictEqual(host.state.reveal.guesses[0].correct, false);
  const revealStates = g.W.raw.map(r => JSON.parse(r));
  const beforeVerdict = revealStates.filter(st => st.phase !== 'game_over' && !(st.phase === 'guess_reveal' && st.guessReveal.word));
  assert.ok(beforeVerdict.every(st => !JSON.stringify(st).includes(g.word)), 'word not sent to Mr. White before the verdict stage');
  assert.ok(revealStates.some(st => st.phase === 'guess_reveal' && st.guessReveal.stage === 'checking' && st.guessReveal.guesses === null), 'guess verdict hidden while checking');
  ok(await host.emit('game:reset'), 'reset 1'); await until(() => all.every(c => c.state.phase === 'lobby'), 'lobby 1');

  // ---- game 2: correct guess (case/punctuation tolerant) -> Mr. Whites steal the win ----
  g = await playToGuess(all, host, 'b');
  ok(await g.W.emit('guess:submit', { text: '  ' + g.word.toLowerCase() + '! ' }), 'right guess');
  await until(() => all.every(c => c.state.phase === 'game_over'), 'game over 2');
  assert.strictEqual(host.state.reveal.winner, 'mrwhite');
  assert.strictEqual(host.state.reveal.reason, 'guess');
  ok(await host.emit('game:reset'), 'reset 2'); await until(() => all.every(c => c.state.phase === 'lobby'), 'lobby 2');

  // ---- game 3: nobody guesses -> timer ends -> civilians win ----
  g = await playToGuess(all, host, 'c');
  await until(() => all.every(c => c.state.phase === 'guess_reveal'), 'timeout to reveal');
  await until(() => all.every(c => c.state.phase === 'game_over'), 'game over 3');
  assert.strictEqual(host.state.reveal.winner, 'civilians');
  assert.strictEqual(host.state.reveal.guesses.length, 0);
  console.log('GUESS TESTS PASSED');
  all.forEach(c => c.s.close()); server.close(); process.exit(0);
})().catch(err => { console.error('TEST FAILED:', err.message); process.exit(1); });
