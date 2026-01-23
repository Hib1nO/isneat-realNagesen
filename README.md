# gift-server (skeleton, Pug)

Express + Socket.IO skeleton for:
- namespaces: /admin /hud /input
- /input sends snapshot every 250ms (latest-wins)
- server tick every 250ms: apply diff + broadcast state
- 1s timer loop
- speed challenge skeleton
- simple NeDB persistence queue (optional)
- pages rendered by **Pug**: GET /admin /hud /input

## Setup
```bash
npm i
cp config.example.json config.json
npm run dev
```

Open:
- http://localhost:3000/admin
- http://localhost:3000/hud
- http://localhost:3000/input

## Notes
- Score is updated only when `matchProcess` is true (start timer from admin).
- /input payload is assumed to be a cumulative snapshot. Server applies **diff** vs last snapshot.
