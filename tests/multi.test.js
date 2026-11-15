// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/* 6 players / 2 Mr. Whites (short typing challenge): private room, tie revote, continuing game, dynamic win, reconnect. */
process.env.TYPING_SECONDS = '2';        // 4+ Mr. Whites
process.env.TYPING_SHORT_SECONDS = '1';  // 2-3 Mr. Whites
process.env.COOLDOWN_SECONDS = '1';
process.env.STAGE_SCALE = '0.02';
process.env.GUESS_SECONDS = '3';
process.env.PORT = '4598';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server, ready } = require('../server');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const s = io('http://localhost:4598', { transports: ['websocket'], forceNew: true });
  const c = { name, s, state: null, chat: [], white: [] };
  s.on('state', st => { c.state = st; });
  s.on('chat:message', m => c.chat.push(m));
  s.on('white:message', m => c.white.push(m));
  c.emit = (ev, p) => new Promise(res => s.emit(ev, p || {}, res));
  return c;
}
async function until(fn, label, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('Timed out waiting for: ' + label);
}
const ok = (r, m) => assert.ok(r && r.ok, m + ' -> ' + JSON.stringify(r));
const bad = (r, m) => assert.ok(r && r.ok === false, 'expected failure: ' + m);

(async () => {
  await ready;
  const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const all = names.map(client);
  await until(() => all.every(c => c.s.connected), 'connect');
  const [host, ...rest] = all;
  const created = await host.emit('room:create', { name: host.name });
  const code = created.code;
  host.token = created.token;
  for (const c of rest) { const r = await c.emit('room:join', { code, name: c.name }); ok(r, 'join'); c.token = r.token; }
  await until(() => host.state.players.length === 6, 'six players');
  assert.strictEqual(host.state.limits.maxMrWhites, 2, '6 players -> up to 2 Mr. Whites');
  bad(await host.emit('room:settings', { mrWhiteCount: 3 }), '3 of 6 not allowed');
  ok(await host.emit('room:settings', { mrWhiteCount: 2 }), '2 Mr. Whites');
  for (const c of rest) await c.emit('room:ready', { ready: true });
  ok(await host.emit('game:start'), 'start');
  await until(() => all.every(c => c.state.phase === 'role_reveal'), 'roles');
  const whites = all.filter(c => c.state.secret.role === 'mrwhite');
  const civs = all.filter(c => c.state.secret.role === 'civilian');
  assert.strictEqual(whites.length, 2); assert.strictEqual(civs.length, 4);
  for (const c of all) await c.emit('role:continue');

  assert.deepStrictEqual(host.state.typingPlan, { enabled: true, seconds: 1 }, '2 Mr. Whites -> the short (1 minute) typing challenge');
  async function words(round) {
    await until(() => all.every(c => c.state.phase === 'word_round' && c.state.round === round), 'round ' + round);
    assert.ok(civs.some(c => c.state.me.id === host.state.turnOrder[0].id), 'a civilian always goes first');
    for (let i = 0; i < 6; i++) {
      const n = (round - 1) * 6 + i;
      const cur = await until(() => all.find(c => c.state.currentTurn === c.state.me.id && c.state.words.length === n), 'turn');
      ok(await cur.emit('word:submit', { word: `x${round}${i}` }), 'word');
    }
  }
  await words(1);
  await until(() => all.every(c => c.state.phase === 'typing'), 'typing 1');
  // Private room: both Mr. Whites see members + can talk; civilians never receive anything
  assert.ok(whites.every(w => w.state.typing.kind === 'mrwhite' && !w.state.typing.solo && w.state.typing.members.length === 2));
  const pass1 = civs.map(c => c.state.typing.passage);
  assert.strictEqual(new Set(pass1).size, 4, 'each civilian has a different passage');
  assert.ok(pass1.every(x => x.length > 700), 'passages are long');
  assert.strictEqual(civs[0].state.typing.endsAt - civs[0].state.typing.startedAt, 1000, '2 Mr. Whites -> short typing timer');
  assert.ok(civs.every(c => c.state.typing.kind === 'civilian' && !('chat' in c.state.typing)));
  ok(await whites[0].emit('white:send', { text: 'is it a fruit?' }), 'white chat');
  await until(() => whites[1].white.some(m => m.text === 'is it a fruit?'), 'white 2 receives');
  assert.ok(civs.every(c => c.white.length === 0), 'civilians received no Mr. White messages');
  assert.ok(whites.every(w => JSON.stringify(w.state).indexOf('"passage"') === -1), 'Mr. Whites never see passages');
  await until(() => all.every(c => c.state.phase === 'cooldown'), 'cooldown');
  await words(2);
  await until(() => all.every(c => c.state.phase === 'typing' && c.state.typing.index === 2), 'typing 2');
  assert.ok(whites[0].state.typing.chat.some(m => m.text === 'is it a fruit?'), 'private chat history preserved for 2nd challenge');
  civs.forEach((c, i) => assert.notStrictEqual(c.state.typing.passage, pass1[i], 'second passage differs from the first'));
  await until(() => all.every(c => c.state.phase === 'discussion'), 'discussion');

  // Reconnection restores the same state
  const victim = civs[3];
  victim.s.close();
  await until(() => host.state.players.find(p => p.id === victim.state.me.id && !p.connected), 'disconnect seen');
  const re = client('P-re');
  await until(() => re.s.connected, 'reconnect socket');
  ok(await re.emit('room:rejoin', { code, token: victim.token }), 'rejoin');
  await until(() => re.state && re.state.phase === 'discussion' && re.state.secret.role === 'civilian', 'state restored');
  victim.s = re.s;
  victim.emit = re.emit; // route the player's later actions through the new socket
  re.s.on('state', st => { victim.state = st; });
  victim.state = re.state;

  async function proceedAll() {
    for (const c of all.filter(x => x.state.me.alive)) await c.emit('vote:proceed');
    await until(() => all.every(c => c.state.phase === 'voting'), 'voting');
  }
  const id = c => c.state.me.id;

  // ---- tie: 3 vs 3 between civs[0] and civs[1] ----
  await proceedAll();
  const A = civs[0], B = civs[1];
  const voteFor = (voter, target) => voter.emit('vote:cast', { targetId: id(target) });
  const others = all.filter(c => c !== A && c !== B);
  ok(await voteFor(others[0], A), 'O1->A'); ok(await voteFor(others[1], A), 'O2->A'); ok(await voteFor(B, A), 'B->A');
  ok(await voteFor(others[2], B), 'O3->B'); ok(await voteFor(others[3], B), 'O4->B'); ok(await voteFor(A, B), 'A->B');
  await until(() => all.every(c => c.state.phase === 'vote_result'), 'tie result');
  await until(() => host.state.phase === 'vote_result' && host.state.result.tie, 'tie announced');
  assert.strictEqual(host.state.result.eliminated, null, 'nobody eliminated on a tie');
  await until(() => all.every(c => c.state.phase === 'voting' && c.state.voting.round === 2), 'automatic revote', 12000);
  assert.deepStrictEqual(host.state.voting.candidates.map(c => c.id).sort(), [id(A), id(B)].sort(), 'only tied players selectable');
  bad(await voteFor(others[0], whites[0]), 'revote for non-tied player');
  bad(await voteFor(A, A), 'tied player self vote');
  // Eliminate civilian A (everyone votes A except A votes B)
  for (const v of all) ok(await voteFor(v, v === A ? B : A), 'revote');
  await until(() => all.every(c => c.state.phase === 'vote_result'), 'elimination result');
  await until(() => host.state.phase === 'vote_result' && host.state.result.eliminated, 'elimination named');
  assert.strictEqual(host.state.result.eliminated.id, id(A));
  await until(() => all.every(c => c.state.phase === 'discussion'), 'back to discussion', 12000);
  assert.strictEqual(host.state.proceed.total, 5, 'eliminated player no longer counted');

  // Eliminated players: read-only, cannot vote or reach private rooms
  bad(await A.emit('chat:send', { text: 'ghost' }), 'eliminated chat');
  bad(await A.emit('vote:proceed'), 'eliminated proceed');
  const alive = all.filter(c => c !== A);
  for (const c of alive) await c.emit('vote:proceed');
  await until(() => alive.every(c => c.state.phase === 'voting'), 'voting 2');
  bad(await A.emit('vote:cast', { targetId: id(whites[0]) }), 'eliminated vote');
  // Eliminate another civilian -> 2 MW vs 2 civ -> Mr. Whites win
  const nextCiv = civs.find(c => c !== A && c !== B);
  for (const v of alive) ok(await voteFor(v, v === nextCiv ? B : nextCiv), 'vote 3');
  await until(() => alive.every(c => c.state.phase === 'vote_result'), 'result 3');
  await until(() => host.state.phase === 'vote_result' && host.state.result.outnumbered, 'outnumbered announced');
  // Mr. Whites win by numbers, and STILL get the final guess (which cannot change the result)
  await until(() => all.every(c => c.state.phase === 'mrwhite_guess'), 'guess phase after outnumbering', 12000);
  assert.strictEqual(whites[0].state.guess.canGuess, true);
  assert.strictEqual(whites[0].state.guess.decisive, false, 'guess is not decisive when already won');
  assert.strictEqual(whites[0].state.guess.total, 2);
  bad(await civs[0].emit('guess:submit', { text: 'x' }), 'civilian guess');
  ok(await whites[0].emit('guess:submit', { text: 'wrong answer' }), 'first MW guess');
  ok(await whites[1].emit('guess:submit', { text: civs[0].state.secret.word.toLowerCase() }), 'second MW guess (correct)');
  await until(() => all.every(c => c.state.phase === 'game_over'), 'game over', 12000);
  assert.strictEqual(host.state.reveal.winner, 'mrwhite');
  assert.strictEqual(host.state.reveal.reason, 'outnumbered');
  assert.deepStrictEqual(host.state.reveal.guesses.map(x => x.correct).sort(), [false, true]);
  console.log('MULTI TESTS PASSED');
  all.forEach(c => c.s.close()); server.close(); process.exit(0);
})().catch(err => { console.error('TEST FAILED:', err.message); process.exit(1); });
