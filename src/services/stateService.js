// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
/**
 * Builds the per-player view of a room. This is the ONLY place game data is serialized for
 * clients, which is what keeps secrets private: the secret word is only included for civilians,
 * roles of other players only after elimination / game over, and the Mr. White chat only for
 * living Mr. Whites during the typing challenge.
 */
const rooms = require('./roomService');
const wordService = require('./wordService');
const gameService = require('./gameService');

function viewFor(room, viewer) {
  const g = room.game;
  const over = room.phase === 'game_over';
  const shown = g ? g.stagesShown || [] : [];
  // During the suspense reveal the freshly eliminated player's role stays hidden until the 'role' stage.
  const roleHidden = id => room.phase === 'vote_result' && g.lastResult && g.lastResult.eliminated &&
    g.lastResult.eliminated.id === id && !shown.includes('role');
  const view = {
    serverNow: Date.now(),
    code: room.code,
    phase: room.phase,
    phaseEndsAt: room.phaseEndsAt,
    hostId: room.hostId,
    me: { id: viewer.id, name: viewer.name, alive: viewer.alive, isHost: viewer.id === room.hostId, ready: viewer.id === room.hostId || viewer.ready },
    settings: room.settings,
    typingPlan: (() => { const t = gameService.typingPlan(room.settings.mrWhiteCount); return { enabled: t.enabled, seconds: Math.round(t.ms / 1000) }; })(),
    categories: wordService.categoryNames(),
    limits: { minPlayers: rooms.MIN_PLAYERS, maxPlayers: rooms.MAX_PLAYERS, maxMrWhites: rooms.maxMrWhites(room.players.length) },
    players: room.players.map(p => ({
      id: p.id, name: p.name, connected: p.connected, isHost: p.id === room.hostId,
      ready: p.id === room.hostId || p.ready, alive: p.alive,
      role: g && (over || !p.alive) && !roleHidden(p.id) ? p.role : null
    })),
    chat: room.chat
  };
  if (!g) return view;

  view.secret = viewer.role === 'civilian'
    ? { role: 'civilian', word: g.secretWord }
    : { role: 'mrwhite', word: null };
  view.round = g.round;
  view.turnOrder = g.order.map(id => ({ id, name: room.players.find(p => p.id === id).name }));
  view.currentTurn = g.currentTurn;
  view.words = g.words.map(w => ({ round: w.round, playerId: w.playerId, name: w.name, word: w.word }));
  view.myTypingResults = g.typingResults[viewer.id] || null; // private to this player

  if (room.phase === 'role_reveal') view.roleConfirmed = [...g.roleConfirmed];

  if (room.phase === 'typing') {
    const t = g.typing;
    if (viewer.alive && viewer.role === 'civilian') {
      view.typing = {
        kind: 'civilian', index: t.index, startedAt: t.startedAt, endsAt: t.endsAt,
        passage: t.passages[viewer.id], typed: t.inputs[viewer.id] || '', finished: !!t.finished[viewer.id]
      };
    } else if (viewer.alive && viewer.role === 'mrwhite') {
      const whites = room.players.filter(p => p.alive && p.role === 'mrwhite');
      view.typing = {
        kind: 'mrwhite', index: t.index, startedAt: t.startedAt, endsAt: t.endsAt,
        solo: whites.length < 2, members: whites.map(p => ({ id: p.id, name: p.name })), chat: g.whiteChat
      };
    } else {
      view.typing = { kind: 'spectator', index: t.index, startedAt: t.startedAt, endsAt: t.endsAt };
    }
  }

  if (room.phase === 'discussion') view.proceed = { ...gameService.proceedInfo(room), iAgreed: g.agree.has(viewer.id) };

  if (room.phase === 'voting') {
    view.voting = {
      round: g.voteRound,
      candidates: g.candidates.map(id => ({ id, name: room.players.find(p => p.id === id).name })),
      voters: room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name, voted: !!g.votes[p.id], connected: p.connected })),
      iVoted: !!g.votes[viewer.id]
      // Individual choices are never included until the vote concludes.
    };
  }

  if (room.phase === 'vote_result' && g.lastResult) {
    // Progressive reveal: only what the server has already shown on screen is sent.
    const r = g.lastResult;
    view.result = {
      stage: g.stage,
      rows: shown.includes('tally') ? r.rows : null,
      tie: shown.includes('tie'),
      tied: shown.includes('tie') ? r.rows.filter(x => r.tiedIds.includes(x.id)).map(x => x.name) : null,
      eliminated: shown.includes('name')
        ? { id: r.eliminated.id, name: r.eliminated.name, role: shown.includes('role') ? r.eliminated.role : null }
        : null,
      caught: shown.includes('caught'),
      lastChance: shown.includes('lastchance'),
      outnumbered: shown.includes('outnumbered')
    };
  }

  if (room.phase === 'mrwhite_guess') {
    const mine = g.guesses[viewer.id];
    view.guess = {
      endsAt: room.phaseEndsAt,
      canGuess: viewer.role === 'mrwhite',
      decisive: g.lastResult.winner === 'civilians', // false when the Mr. Whites already won by numbers
      iGuessed: !!mine,
      myGuess: mine ? mine.text : null,
      done: Object.keys(g.guesses).length,
      total: room.players.filter(p => p.role === 'mrwhite').length
    };
  }

  if (room.phase === 'guess_reveal') {
    const showGuesses = shown.includes('guesses') || shown.includes('verdict');
    const verdict = shown.includes('verdict');
    view.guessReveal = {
      stage: g.stage,
      decisive: g.lastResult.winner === 'civilians',
      guesses: showGuesses ? Object.values(g.guesses).map(x => ({ name: x.name, text: x.text, correct: verdict ? x.correct : null })) : null,
      word: verdict ? g.secretWord : null,
      won: verdict ? g.guessWon : null
    };
  }

  if (over) {
    view.result = g.lastResult;
    view.reveal = {
      word: g.secretWord, category: room.settings.category, winner: g.winner, reason: g.winReason,
      eliminated: g.eliminated,
      guesses: Object.values(g.guesses || {}).map(x => ({ name: x.name, text: x.text, correct: x.correct }))
    };
  }
  return view;
}

module.exports = { viewFor };
