# Deployment

The project uses two public services:

- GitHub Pages hosts the Vite client, images, and audio.
- Render hosts the stateful Node.js WebSocket relay.

## Render relay

`render.yaml` builds `server/standalone.ts` into `dist-server/index.mjs`, starts it on Render's
assigned port, and exposes `/health` plus `/ws?room=<room-code>`. Each QR code contains a random
room code so unrelated visitors do not replace one another's host or controller.

Set `ALLOWED_ORIGINS` to the GitHub Pages origin, for example `https://homowang.github.io`.

## GitHub Pages

The repository workflow `.github/workflows/pages.yml` tests and builds the Vite app before
publishing `dist`. Configure the repository Actions variable `VITE_WS_URL` with the Render relay,
for example `wss://corner-horror-relay-homowang.onrender.com/ws`.

The Vite base path is derived automatically from `GITHUB_REPOSITORY`, so project pages under
`/<repository>/` load their scripts, room image, jump-scare image, and audio correctly.
