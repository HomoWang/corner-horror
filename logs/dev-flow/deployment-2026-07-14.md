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
- Vitest: PASS — 8 files, 37 tests
- GitHub Pages production-base build: PASS
- Render server build: PASS
- Local Render server health check: PASS
- Local Render server WebSocket smoke: PASS — status, orient, cue
- Public Render health check: PASS
- Public Render WebSocket smoke with Pages origin: PASS — status, orient, cue
- GitHub Pages workflow: PASS — test, build, configure, upload, deploy
- Public Pages checks: PASS — host, controller, jump-scare image, scream audio returned HTTP 200

## 2026-07-14 恐怖節奏改版再部署

- Commit: `1ed58fb` (`stage tape playback and door climax`)
- GitHub Pages workflow: PASS — run `29294493445`
- 新增錄音帶逐句演出、左右餘光人影、房間閃爍、貼門傾聽與兩種差異化結局。
- 本機瀏覽器雙頁：Host／Controller 實際配對，使用同一顆中央鍵完整走通開門與封印分支。
- 公開瀏覽器雙頁：Render relay 連線、Controller 開始、Host 進入序章皆 PASS。
- 公開 fresh reload：新版錄音帶與門前節點存在，Host／Controller 無 console error 或 warning。
