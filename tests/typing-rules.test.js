// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/* 9 players: the typing rule for every Mr. White count, and the long (4+ Mr. Whites) challenge. */
process.env.TYPING_SECONDS = '2';        // stands in for 2 minutes
process.env.TYPING_SHORT_SECONDS = '1';  // stands in for 1 minute
process.env.COOLDOWN_SECONDS = '1';
process.env.PORT = '4596';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server, ready } = require('../server');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const s = io('http://localhost:4596', { transports: ['websocket'], forceNew: true });
  const c = { name, s, state: null };
  s.on('state', st => { c.state = st; });
  c.emit = (ev, p) => new Promise(res => s.emit(ev, p || {}, res));
  return c;
}
async function until(fn, label, ms = 25000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); }
  throw new Error('Timed out waiting for: ' + label);
}
const ok = (r, m) => assert.ok(r && r.ok, m + ' -> ' + JSON.stringify(r));

(async () => {
  await ready;
  const all = [...Array(9)].map((_, i) => client('P' + (i + 1)));
  await until(() => all.every(c => c.s.connected), 'connect');
  const host = all[0];
  const created = await host.emit('room:create', { name: 'P1' });
  for (const c of all.slice(1)) ok(await c.emit('room:join', { code: created.code, name: c.name }), 'join');
  await until(() => host.state.players.length === 9, 'nine players');
  assert.strictEqual(host.state.limits.maxMrWhites, 4);

  // The rule shown in the lobby for each Mr. White count
  const expect = { 1: { enabled: false, seconds: 0 }, 2: { enabled: true, seconds: 1 }, 3: { enabled: true, seconds: 1 }, 4: { enabled: true, seconds: 2 } };
  for (const n of [1, 2, 3, 4]) {
    ok(await host.emit('room:settings', { mrWhiteCount: n }), 'set ' + n);
    await until(() => host.state.settings.mrWhiteCount === n && all[8].state.settings.mrWhiteCount === n, 'settings synced');
    assert.deepStrictEqual(host.state.typingPlan, expect[n], 'typing plan for ' + n + ' Mr. White(s)');
    assert.deepStrictEqual(all[8].state.typingPlan, expect[n], 'players see the same rule');
  }

  // Play with 4 Mr. Whites: the typing challenge uses the long timer; a civilian goes first
  for (const c of all.slice(1)) ok(await c.emit('room:ready', { ready: true }), 'ready');
  ok(await host.emit('game:start'), 'start');
  await until(() => all.every(c => c.state.phase === 'role_reveal'), 'roles');
  const civs = all.filter(c => c.state.secret.role === 'civilian');
  assert.strictEqual(civs.length, 5);
  for (const c of all) await c.emit('role:continue');
  await until(() => all.every(c => c.state.phase === 'word_round'), 'round 1');
  assert.ok(civs.some(c => c.state.me.id === host.state.turnOrder[0].id), 'a civilian goes first');
  for (let i = 0; i < 9; i++) {
    const cur = await until(() => all.find(c => c.state.currentTurn === c.state.me.id && c.state.words.length === i), 'turn ' + i);
    ok(await cur.emit('word:submit', { word: 'w' + i }), 'word');
  }
  await until(() => all.every(c => c.state.phase === 'typing'), 'typing starts');
  const t = civs[0].state.typing;
  assert.strictEqual(t.endsAt - t.startedAt, 2000, '4 Mr. Whites -> long typing timer');
  const whites = all.filter(c => !civs.includes(c));
  assert.ok(whites.every(w => w.state.typing.kind === 'mrwhite' && w.state.typing.members.length === 4 && !w.state.typing.solo));
  console.log('TYPING RULE TESTS PASSED');
  all.forEach(c => c.s.close()); server.close(); process.exit(0);
})().catch(err => { console.error('TEST FAILED:', err.message); process.exit(1); });
