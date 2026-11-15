// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
/* Client controller: socket events, rendering, and user actions. */
(function () {
  var socket = io();
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var App = window.App = {
    state: null,        // latest per-player view from the server
    view: 'home',       // pre-room view: home | create | join | how
    offset: 0,          // serverTime - clientTime
    selectedVote: null,
    session: null
  };

  try { App.session = JSON.parse(sessionStorage.getItem('mrwhite-session')); } catch (e) { App.session = null; }
  var saveSession = function (s) { App.session = s; if (s) sessionStorage.setItem('mrwhite-session', JSON.stringify(s)); else sessionStorage.removeItem('mrwhite-session'); };
  var serverNow = function () { return Date.now() + App.offset; };

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(text) {
    var el = $('#toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3500);
  }

  function emit(event, payload, cb) {
    socket.emit(event, payload || {}, function (res) {
      if (res && res.ok === false) toast(res.error || 'Something went wrong.');
      if (cb) cb(res);
    });
  }

  /* ---------- rendering (preserves focus, typed text and scroll positions) ---------- */
  function render() {
    var root = $('#app');
    var saved = {};
    root.querySelectorAll('input[id],textarea[id]').forEach(function (el) {
      saved[el.id] = { value: el.value, start: el.selectionStart, end: el.selectionEnd, focus: document.activeElement === el };
    });
    var scrolls = {};
    ['chatLog', 'whiteLog'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) scrolls[id] = { top: el.scrollTop, bottom: el.scrollHeight - el.scrollTop - el.clientHeight < 40 };
    });

    root.innerHTML = Views.render(App.state, App.view);

    Object.keys(saved).forEach(function (id) {
      var el = document.getElementById(id), s = saved[id];
      if (!el || el.disabled) return;
      el.value = s.value;
      if (s.focus) { el.focus(); try { el.setSelectionRange(s.start, s.end); } catch (e) {} }
    });
    ['chatLog', 'whiteLog'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollTop = !scrolls[id] || scrolls[id].bottom ? el.scrollHeight : scrolls[id].top;
    });
    // Helpful auto-focus for the primary text input on each screen.
    ['typingInput', 'wordInput', 'guessInput', 'nameInput', 'codeInput'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.disabled && !document.activeElement.id && id !== 'nameInput') el.focus();
    });
    scrollPassage();
    tick();
  }

  // Keeps the current character in view inside the long passage box.
  function scrollPassage() {
    var box = document.getElementById('passage');
    var cur = box && box.querySelector('.cur');
    if (box && cur) box.scrollTop = Math.max(0, cur.offsetTop - box.clientHeight / 2);
  }

  /* ---------- countdowns (all based on the server clock) ---------- */
  function tick() {
    document.querySelectorAll('[data-countdown]').forEach(function (el) {
      var left = Math.max(0, Math.ceil((Number(el.dataset.countdown) - serverNow()) / 1000));
      if (el.dataset.fmt === 'clock') {
        el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        el.classList.toggle('warn', left <= 10);
      } else {
        el.textContent = left;
      }
    });
  }
  setInterval(tick, 250);

  /* ---------- actions ---------- */
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  function clearInput(id) { var el = document.getElementById(id); if (el) { el.value = ''; el.focus(); } }

  var actions = {
    goHome: function () { App.view = 'home'; render(); },
    goCreate: function () { App.view = 'create'; render(); },
    goJoin: function () { App.view = 'join'; render(); },
    goHow: function () { App.view = 'how'; render(); },
    create: function () {
      emit('room:create', { name: val('nameInput') }, function (res) { if (res.ok) saveSession({ code: res.code, token: res.token }); });
    },
    join: function () {
      emit('room:join', { code: val('codeInput'), name: val('nameInput') }, function (res) { if (res.ok) saveSession({ code: res.code, token: res.token }); });
    },
    copy: function () {
      var code = App.state.code;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(function () { toast('Room code copied.'); }, function () { toast('Room code: ' + code); });
      else toast('Room code: ' + code);
    },
    ready: function () { emit('room:ready', { ready: !App.state.me.ready }); },
    kick: function (el) { emit('room:kick', { playerId: el.dataset.id }); },
    start: function () { emit('game:start'); },
    cont: function () { emit('role:continue'); },
    submitWord: function () { emit('word:submit', { word: val('wordInput') }, function (res) { if (res.ok) clearInput('wordInput'); }); },
    sendChat: function () { var t = val('chatInput'); if (t) emit('chat:send', { text: t }, function (r) { if (r.ok) clearInput('chatInput'); }); },
    sendWhite: function () { var t = val('whiteInput'); if (t) emit('white:send', { text: t }, function (r) { if (r.ok) clearInput('whiteInput'); }); },
    proceed: function () { emit('vote:proceed'); },
    castVote: function () {
      if (!App.selectedVote) return;
      emit('vote:cast', { targetId: App.selectedVote }, function (res) { if (res.ok) App.selectedVote = null; });
    },
    submitGuess: function () { emit('guess:submit', { text: val('guessInput') }); },
    playAgain: function () { emit('game:reset'); },
    leave: function () {
      emit('room:leave');
      saveSession(null);
      App.state = null; App.view = 'home';
      render();
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    var name = e.target && e.target.dataset && e.target.dataset.enter;
    if (name && actions[name]) { e.preventDefault(); actions[name](e.target); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.change === 'settings') {
      var mw = document.getElementById('mwSel');
      emit('room:settings', { mrWhiteCount: mw ? mw.value : undefined, category: val('catSel') });
    } else if (t.name === 'vote') {
      App.selectedVote = t.value;
      document.querySelectorAll('.vote-option').forEach(function (l) { l.classList.toggle('checked', l.contains(t)); });
      var btn = document.getElementById('voteBtn');
      if (btn) btn.disabled = false;
    }
  });

  /* ---------- typing challenge input ---------- */
  function updateTypingDisplay() {
    var t = App.state && App.state.typing;
    if (!t || t.kind !== 'civilian') return;
    var elapsed = Math.max(0, Math.min((t.endsAt - t.startedAt) / 1000, ((t.finishedAt || serverNow()) - t.startedAt) / 1000));
    var s = Typing.computeStats(t.passage, t.typed, elapsed);
    document.getElementById('passage').innerHTML = Typing.paintPassage(t.passage, t.typed);
    scrollPassage();
    document.getElementById('statWpm').textContent = s.wpm;
    document.getElementById('statAcc').textContent = s.accuracy + '%';
    document.getElementById('statErr').textContent = s.errors;
  }

  document.addEventListener('input', function (e) {
    if (e.target.id !== 'typingInput') return;
    var t = App.state && App.state.typing;
    if (!t || t.kind !== 'civilian' || t.finished) return;
    var text = e.target.value;
    if (text.length > t.passage.length) { text = text.slice(0, t.passage.length); e.target.value = text; }
    t.typed = text;
    updateTypingDisplay();
    socket.emit('typing:progress', { text: text });
    if (text.length >= t.passage.length) {
      socket.emit('typing:finish', {}, function (res) {
        if (res && res.ok) { t.finished = true; t.finishedAt = serverNow(); render(); }
      });
    }
  });
  // Pasting and dropping text are disabled during the typing test.
  ['paste', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (e.target.id === 'typingInput') e.preventDefault(); });
  });

  /* ---------- chat events (delivered separately so typing in chat is never disturbed) ---------- */
  function appendMessage(list, logId, msg) {
    if (list.some(function (m) { return m.id === msg.id; })) return;
    list.push(msg);
    var el = document.getElementById(logId);
    if (!el) return;
    var near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    el.insertAdjacentHTML('beforeend', Views.msgHtml(msg));
    if (near) el.scrollTop = el.scrollHeight;
  }
  socket.on('chat:message', function (msg) { if (App.state) appendMessage(App.state.chat, 'chatLog', msg); });
  socket.on('white:message', function (msg) {
    var t = App.state && App.state.typing;
    if (t && t.kind === 'mrwhite') appendMessage(t.chat, 'whiteLog', msg);
  });

  /* ---------- connection lifecycle ---------- */
  socket.on('state', function (s) {
    var phaseChanged = !App.state || App.state.phase !== s.phase || (s.voting && App.state.voting && s.voting.round !== App.state.voting.round);
    if (phaseChanged) App.selectedVote = null;
    App.offset = s.serverNow - Date.now();
    App.state = s;
    render();
  });
  socket.on('kicked', function () {
    saveSession(null); App.state = null; App.view = 'home'; render();
    toast('You were removed from the room by the host.');
  });
  socket.on('connect', function () {
    $('#conn').classList.add('hidden');
    if (App.session) {
      socket.emit('room:rejoin', App.session, function (res) {
        if (!res || !res.ok) { saveSession(null); App.state = null; App.view = 'home'; render(); }
      });
    }
  });
  socket.on('disconnect', function () { $('#conn').classList.remove('hidden'); });

  // Allow invite links like /?room=ABCDE
  var params = new URLSearchParams(location.search);
  if (params.get('room') && !App.session) {
    App.view = 'join';
    render();
    var c = document.getElementById('codeInput');
    if (c) c.value = params.get('room').toUpperCase();
  } else {
    render();
  }
})();
