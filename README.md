# VELDRIX BOT – WhatsApp Bot (Pairing Code)

[![Status](https://img.shields.io/badge/Status-Online-brightgreen)](https://your-render-url.com)

## Features
- **Pairing Code** – no QR scanning
- **24/7 Online** – runs on Render/Termux
- **Auto‑Reconnect** – survives disconnections
- **Web Dashboard** – check status anytime
- **Commands**: !menu, !ping, !status, !owner

## Deployment

### Render
1. Fork this repo.
2. Create new Web Service on Render, connect repo.
3. Add environment variable `OWNER_NUMBER=255748529340`.
4. Deploy! First run will show pairing code in logs – enter it in WhatsApp.

### Termux
```bash
pkg install nodejs git
git clone https://github.com/yourusername/veldrix-bot
cd veldrix-bot
npm install
npm start
