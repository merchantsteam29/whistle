# WHISTLE · Basketball Ref & Coach

Point a phone or laptop camera at a kid with a basketball. WHISTLE watches their body and the ball live, in the browser:

- **Calls traveling.** If the ball is picked up on the move, 2 steps are allowed (3 in Beginner). If it is picked up standing still, the first step sets the other foot as the pivot, and moving the pivot is a travel.
- **Calls double dribbles.** Dribble, pick up, dribble again.
- **Counts dribbles and streaks.**
- **Scores shots** when the ball drops through a hoop you mark on screen. With no hoop marked, it asks "did it go in?".
- **XP, 10 levels** (Rookie → Hall of Fame), **16 badges**, player profiles, session history.
- **Drills:** Handles 30 (most dribbles in 30 s) and Ten Shots, with personal bests.
- **Game mode:** 1v1 or 2v2 on one camera. It keeps each player's identity, calls contact fouls (reach-in, holding, pushing, offensive), scores 2s and 3s, and handles free throws (and-ones too), team-foul bonus and foul-outs. A box score and XP for each saved player come at the end.
- **Any ball:** tap it to learn its colour. White or grey balls are found by motion. An optional AI finder is off by default.
- **More calls:** carrying, out of bounds (mark the sideline), 3 seconds in the lane and a shot clock (game mode).
- **Shooting form coach:** scores every shot /10 (legs, elbow, release, follow-through) with a tip.
- **HORSE & Knockout:** turn-based shooting games for 2–4 kids.
- **Highlight clips** of makes, threes and streaks (MediaRecorder, downloadable).
- **Coach dashboard:** progress charts per kid. **Voice packs:** Coach, Hype announcer, Strict ref. **Team names and colours.**
- **Accounts + leaderboards** through the Game Library's sync.js (players/XP/badges sync; daily Handles 30 and Ten Shots boards).
- **1.4:** 5 new drills (weak hand, crossovers, between the legs, layup lines, defensive slides), daily challenge + day streaks, Beat the Pro ghost bars, practice plans, instant replay, shot chart, team mode with printable reports, shareable parent reports, a second-phone scoreboard (PeerJS), arena mode, unlockable themes/whistles/celebrations, offline download and battery saver.
- **1.5:** career mode, trick contest with judges' cards, 21 and Around the World, 2v2 passes/assists/steals, calibration wizard, "bad call" reports (replay clip + data, IndexedDB), side camera (PeerJS, takes over travel calls), voice commands, remote control page, online leagues (weekly drills, GameSync boards).
- **Ref a recorded video:** in setup, run a phone clip through the ref instead of the live camera.

Each call blows a whistle, says the call out loud, shows the ref signal and gives a coaching tip. **No call** waves off a wrong call, and **Fix shot** flips a make or miss.

Everything runs on the device. The video is never recorded or uploaded.

## Run

```
node serve.js        # http://localhost:8090  (the camera needs localhost or https)
```

## How it works

| File | What it does |
| --- | --- |
| `js/pose.js` | MediaPipe Pose Landmarker (0.10.14 from jsdelivr). Fast = lite model, Accurate = full model |
| `js/ball.js` | Colour-blob ball tracker: shrinks the frame to 256 px and keeps the roundest blob of the learned colour. The face is masked out |
| `js/form.js` | Shooting form scoring (pure) |
| `js/turns.js` | HORSE / Knockout rules (pure) |
| `js/voice.js` | Ref voice packs |
| `js/highlights.js` | Highlight clip recorder |
| `js/dashboard.js` | Coach dashboard charts |
| `js/drills.js` | New drills, daily challenge, pro targets, practice plans (pure) |
| `js/styles.js` | Unlockable themes, whistles, celebrations |
| `js/replay.js` | Instant replay buffer + player |
| `js/shotchart.js` | Shot chart |
| `js/report.js` | Parent / team reports, share links |
| `js/board.js` | Second-screen scoreboard over PeerJS |
| `js/tricks.js`, `js/career.js`, `js/calib.js`, `js/league.js` | Trick scoring, career chapters, calibration maths, league weeks/points (pure) |
| `js/voicecmd.js`, `js/badcalls.js` | Voice commands; bad-call reports |
| `js/game.js` | Game mode with no DOM: player identity (Court), possession, fouls, scoring, free throws |
| `js/ref.js` | The ref engine, with no DOM. It reads the pose and ball and emits `dribble / gather / step / shot / shotResult / violation / clean` events. Steps work at any camera angle because a planted foot doesn't move in the picture |
| `js/progress.js` | Players, XP, levels, badges and bests (localStorage `whistle.v1`) |
| `js/main.js` | Screens, camera loop, HUD, calls, summary |

## Tests

```
node tools/test-ref.mjs        # 18 scripted plays through the ref engine (travel, pivot, double dribble, hidden ball, make/miss, jitter)
node tools/test-form.mjs       # form coach (good form, no legs, no follow-through, low release, flared elbow)
node tools/test-turns.mjs      # HORSE / PIG / Knockout rules
node tools/test-drills.mjs     # drill counters, slides, daily challenge + streaks
node tools/test-more.mjs       # tricks, career, calibration, leagues
node tools/test-board.mjs      # two browsers: ref + second-screen scoreboard over PeerJS (needs internet)
node tools/test-game.mjs       # 19 game-mode checks (fouls, same-depth rule, 2s/3s, free throws, bonus, foul-out, identity)
node tools/clip.mjs <id> [rate] [--hoop=x1,y1,x2,y2] [--slow=4] [--trace --span=a,b]   # a real video through the whole app: calls, plus a per-frame trace
node serve.js & node tools/smoke.mjs [--mobile]   # headless Chrome with a fake camera, screenshots in tools/shots/
```
