// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const crypto = require('crypto');

// Sentences are kept within a narrow length band (~57-65 chars) so every passage has
// a comparable length and difficulty.
const SENTENCES = [
  'The morning train left the quiet station right on schedule.',
  'A small boat drifted slowly across the calm and silver lake.',
  'Fresh bread cooled on the kitchen counter beside an open window.',
  'Several children laughed as they chased leaves down the street.',
  'The old library kept its best books on the highest wooden shelf.',
  'Rain tapped gently on the roof while everyone slept peacefully.',
  'A careful gardener watered every flower before the heat arrived.',
  'The market was crowded with people looking for bargains and news.',
  'Clouds gathered over the hills and the wind began to change.',
  'He wrote a long letter and then folded it into a tiny square.',
  'The teacher asked a simple question and waited for an answer.',
  'Lanterns glowed along the path leading to the sleepy village.',
  'A tired traveler found a warm seat near the crackling fireplace.',
  'Every evening the neighbors gathered to share stories and tea.',
  'The bridge over the river was built many years before the town.',
  'She packed a small bag and walked toward the bright horizon.',
  'Soft music drifted from the cafe as the sun began to set.',
  'The farmer counted his sheep twice and then closed the gate.',
  'A curious cat watched the birds from behind the garden fence.',
  'Snow covered the mountain road and silence filled the valley.',
  'They carried the heavy boxes upstairs without saying a word.',
  'The clock in the square struck noon and the bells began to ring.',
  'A gentle breeze carried the smell of salt across the harbor.',
  'The painter mixed three colors and studied the empty canvas.',
  'Our guide pointed toward the ridge and told us to keep moving.',
  'The bakery opened early and the line reached the corner shop.',
  'He tuned the guitar slowly and played a quiet evening song.',
  'A bright lantern swung from the mast as the ship left port.',
  'The students finished their work and gathered near the door.',
  'Golden light filled the room as the curtains moved in the wind.',
  'The lighthouse keeper polished the lamp before the storm arrived.',
  'Two friends shared an umbrella and walked home in the rain.',
  'The river slowly carried the fallen petals toward the sea.',
  'A young musician practiced the same melody until it was perfect.',
  'Warm soup simmered on the stove while the winter wind howled.',
  'The shopkeeper arranged the window display with great patience.',
  'Fireflies blinked across the meadow as the evening grew darker.',
  'He climbed the narrow stairs and opened the dusty attic door.',
  'The ferry horn echoed over the water as the fog rolled in.',
  'A quiet street led to the old square where the fountain sang.'
];

// Passages are intentionally far longer than anyone can type in the 120 second timer
// (about 950 characters), so most civilians will not finish. Finishing is optional.
const PASSAGE_SENTENCES = 15;

/** Builds a unique long passage; `used` is a Set of passages already issued in this game. */
function generatePassage(used) {
  let passage = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    const pool = SENTENCES.slice();
    const picked = [];
    for (let i = 0; i < PASSAGE_SENTENCES; i++) picked.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
    passage = picked.join(' ');
    if (!used.has(passage)) break;
  }
  used.add(passage);
  return passage;
}

/** Server-authoritative typing statistics (position-by-position comparison). */
function computeStats(passage, typed, seconds) {
  typed = String(typed || '').slice(0, passage.length);
  let correct = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] === passage[i]) correct++;
  const errors = typed.length - correct;
  const accuracy = typed.length ? Math.round((correct / typed.length) * 1000) / 10 : 0;
  const minutes = Math.max(seconds, 1) / 60;
  const wpm = Math.round((correct / 5 / minutes) * 10) / 10;
  return { wpm, accuracy, errors, typedChars: typed.length, correctChars: correct, passageLength: passage.length };
}

module.exports = { generatePassage, computeStats };
