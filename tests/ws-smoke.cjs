// Manual integration smoke: run Vite dev server first, then `node tests/ws-smoke.cjs [wss-url]`.
const WebSocket = require('ws');

const url = process.argv[2] ?? 'wss://127.0.0.1:5173/ws?room=0123456789abcdef';
const origin = process.argv[3];
const options = { rejectUnauthorized: false, ...(origin ? { origin } : {}) };
const host = new WebSocket(url, options);
const controller = new WebSocket(url, options);
const seen = { status: false, orient: false, cue: false };

const timer = setTimeout(() => {
  console.error(JSON.stringify(seen));
  process.exit(1);
}, 5_000);

function finish() {
  if (!Object.values(seen).every(Boolean)) return;
  clearTimeout(timer);
  console.log(JSON.stringify(seen));
  host.close();
  controller.close();
  setTimeout(() => process.exit(0), 50);
}

host.on('open', () => host.send(JSON.stringify({ type: 'hello', role: 'host' })));
controller.on('open', () => controller.send(JSON.stringify({ type: 'hello', role: 'controller' })));

host.on('message', (raw) => {
  const message = JSON.parse(String(raw));
  if (message.type === 'status' && message.controller) {
    seen.status = true;
    controller.send(JSON.stringify({ type: 'orient', q: [0, 0, 0, 1], t: 1 }));
  }
  if (message.type === 'orient') {
    seen.orient = true;
    host.send(JSON.stringify({ type: 'cue', id: 'ring' }));
  }
  finish();
});

controller.on('message', (raw) => {
  const message = JSON.parse(String(raw));
  if (message.type === 'cue' && message.id === 'ring') seen.cue = true;
  finish();
});

for (const socket of [host, controller]) {
  socket.on('error', (error) => {
    clearTimeout(timer);
    console.error(error);
    process.exit(1);
  });
}
