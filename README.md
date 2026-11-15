# WHISTLE · Basketball Ref & Coach

Point a phone or laptop camera at a kid with a basketball. WHISTLE watches their body and the ball live, in the browser:

- **Calls traveling.** If the ball is picked up on the move, 2 steps are allowed (3 in Beginner). If it is picked up standing still, the first step sets the other foot as the pivot, and moving the pivot is a travel.
- **Calls double dribbles.** Dribble, pick up, dribble again.
- **Counts dribbles and streaks.**
- **Scores shots** when the ball drops through a hoop you mark on screen. With no hoop marked, it asks "did it go in?".
- **XP, 10 levels** (Rookie → Hall of Fame), **16 badges**, player profiles, session history.
- **Drills:** Handles 30 (most dribbles in 30 s) and Ten Shots, with personal bests.

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
| `js/ref.js` | The ref engine, with no DOM. It reads the pose and ball and emits `dribble / gather / step / shot / shotResult / violation / clean` events. Steps work at any camera angle because a planted foot doesn't move in the picture |
| `js/progress.js` | Players, XP, levels, badges and bests (localStorage `whistle.v1`) |
| `js/main.js` | Screens, camera loop, HUD, calls, summary |

## Tests

```
node tools/test-ref.mjs        # 14 scripted plays through the ref engine (travel, pivot, double dribble, make/miss, jitter)
node serve.js & node tools/smoke.mjs [--mobile]   # headless Chrome with a fake camera, screenshots in tools/shots/
```
