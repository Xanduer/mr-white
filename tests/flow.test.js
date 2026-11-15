// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/* End-to-end test over real sockets (4 players, 1 Mr. White -> no typing challenge). Timers are shortened via env for speed only. */
process.env.TYPING_SECONDS = '2';
process.env.COOLDOWN_SECONDS = '1';
process.env.STAGE_SCALE = '0.02';
process.env.GUESS_SECONDS = '3';
process.env.PORT = '4599';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server, ready } = require('../server');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const phases = [];
function client(name) {
  const s = io('http://localhost:4599', { transports: ['websocket'] });
  const c = { name, s, state: null, raw: [], chat: [], white: [] };
  s.on('state', st => { c.state = st; c.raw.push(JSON.stringify(st)); });
  s.on('chat:message', m => c.chat.push(m));
  s.on('white:message', m => c.white.push(m));
  c.emit = (ev, p) => new Promise(res => s.emit(ev, p || {}, res));
  return c;
}
async function until(fn, label, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('Timed out waiting for: ' + label);
}
const ok = (r, msg) => assert.ok(r && r.ok, msg + ' -> ' + JSON.stringify(r));
const bad = (r, msg) => assert.ok(r && r.ok === false, 'expected failure: ' + msg);

(async () => {
  await ready;
  const A = client('Alice'), B = client('Bob'), C = client('Cara'), D = client('Dan');
  const all = [A, B, C, D];
  await until(() => all.every(c => c.s.connected), 'connect');

  // ---- lobby ----
  const created = await A.emit('room:create', { name: 'Alice' }); ok(created, 'create');
  const code = created.code;
  bad(await B.emit('room:join', { code: 'ZZZZZ', name: 'Bob' }), 'bad code');
  for (const c of [B, C, D]) ok(await c.emit('room:join', { code, name: c.name }), 'join');
  bad(await client('x').emit('room:join', { code, name: 'bob' }), 'duplicate name'); // case-insensitive
  await until(() => A.state && A.state.players.length === 4, 'lobby has 4');
  assert.strictEqual(A.state.limits.maxMrWhites, 1, '4 players -> max 1 Mr. White');
  // lobby chat: any player can chat while waiting, everyone receives it
  ok(await B.emit('chat:send', { text: 'hi lobby' }), 'lobby chat');
  await until(() => all.every(c => c.chat.some(m => m.text === 'hi lobby')), 'lobby chat delivered');
  assert.ok(A.chat.some(m => m.system && /joined/.test(m.text)), 'join announcements');
  bad(await A.emit('game:start'), 'start before ready');
  bad(await A.emit('room:settings', { mrWhiteCount: 2 }), 'too many Mr. Whites');
  bad(await B.emit('room:settings', { category: 'Animals' }), 'non-host settings');
  ok(await A.emit('room:settings', { mrWhiteCount: 1, category: 'Fruits' }), 'settings');
  for (const c of [B, C, D]) ok(await c.emit('room:ready', { ready: true }), 'ready');
  const lobbyChatCount = A.chat.length;
  ok(await A.emit('game:start'), 'start');

  // ---- roles & secret privacy ----
  await until(() => all.every(c => c.state.phase === 'role_reveal'), 'role reveal');
  const whites = all.filter(c => c.state.secret.role === 'mrwhite');
  const civs = all.filter(c => c.state.secret.role === 'civilian');
  assert.strictEqual(whites.length, 1); assert.strictEqual(civs.length, 3);
  const word = civs[0].state.secret.word;
  assert.ok(word && civs.every(c => c.state.secret.word === word));
  assert.strictEqual(whites[0].state.secret.word, null);
  const W = whites[0];
  for (const c of all) ok(await c.emit('role:continue'), 'continue');

  // ---- 1 Mr. White: NO typing challenge; no discussion after either word round either ----
  async function playRound(round, dupWord) {
    await until(() => all.every(c => c.state.phase === 'word_round' && c.state.round === round), 'word round ' + round);
    const civIds = civs.map(c => c.state.me.id);
    assert.ok(civIds.includes(A.state.turnOrder[0].id), 'a civilian always takes the first turn');
    for (let i = 0; i < 4; i++) {
      const cur = await until(() => { const id = A.state.currentTurn; return id && all.find(c => c.state.me.id === id && A.state.words.length === (round - 1) * 4 + i && c.state.currentTurn === id); }, 'turn ' + i);
      if (i === 0) assert.ok(civs.includes(cur), 'first speaker is a civilian, never the Mr. White');
      const other = all.find(c => c !== cur);
      bad(await other.emit('word:submit', { word: 'sneaky' + i }), 'out-of-turn submit');
      bad(await cur.emit('word:submit', { word: 'two words' }), 'multi-word');
      if (dupWord) bad(await cur.emit('word:submit', { word: '  ' + dupWord.toUpperCase() + ' ' }), 'duplicate word across rounds');
      ok(await cur.emit('word:submit', { word: `r${round}w${i}` }), 'submit word');
    }
  }
  assert.deepStrictEqual(A.state.typingPlan, { enabled: false, seconds: 0 }, 'typing plan for 1 Mr. White');
  await playRound(1);
  await until(() => all.every(c => c.state.phase === 'cooldown'), 'round 1 goes straight to the cooldown (no typing)');
  assert.strictEqual(A.chat.length, lobbyChatCount, 'no discussion messages yet');
  assert.strictEqual(W.state.myTypingResults, null);

  // ---- cooldown -> Round 2 (duplicates from Round 1 blocked) -> discussion directly ----
  await playRound(2, 'r1w0');
  await until(() => all.every(c => c.state.phase === 'discussion'), 'round 2 goes straight to the discussion (no typing)');
  assert.ok(!all.some(c => c.raw.some(r => r.includes('"phase":"typing"'))), 'typing phase never happened with 1 Mr. White');
  bad(await civs[0].emit('typing:progress', { text: 'x' }), 'no typing challenge exists');
  bad(await W.emit('white:send', { text: 'hi' }), 'no private room with 1 Mr. White');
  ok(await civs[0].emit('chat:send', { text: 'hello everyone' }), 'chat');
  await until(() => all.every(c => c.chat.some(m => m.text === 'hello everyone')), 'chat broadcast');

  // ---- proceed: strict majority = floor(4/2)+1 = 3 ----
  assert.strictEqual(A.state.proceed.needed, 3);
  ok(await A.emit('vote:proceed'), 'agree 1'); ok(await A.emit('vote:proceed'), 'agree dup (idempotent)');
  ok(await B.emit('vote:proceed'), 'agree 2');
  await until(() => A.state.proceed.count === 2, 'count 2'); assert.strictEqual(A.state.phase, 'discussion');
  ok(await C.emit('vote:proceed'), 'agree 3');
  await until(() => all.every(c => c.state.phase === 'voting'), 'voting');

  // ---- mandatory voting ----
  const target = W.state.me.id;
  bad(await A.emit('vote:cast', { targetId: A.state.me.id }), 'self vote');
  bad(await A.emit('vote:cast', { targetId: 'nobody' }), 'invalid target');
  bad(await A.emit('vote:cast', { targetId: null }), 'skip vote');
  const voters = all;
  for (const v of voters) {
    const t = v === W ? civs[0].state.me.id : target;
    ok(await v.emit('vote:cast', { targetId: t }), 'cast vote');
    bad(await v.emit('vote:cast', { targetId: t }), 'second vote');
    if (v !== voters[voters.length - 1]) {
      const peer = all.find(c => c !== v);
      await sleep(60);
      assert.ok(!JSON.stringify(peer.state.voting).includes('targetId'), 'choices hidden');
    }
  }
  await until(() => all.every(c => c.state.phase === 'vote_result'), 'vote result');
  await until(() => A.state.result && A.state.result.eliminated && A.state.result.eliminated.role, 'role revealed');
  assert.strictEqual(A.state.result.eliminated.role, 'mrwhite');
  // Last Mr. White caught -> final guess phase instead of an instant end
  await until(() => all.every(c => c.state.phase === 'mrwhite_guess'), 'final guess phase', 12000);
  bad(await civs[0].emit('guess:submit', { text: word }), 'civilians cannot guess');
  assert.strictEqual(W.state.guess.canGuess, true);
  ok(await W.emit('guess:submit', { text: 'definitely wrong' }), 'Mr. White guess');
  bad(await W.emit('guess:submit', { text: 'second try' }), 'only one guess');
  await until(() => all.every(c => c.state.phase === 'game_over'), 'game over', 12000);
  assert.strictEqual(A.state.reveal.winner, 'civilians');
  assert.strictEqual(A.state.reveal.reason, 'eliminated');
  // suspense: nothing is revealed before its stage
  const seen = civs[0].raw.map(r => JSON.parse(r)).filter(st => st.phase === 'vote_result');
  assert.ok(seen.some(st => st.result.stage === 'counting'), 'counting stage broadcast');
  assert.ok(seen.filter(st => ['counting', 'tally'].includes(st.result.stage)).every(st => !st.result.eliminated), 'no name before the name stage');
  assert.ok(seen.filter(st => st.result.stage === 'name').every(st => st.players.filter(p => !p.alive).every(p => p.role === null)), 'role hidden until its stage');
  assert.ok(seen.some(st => st.result.stage === 'role' && st.players.some(p => p.role === 'mrwhite')), 'role revealed at role stage');
  assert.ok(seen.some(st => st.result.caught) && seen.some(st => st.result.lastChance), 'caught + last chance stages');

  // ---- secret never reached the Mr. White's browser before game over ----
  const leaked = W.raw.filter(r => !r.includes('"phase":"game_over"') && !r.includes('"phase":"guess_reveal"')).some(r => r.includes(word));
  assert.ok(!leaked, 'secret word never sent to Mr. White before game over');
  assert.ok(W.raw.filter(r => !r.includes('"phase":"game_over"') && !r.includes('"phase":"guess_reveal"')).every(r => !r.includes('"secret":{"role":"mrwhite","word":"')), 'no word in MW secret');

  // ---- reset ----
  bad(await B.emit('game:reset'), 'non-host reset');
  ok(await A.emit('game:reset'), 'reset');
  await until(() => A.state.phase === 'lobby', 'back to lobby');
  console.log('ALL TESTS PASSED  (secret word: ' + word + ')');
  all.forEach(c => c.s.close()); server.close(); process.exit(0);
})().catch(err => { console.error('TEST FAILED:', err.message); process.exit(1); });
