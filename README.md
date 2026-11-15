# MR. WHITE

A real-time multiplayer social deduction game. Node.js + Express + Socket.IO, MySQL (optional persistence), plain HTML/CSS/JS frontend. Text-only interface.

## Run it

Requires Node.js 18+.

```bash
npm install
cp .env.example .env      # optional: edit port / MySQL settings
npm start                 # http://localhost:3000
```

Other devices on the same network can join at `http://<your-computer-ip>:3000`.
Invite links also work: `http://<host>:3000/?room=ABCDE`.

### MySQL (optional)

Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env`. On start the server creates the database and tables
(`src/db/schema.sql`) and saves every finished game: players and roles, all words, every vote, and typing results.
If `DB_HOST` is empty or MySQL is unreachable, the game runs normally without persistence.

### Tests

```bash
npm test                          # runs all of the suites below
node tests/flow.test.js           # 4 players / 1 Mr. White: no typing challenge, full game
node tests/multi.test.js          # 6 players / 2 Mr. Whites: 1 minute typing, private room, tie revote, reconnect
node tests/guess.test.js          # Mr. White final guess: wrong, correct, and timeout
node tests/typing-rules.test.js   # 9 players: typing rule for 1, 2, 3 and 4 Mr. Whites
node tests/owner.test.js          # copyright footer, safe rendering of names, set-owner script
```

Tests shorten the timers through `TYPING_SECONDS` (the 4+ Mr. White length), `TYPING_SHORT_SECONDS` (the 2 to 3 Mr. White length), `COOLDOWN_SECONDS`, `GUESS_SECONDS` and `STAGE_SCALE` (speed of the suspense reveal). All default to the real values.

## Game flow (exact order)

1. Lobby: host picks the number of Mr. Whites and the category; players ready up; host starts. A chat box sits beside the lobby so people can talk while they wait.
2. Role reveal (text only), everyone presses CONTINUE.
3. **Round 1:** each active player submits one word in turn order. **A civilian always goes first**; everyone else follows in random order (the same order is used in Round 2). Round ends automatically.
4. **Typing challenge 1 (server timer):** civilians each get a different, deliberately very long passage (about 930 characters, so finishing is not expected); Mr. Whites enter a private room. **The length depends on the number of Mr. Whites chosen: 1 Mr. White = no typing challenge at all (Round 1 goes straight to the countdown, Round 2 straight to the discussion), 2 to 3 Mr. Whites = 1 minute, 4 or more = 2 minutes.** The lobby shows the rule that currently applies.
5. **5 second synchronized countdown.**
6. **Round 2:** same mechanics, words cannot repeat anything from Round 1.
7. **Typing challenge 2 (same length and rules):** civilians get new passages; Mr. Whites return to the private room.
8. **Discussion** (first and only now), unlimited time. PROCEED TO VOTING needs a strict majority: `floor(active/2)+1`.
9. **Voting:** mandatory, no skip, no self-vote, no time limit, private until everyone has voted. Ties trigger an automatic revote limited to the tied players, repeated until there is a single result.
10. **Suspense reveal after every vote,** driven by the server one stage at a time: counting the votes, the tally, the eliminated player's name, then (after a pause) their role. Nothing is sent to any browser before its stage.
11. Win check (civilians win at 0 Mr. Whites; Mr. Whites win when they equal or outnumber civilians). If the game continues it returns to discussion, then voting again.
12. **Final guess in every ending.** When the game is decided, every Mr. White gets one guess at the secret word (60 s, no chat), revealed with its own suspense sequence. Correct guesses ignore case, spaces and punctuation.
    - If the civilians caught every Mr. White, extra suspense ("all Mr. Whites have been caught... but the game is not over yet") leads into the guess, and a **correct guess steals the win** for the Mr. Whites.
    - If the Mr. Whites win by equalling or outnumbering the civilians, they still guess and the reveal says whether they got it, but the result cannot change because they have already won.

## Project layout

```
server.js                      entry point (Express + Socket.IO)
src/config/db.js              MySQL pool + schema bootstrap
src/db/schema.sql             tables
src/routes/api.js             REST routes (health, categories, room info)
src/controllers/              REST controllers
src/services/
  roomService.js              rooms, players, settings rules
  gameService.js              server-authoritative state machine + timers
  stateService.js             builds each player's private view (secrecy lives here)
  typingService.js            passage generation + WPM / accuracy / errors
  wordService.js              categories and secret words
  persistenceService.js       saves finished games to MySQL
src/sockets/index.js          Socket.IO events and delivery rules
public/                       text-only frontend (index.html, css/, js/)
tests/                        end-to-end tests
```

## How secrecy is enforced

- The server never broadcasts one shared state. `stateService.viewFor()` builds a separate payload per player.
- The secret word is included only for civilians (and for everyone at game over). It is never in a Mr. White's payload.
- Other players' roles are included only after they are eliminated or the game ends.
- Mr. White chat is emitted only to living Mr. Whites, and only while the typing challenge runs.
- Typing passages and stats go only to the civilian they belong to. Nothing about typing progress is broadcast, so it cannot reveal anyone's role.
- Votes are hidden until the last vote is in; only "has voted" is shown.
- Players hold a private reconnect token; the public player id alone cannot take over a seat.

## Design decisions to know about

- **Mr. White limit:** the host can choose 1 to `floor((players-1)/2)` Mr. Whites (5 players: 2, 8: 3, 10: 4, 15: 7). Anything higher would start already won by Mr. Whites. At least 3 players are needed. Maximum room size defaults to 50 (`MAX_PLAYERS`).
- **After an elimination** the game returns to the unlimited discussion and then voting; it does not replay word rounds.
- **Eliminated players** are read-only spectators of the main chat. They cannot chat, vote or enter the Mr. White room.
- **Disconnects never block the game:** a missing player's word turn is skipped after 20 s, and majority/voting checks use players who are currently connected. A player who refreshes the page rejoins automatically (session token in the browser tab).
- **Duplicate words** are compared ignoring case and surrounding spaces, across both rounds.
- **Typing passages** are built from 40 similar-length sentences, 15 per passage, so each player gets a different passage of comparable length and no passage repeats within a game. The passage box scrolls automatically to follow the cursor.
- **Lobby chat** is open to everyone in the lobby and is cleared when the game starts.

## Copyright and ownership

<!-- owner:start -->
(c) 2026 Alexander Santos. All rights reserved. See LICENSE.
<!-- owner:end -->

The owner's name lives in one place, `owner.json`. Set or change it with one command (then restart the server):

```bash
node scripts/set-owner.js "Your Name"
node scripts/set-owner.js "Your Name" --contact "you@example.com"
```

This updates the footer shown on every page, the "Created by" line on the home page, `LICENSE`, `package.json`
(`"license": "UNLICENSED"`, `"private": true`), this section, and the notice on the first line of every `.js` and `.css` file.
Run it again with a different name and every notice is replaced, never duplicated.
