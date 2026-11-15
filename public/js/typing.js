// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
/* Client-side typing helpers. The server recomputes the final stats; these power the live display. */
(function () {
  function computeStats(passage, typed, seconds) {
    typed = String(typed || '').slice(0, passage.length);
    var correct = 0;
    for (var i = 0; i < typed.length; i++) if (typed[i] === passage[i]) correct++;
    var errors = typed.length - correct;
    var accuracy = typed.length ? Math.round((correct / typed.length) * 1000) / 10 : 0;
    var minutes = Math.max(seconds, 1) / 60;
    var wpm = Math.round((correct / 5 / minutes) * 10) / 10;
    return { wpm: wpm, accuracy: accuracy, errors: errors };
  }

  function esc(c) {
    return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : c;
  }

  function paintPassage(passage, typed) {
    var out = '';
    for (var i = 0; i < passage.length; i++) {
      var cls = i < typed.length ? (typed[i] === passage[i] ? 'ok' : 'bad') : (i === typed.length ? 'cur' : 'pending');
      out += '<span class="' + cls + '">' + esc(passage[i]) + '</span>';
    }
    return out;
  }

  window.Typing = { computeStats: computeStats, paintPassage: paintPassage };
})();
