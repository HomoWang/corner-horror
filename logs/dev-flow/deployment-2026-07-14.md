# GitHub Pages + Render deployment — 2026-07-14

## Architecture

- Public Vite client and static assets: GitHub Pages
- Public Node.js WebSocket relay: Render Free Web Service
- Session isolation: random 20-character room code carried in the QR URL and WebSocket query
- Origin restriction: `https://homowang.github.io`

## Public resources

- Repository: `https://github.com/HomoWang/corner-horror`
- Relay: `https://corner-horror-relay-homowang.onrender.com`
- WebSocket: `wss://corner-horror-relay-homowang.onrender.com/ws`
- Pages: `https://homowang.github.io/corner-horror/`

## Verification

- TypeScript typecheck: PASS
- Vitest: PASS — 7 files, 32 tests
- GitHub Pages production-base build: PASS
- Render server build: PASS
- Local Render server health check: PASS
- Local Render server WebSocket smoke: PASS — status, orient, cue
- Public Render health check: PASS
- Public Render WebSocket smoke with Pages origin: PASS — status, orient, cue
- GitHub Pages workflow: pending
