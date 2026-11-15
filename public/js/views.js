// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
/* Text-only view templates. Each function returns an HTML string. */
(function () {
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var time = function (ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  var up = function (s) { return esc(String(s).toUpperCase()); };
  var roleLabel = function (r) { return r === 'mrwhite' ? 'MR. WHITE' : 'CIVILIAN'; };

  function shell(inner, s, wide) {
    var meta = s ? 'ROOM ' + esc(s.code) + ' &middot; ' + esc(s.me.name) : '';
    return '<header class="topbar"><span class="brand">MR. WHITE</span><span class="topmeta">' + meta + '</span></header>' +
      '<main class="container' + (wide ? ' wide' : '') + '">' + inner + '</main>';
  }

  /* ---------- pre-room screens ---------- */
  function home() {
    return shell(
      '<div class="hero center"><h1>MR. WHITE</h1><p class="tag">A multiplayer social deduction game.</p>' +
      ((window.GAME_INFO && window.GAME_INFO.owner) ? '<p class="muted small">Created by ' + esc(window.GAME_INFO.owner) + '</p>' : '') +
      '<div class="menu">' +
      '<button class="primary" data-action="goCreate">Create Room</button>' +
      '<button data-action="goJoin">Join Room</button>' +
      '<button data-action="goHow">How to Play</button></div></div>' +
      '<div class="panel"><h3>The idea</h3><p>Civilians share a secret word and give clues about it. Mr. Whites do not know the word and must bluff. ' +
      'Find every Mr. White before they equal the number of civilians.</p></div>');
  }

  function create() {
    return shell('<h2>Create Room</h2><div class="panel"><div class="field"><label class="label" for="nameInput">Display name</label>' +
      '<input type="text" id="nameInput" maxlength="20" autocomplete="off" data-enter="create"></div>' +
      '<button class="primary block" data-action="create">Create Room</button></div>' +
      '<button data-action="goHome">Back</button>');
  }

  function join() {
    return shell('<h2>Join Room</h2><div class="panel"><div class="field"><label class="label" for="codeInput">Room code</label>' +
      '<input type="text" id="codeInput" maxlength="8" autocomplete="off" autocapitalize="characters" data-enter="join" style="text-transform:uppercase"></div>' +
      '<div class="field"><label class="label" for="nameInput">Display name</label>' +
      '<input type="text" id="nameInput" maxlength="20" autocomplete="off" data-enter="join"></div>' +
      '<button class="primary block" data-action="join">Join Room</button></div>' +
      '<button data-action="goHome">Back</button>');
  }

  function how() {
    return shell('<h2>How to Play</h2>' +
      '<div class="panel stack"><h3>Teams</h3>' +
      '<p><b>Civilians</b> receive the secret word. Mr. Whites do not, and must pretend they do.</p>' +
      '<h3>Round flow</h3>' +
      '<p>1. <b>Round 1:</b> each player submits one word related to the secret word. A civilian always goes first.</p>' +
      '<p>2. <b>Typing challenge:</b> civilians type a long passage (finishing is not required) while Mr. Whites meet in a private room. It lasts 2 minutes with 4 or more Mr. Whites, 1 minute with 2 or 3, and is skipped when there is only one Mr. White.</p>' +
      '<p>3. A five second countdown.</p>' +
      '<p>4. <b>Round 2:</b> another word from every player. Words cannot be repeated.</p>' +
      '<p>5. <b>Second typing challenge,</b> with the same split and length.</p>' +
      '<p>6. <b>Discussion:</b> unlimited time. Accuse, defend and share theories.</p>' +
      '<p>7. <b>Voting:</b> everyone must vote. No skipping, no self-votes. Ties are re-voted between the tied players.</p>' +
      '<p>8. <b>Final guess:</b> when the game ends, every Mr. White gets one guess at the secret word. If the civilians caught them all, a correct guess steals the win.</p>' +
      '<h3>Winning</h3>' +
      '<p>Civilians win when every Mr. White is eliminated and no Mr. White guesses the word. Mr. Whites win when they equal or outnumber the civilians, or by guessing the word after being caught.</p></div>' +
      '<button data-action="goHome">Back</button>');
  }

  /* ---------- room screens ---------- */
  function lobby(s) {
    var isHost = s.me.isHost, n = s.players.length, max = s.limits.maxMrWhites;
    var allReady = s.players.every(function (p) { return p.ready; });
    var allConnected = s.players.every(function (p) { return p.connected; });
    var reason = '';
    if (n < s.limits.minPlayers) reason = 'At least ' + s.limits.minPlayers + ' players are required.';
    else if (!allReady) reason = 'Waiting for all players to be ready.';
    else if (!allConnected) reason = 'Waiting for a disconnected player to return or be removed.';

    var players = s.players.map(function (p) {
      var tags = '';
      if (p.isHost) tags += '<span class="tag-pill warn">HOST</span> ';
      tags += !p.connected ? '<span class="tag-pill bad">DISCONNECTED</span>' : p.ready ? '<span class="tag-pill good">READY</span>' : '<span class="tag-pill">NOT READY</span>';
      var kick = isHost && !p.isHost ? ' <button class="small-btn danger" data-action="kick" data-id="' + p.id + '">Remove</button>' : '';
      return '<li><span>' + esc(p.name) + (p.id === s.me.id ? ' <span class="muted">(you)</span>' : '') + '</span><span class="row">' + tags + kick + '</span></li>';
    }).join('');

    var settings;
    if (isHost) {
      var mwOpts = '';
      for (var i = 1; i <= max; i++) mwOpts += '<option value="' + i + '"' + (i === s.settings.mrWhiteCount ? ' selected' : '') + '>' + i + '</option>';
      var catOpts = s.categories.map(function (c) { return '<option' + (c === s.settings.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      settings = '<div class="field"><label class="label" for="mwSel">Number of Mr. Whites</label>' +
        (max >= 1 ? '<select id="mwSel" data-change="settings">' + mwOpts + '</select>' : '<p class="muted">Available once there are at least ' + s.limits.minPlayers + ' players.</p>') + '</div>' +
        '<div class="field"><label class="label" for="catSel">Word category</label><select id="catSel" data-change="settings">' + catOpts + '</select></div>';
    } else {
      settings = '<p>Mr. Whites: <b>' + s.settings.mrWhiteCount + '</b></p><p>Category: <b>' + esc(s.settings.category) + '</b></p>';
    }

    var tp = s.typingPlan;
    var dur = tp.seconds % 60 === 0 ? (tp.seconds / 60) + (tp.seconds === 60 ? ' minute' : ' minutes') : tp.seconds + ' seconds';
    settings += '<p class="muted small">Typing challenge: <b>' + (tp.enabled ? dur : 'none') + '</b>. None with 1 Mr. White, 1 minute with 2 to 3, 2 minutes with 4 or more.</p>';

    var action = isHost
      ? '<button class="primary block" data-action="start"' + (reason ? ' disabled' : '') + '>Start Game</button>' + (reason ? '<p class="muted small center">' + reason + '</p>' : '')
      : '<button class="primary block" data-action="ready">' + (s.me.ready ? 'Not Ready' : 'I Am Ready') + '</button>';

    var main = ('<div class="panel center"><p class="label">Room code</p><div class="code">' + esc(s.code) + '</div>' +
      '<button class="small-btn" data-action="copy">Copy Room Code</button></div>' +
      '<div class="panel"><div class="row between"><h3>Players</h3><span class="muted small">' + n + ' CONNECTED</span></div><ul class="list">' + players + '</ul></div>' +
      '<div class="panel"><h3>Game settings</h3>' + settings + '</div>' + action +
      '<p class="center" style="margin-top:16px"><button class="small-btn" data-action="leave">Leave Room</button></p>');
    var side = '<div class="panel"><h3>Lobby chat</h3><div class="chat tall" id="chatLog">' + s.chat.map(msgHtml).join('') + '</div>' +
      '<div class="chat-form"><input type="text" id="chatInput" maxlength="300" autocomplete="off" data-enter="sendChat" placeholder="Say something while you wait...">' +
      '<button class="primary" data-action="sendChat">Send</button></div></div>';
    return shell('<div class="lobby-grid"><div class="lobby-main">' + main + '</div><aside class="lobby-side">' + side + '</aside></div>', s, true);
  }

  function roleReveal(s) {
    var sec = s.secret, confirmed = s.roleConfirmed || [], me = confirmed.indexOf(s.me.id) !== -1;
    var body = sec.role === 'civilian'
      ? '<p class="label">Your role</p><div class="role civ">CIVILIAN</div><p class="label">Category: ' + up(s.settings.category) + '</p>' +
        '<p class="label">Secret word</p><div class="secret">' + esc(sec.word) + '</div><p>Your objective is to identify the Mr. Whites.</p>'
      : '<p class="label">Your role</p><div class="role mw">MR. WHITE</div><p class="label">Category: ' + up(s.settings.category) + '</p>' +
        '<p style="margin-top:16px">You do not know the secret word.</p><p>Blend in. Listen carefully. Avoid suspicion.</p>';
    var wait = me ? '<p class="muted">WAITING FOR OTHER PLAYERS (' + confirmed.length + ' / ' + s.players.filter(function (p) { return p.alive; }).length + ')</p>' : '';
    return shell('<div class="panel center" style="padding:36px 18px">' + body + '</div>' +
      (me ? wait : '<button class="primary block" data-action="cont">Continue</button>'), s);
  }

  function wordsPanel(s) {
    var out = '';
    [1, 2].forEach(function (r) {
      var list = s.words.filter(function (w) { return w.round === r; });
      if (!list.length) return;
      out += '<h3>Round ' + r + ' words</h3><ul class="list">' +
        list.map(function (w) { return '<li><span>' + esc(w.name) + '</span><b>' + esc(w.word) + '</b></li>'; }).join('') + '</ul>';
    });
    return out ? '<div class="panel">' + out + '</div>' : '';
  }

  function wordRound(s) {
    var myTurn = s.currentTurn === s.me.id && s.me.alive;
    var cur = s.turnOrder.filter(function (p) { return p.id === s.currentTurn; })[0];
    var order = s.turnOrder.map(function (p, i) {
      var w = s.words.filter(function (x) { return x.round === s.round && x.playerId === p.id; })[0];
      var status = w ? '<b>' + esc(w.word) + '</b>' : p.id === s.currentTurn ? '<span class="tag-pill good">CURRENT TURN</span>' : '<span class="muted small">WAITING</span>';
      return '<li class="' + (p.id === s.currentTurn ? 'current' : '') + '"><span>PLAYER ' + (i + 1) + ' &middot; ' + esc(p.name) + '</span>' + status + '</li>';
    }).join('');
    var turn = myTurn
      ? '<div class="panel"><h3>Your turn</h3><p>Enter one word related to the secret word.</p>' +
        '<div class="chat-form"><input type="text" id="wordInput" maxlength="30" autocomplete="off" autocapitalize="off" data-enter="submitWord">' +
        '<button class="primary" data-action="submitWord">Submit Word</button></div></div>'
      : '<div class="panel center"><p class="label">Waiting for</p><div class="name" style="font-size:26px;font-weight:700">' + esc(cur ? cur.name : '...') + '</div></div>';
    return shell('<h2>Round ' + s.round + ' of 2</h2>' + turn + '<div class="panel"><h3>Turn order</h3><ul class="list">' + order + '</ul></div>' +
      (s.round === 2 ? wordsPanel(s) : ''), s);
  }

  function typing(s) {
    var t = s.typing;
    var head = '<h2>Typing Challenge ' + t.index + ' of 2</h2><div class="timer" data-countdown="' + t.endsAt + '" data-fmt="clock"></div>';
    if (t.kind === 'civilian') {
      var live = Typing.computeStats(t.passage, t.typed, Math.max(0, Math.min((t.endsAt - t.startedAt) / 1000, (Date.now() + App.offset - t.startedAt) / 1000)));
      return shell(head + '<p class="muted center">Type the passage below exactly as shown. It is long, so just type as far as you can before time runs out.</p>' +
        '<div class="passage" id="passage">' + Typing.paintPassage(t.passage, t.typed) + '</div>' +
        '<textarea id="typingInput" rows="4" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"' + (t.finished ? ' disabled' : '') +
        ' placeholder="Start typing here...">' + esc(t.typed) + '</textarea>' +
        '<div class="stats"><div><b id="statWpm">' + live.wpm + '</b><span>WPM</span></div><div><b id="statAcc">' + live.accuracy + '%</b><span>ACCURACY</span></div><div><b id="statErr">' + live.errors + '</b><span>ERRORS</span></div></div>' +
        '<p class="center muted" id="typingNote">' + (t.finished ? 'FINISHED. WAIT FOR THE TIMER TO END.' : 'Not finishing is fine. The challenge ends when the timer does.') + '</p>', s);
    }
    if (t.kind === 'mrwhite') {
      var clues = wordsPanel(s);
      if (t.solo) {
        return shell(head + '<div class="panel center"><h3>Mr. White waiting room</h3><p>You are the only Mr. White.</p><p class="muted">Review the clues below and think about your next word. The game resumes when the timer ends.</p></div>' + clues, s);
      }
      var members = t.members.map(function (m) { return esc(m.name); }).join(', ');
      return shell(head + '<div class="panel"><h3>Private Mr. White room</h3><p class="muted small">Members: ' + members + '. Civilians cannot see this room.</p>' +
        '<div class="chat" id="whiteLog">' + t.chat.map(msgHtml).join('') + '</div>' +
        '<div class="chat-form"><input type="text" id="whiteInput" maxlength="300" autocomplete="off" data-enter="sendWhite"><button class="primary" data-action="sendWhite">Send</button></div></div>' + clues, s);
    }
    return shell(head + '<div class="panel center"><p>You have been eliminated. Spectating until the challenge ends.</p></div>', s);
  }

  function cooldown(s) {
    return shell('<div class="center" style="padding-top:48px"><p class="label">Next round starting in</p>' +
      '<div class="timer big" data-countdown="' + s.phaseEndsAt + '" data-fmt="int"></div></div>' + typingResults(s), s);
  }

  function typingResults(s) {
    var r = s.myTypingResults;
    if (!r || !r.length) return '';
    return '<div class="panel"><h3>Your typing results</h3>' + r.map(function (x, i) {
      return x ? '<div class="bar-row"><span>Challenge ' + (i + 1) + '</span><span>' + x.wpm + ' WPM &middot; ' + x.accuracy + '% accuracy &middot; ' + x.errors + ' errors</span></div>' : '';
    }).join('') + '</div>';
  }

  function msgHtml(m) {
    if (m.system) return '<div class="msg system">' + esc(m.text) + '</div>';
    return '<div class="msg"><span class="who">' + esc(m.name) + '</span>' + esc(m.text) + '<span class="ts">' + time(m.ts) + '</span></div>';
  }

  function playersPanel(s) {
    return '<div class="panel"><h3>Players</h3><ul class="list">' + s.players.map(function (p) {
      var name = p.alive ? esc(p.name) : '<span class="eliminated-name">' + esc(p.name) + '</span>';
      var tag = !p.alive ? '<span class="tag-pill bad">ELIMINATED &middot; ' + roleLabel(p.role) + '</span>' : !p.connected ? '<span class="tag-pill bad">DISCONNECTED</span>' : '<span class="tag-pill good">ACTIVE</span>';
      return '<li><span>' + name + '</span>' + tag + '</li>';
    }).join('') + '</ul></div>';
  }

  function discussion(s) {
    var p = s.proceed;
    var canSpeak = s.me.alive;
    var form = canSpeak
      ? '<div class="chat-form"><input type="text" id="chatInput" maxlength="300" autocomplete="off" data-enter="sendChat" placeholder="Type a message..."><button class="primary" data-action="sendChat">Send</button></div>'
      : '<p class="muted small">You have been eliminated. You are spectating (read only).</p>';
    var proceed = canSpeak
      ? '<button class="primary block" data-action="proceed"' + (p.iAgreed ? ' disabled' : '') + '>' + (p.iAgreed ? 'Waiting for others' : 'Proceed to Voting') + '</button>'
      : '';
    return shell('<h2>Discussion</h2><p class="muted">No time limit. Discuss freely, then proceed to voting.</p>' +
      '<div class="panel"><div class="chat" id="chatLog">' + s.chat.map(msgHtml).join('') + '</div>' + form + '</div>' +
      '<div class="panel center"><p class="label">Votes to proceed</p><div class="secret" style="margin:4px 0;font-size:28px">' + p.count + ' / ' + p.total + ' PLAYERS AGREED</div>' +
      '<p class="muted small">' + p.needed + ' needed to start voting</p>' + proceed + '</div>' +
      wordsPanel(s) + typingResults(s) + playersPanel(s), s);
  }

  function voting(s) {
    var v = s.voting, myId = s.me.id;
    var tieNote = v.round > 1 ? '<p class="tag-pill warn">REVOTE &middot; ONLY TIED PLAYERS CAN BE SELECTED</p>' : '';
    var voters = '<div class="panel"><h3>Voting status</h3><ul class="list">' + v.voters.map(function (x) {
      return '<li><span>' + esc(x.name) + '</span>' + (x.voted ? '<span class="tag-pill good">VOTED</span>' : '<span class="tag-pill">WAITING</span>') + '</li>';
    }).join('') + '</ul></div>';
    if (!s.me.alive) return shell('<h2>Voting</h2><div class="panel center"><p>You have been eliminated. Spectating.</p></div>' + voters, s);
    if (v.iVoted) return shell('<h2>Vote submitted</h2><p class="muted">Waiting for the remaining players. Votes stay private until everyone has voted.</p>' + voters, s);
    var options = v.candidates.filter(function (c) { return c.id !== myId; }).map(function (c) {
      var checked = App.selectedVote === c.id;
      return '<label class="vote-option' + (checked ? ' checked' : '') + '"><input type="radio" name="vote" value="' + c.id + '"' + (checked ? ' checked' : '') + '>' + esc(c.name) + '</label>';
    }).join('');
    return shell('<h2>Who do you suspect is Mr. White?</h2>' + tieNote + '<div class="panel">' + options + '</div>' +
      '<button class="primary block" id="voteBtn" data-action="castVote"' + (App.selectedVote ? '' : ' disabled') + '>Confirm Vote</button>' + voters, s);
  }

  function resultRows(r) {
    return '<div class="panel"><h3>Vote results</h3>' + r.rows.map(function (x) {
      return '<div class="bar-row"><span>' + esc(x.name) + (x.voters.length ? '<span class="muted small"> &middot; ' + x.voters.map(esc).join(', ') + '</span>' : '') + '</span><b>' + x.count + '</b></div>';
    }).join('') + '</div>';
  }

  function dots() { return '<span class="dots"><i>.</i><i>.</i><i>.</i></span>'; }

  function voteResult(s) {
    var r = s.result, st = r.stage, e = r.eliminated, out = '', showRows = false;
    var nm = e ? esc(e.name).toUpperCase() : '';
    if (st === 'counting') {
      out = '<p class="label reveal">The votes are in</p><div class="suspense reveal">COUNTING THE VOTES' + dots() + '</div>';
    } else if (st === 'tally') {
      out = '<p class="label reveal">Vote results</p>'; showRows = true;
    } else if (st === 'tie') {
      out = '<p class="label">Tie</p><div class="name reveal">NO ONE IS ELIMINATED</div><p>A new vote starts between: <b>' + (r.tied || []).map(esc).join(', ') + '</b></p>'; showRows = true;
    } else if (st === 'name') {
      out = '<p class="label">The player eliminated is</p><div class="name reveal">' + nm + '</div><div class="suspense">THEIR ROLE IS' + dots() + '</div>'; showRows = true;
    } else if (st === 'role') {
      out = '<p class="label">Eliminated</p><div class="name">' + nm + '</div>' +
        '<div class="role reveal ' + (e.role === 'mrwhite' ? 'mw' : 'civ') + '" style="font-size:34px">WAS ' + roleLabel(e.role) + '</div>';
    } else if (st === 'caught') {
      out = '<div class="role civ reveal" style="font-size:30px">ALL MR. WHITES HAVE BEEN CAUGHT</div>';
    } else if (st === 'lastchance') {
      out = '<p class="label">But wait</p><div class="name reveal">THE GAME IS NOT OVER YET</div>' +
        '<div class="suspense">THE MR. WHITES HAVE ONE LAST CHANCE TO GUESS THE SECRET WORD' + dots() + '</div>';
    } else if (st === 'outnumbered') {
      out = '<div class="role mw reveal" style="font-size:30px">THE MR. WHITES NOW OUTNUMBER THE CIVILIANS</div>';
    }
    return shell('<div class="announce stage">' + out + '</div>' + (showRows && r.rows ? resultRows({ rows: r.rows }) : ''), s);
  }

  function guess(s) {
    var g = s.guess, body;
    if (g.canGuess && !g.iGuessed) {
      body = '<div class="announce"><p class="label">' + (g.decisive ? 'Final chance' : 'Final guess') + '</p><div class="name">GUESS THE SECRET WORD</div></div>' +
        '<div class="panel"><p>' + (g.decisive ? 'Every Mr. White has been caught, but you can still steal the win. You get one guess.'
          : 'The Mr. Whites have already won, but every Mr. White still gets one guess at the secret word.') + '</p>' +
        '<p class="muted small">CATEGORY: ' + up(s.settings.category) + '</p>' +
        '<div class="chat-form"><input type="text" id="guessInput" maxlength="40" autocomplete="off" autocapitalize="off" data-enter="submitGuess" placeholder="Type your guess...">' +
        '<button class="primary" data-action="submitGuess">Lock In Guess</button></div></div>';
    } else if (g.canGuess) {
      body = '<div class="announce"><p class="label">Guess locked in</p><div class="name">' + esc(g.myGuess).toUpperCase() + '</div>' +
        '<div class="suspense">WAITING FOR THE OTHER MR. WHITES' + dots() + '</div></div>';
    } else {
      body = '<div class="announce"><p class="label">' + (g.decisive ? 'Final chance' : 'Final guess') + '</p><div class="name">THE MR. WHITES ARE MAKING THEIR GUESS</div>' +
        '<div class="suspense">HOLD YOUR BREATH' + dots() + '</div></div>';
    }
    return shell('<div class="timer" data-countdown="' + g.endsAt + '" data-fmt="clock"></div>' + body +
      '<p class="center muted small">' + g.done + ' / ' + g.total + ' MR. WHITES HAVE GUESSED</p>', s);
  }

  function guessReveal(s) {
    var r = s.guessReveal, st = r.stage, out = '';
    var list = r.guesses && r.guesses.length ? '<div class="panel"><h3>Guesses</h3>' + r.guesses.map(function (x) {
      var tag = x.correct === null ? '' : x.correct ? ' <span class="tag-pill good">CORRECT</span>' : ' <span class="tag-pill bad">WRONG</span>';
      return '<div class="bar-row"><span>' + esc(x.name) + '</span><span><b>' + esc(x.text).toUpperCase() + '</b>' + tag + '</span></div>';
    }).join('') + '</div>' : (r.guesses ? '<div class="panel center"><p>NO GUESS WAS MADE</p></div>' : '');
    if (st === 'checking') {
      out = '<div class="announce stage"><p class="label reveal">The guess is in</p><div class="suspense reveal">CHECKING' + dots() + '</div></div>';
    } else if (st === 'guesses') {
      out = '<div class="announce stage"><p class="label reveal">The Mr. Whites guessed</p></div>' + list +
        '<div class="announce"><div class="suspense">IS IT CORRECT' + dots() + '</div></div>';
    } else {
      out = '<div class="announce stage"><p class="label">The secret word was</p><div class="secret reveal">' + esc(r.word) + '</div>' +
        '<div class="role reveal ' + (r.won ? 'mw' : 'civ') + '" style="font-size:30px">' +
        (r.decisive ? (r.won ? 'THE MR. WHITES STOLE THE WIN' : 'THE GUESS WAS WRONG')
                    : (r.won ? 'CORRECT. A PERFECT FINISH FOR THE MR. WHITES' : 'WRONG, BUT THE MR. WHITES ALREADY WON')) + '</div></div>' + list;
    }
    return shell(out, s);
  }

  function gameOver(s) {
    var rv = s.reveal, civ = rv.winner === 'civilians';
    var why = rv.reason === 'guess' ? 'A Mr. White guessed the secret word.'
      : rv.reason === 'outnumbered' ? 'The Mr. Whites equal or outnumber the civilians.'
      : 'Every Mr. White was caught and no guess was correct.';
    var roles = s.players.map(function (p) {
      return '<li><span>' + esc(p.name) + '</span><span class="tag-pill ' + (p.role === 'mrwhite' ? 'bad' : 'good') + '">' + roleLabel(p.role) + (p.alive ? '' : ' &middot; ELIMINATED') + '</span></li>';
    }).join('');
    var guesses = rv.guesses && rv.guesses.length ? '<div class="panel"><h3>Final guesses</h3>' + rv.guesses.map(function (x) {
      return '<div class="bar-row"><span>' + esc(x.name) + '</span><span><b>' + esc(x.text).toUpperCase() + '</b> <span class="tag-pill ' + (x.correct ? 'good' : 'bad') + '">' + (x.correct ? 'CORRECT' : 'WRONG') + '</span></span></div>';
    }).join('') + '</div>' : '';
    var host = s.players.filter(function (p) { return p.id === s.hostId; })[0];
    var canReset = s.me.isHost || (host && !host.connected);
    return shell('<div class="announce"><p class="label">Game over</p><div class="role ' + (civ ? 'winner-civ' : 'winner-mw') + '">' + (civ ? 'CIVILIANS WIN' : 'MR. WHITES WIN') + '</div>' +
      '<p class="muted">' + why + '</p><p class="label">Secret word</p><div class="secret">' + esc(rv.word) + '</div></div>' +
      guesses + '<div class="panel"><h3>Roles</h3><ul class="list">' + roles + '</ul></div>' + (s.result && s.result.rows ? resultRows(s.result) : '') + wordsPanel(s) +
      (canReset ? '<button class="primary block" data-action="playAgain">Play Again</button>' : '<p class="center muted">WAITING FOR THE HOST TO START A NEW GAME</p>') +
      '<p class="center" style="margin-top:16px"><button class="small-btn" data-action="leave">Leave Room</button></p>', s);
  }

  window.Views = {
    msgHtml: msgHtml,
    render: function (state, view) {
      if (!state) return ({ home: home, create: create, join: join, how: how }[view] || home)();
      var f = { lobby: lobby, role_reveal: roleReveal, word_round: wordRound, typing: typing, cooldown: cooldown,
        discussion: discussion, voting: voting, vote_result: voteResult, mrwhite_guess: guess, guess_reveal: guessReveal, game_over: gameOver }[state.phase];
      return f ? f(state) : shell('<p>Loading...</p>', state);
    }
  };
})();
