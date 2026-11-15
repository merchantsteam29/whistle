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
| `js/game.js` | Game mode with no DOM: player identity (Court), possession, fouls, scoring, free throws |
| `js/ref.js` | The ref engine, with no DOM. It reads the pose and ball and emits `dribble / gather / step / shot / shotResult / violation / clean` events. Steps work at any camera angle because a planted foot doesn't move in the picture |
| `js/progress.js` | Players, XP, levels, badges and bests (localStorage `whistle.v1`) |
| `js/main.js` | Screens, camera loop, HUD, calls, summary |

## Tests

```
node tools/test-ref.mjs        # 18 scripted plays through the ref engine (travel, pivot, double dribble, hidden ball, make/miss, jitter)
node tools/test-game.mjs       # 14 game-mode checks (fouls, same-depth rule, 2s/3s, free throws, bonus, foul-out, identity)
node tools/clip.mjs <id>       # a real video (tools/clips/<id>.mp4) through the whole app, with what it called
node serve.js & node tools/smoke.mjs [--mobile]   # headless Chrome with a fake camera, screenshots in tools/shots/
```
