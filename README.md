# 🟥🟧🟨🟩🟦 BLOCKBLAST — Multiplayer

> **Real-time 2-player puzzle battle** — place blocks, clear lines, outlast your opponent.

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)
![Flask](https://img.shields.io/badge/Flask-SocketIO-black?style=flat-square&logo=flask)
![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-yellow?style=flat-square&logo=javascript)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 📸 Overview

BlockBlast Multiplayer is a browser-based, self-hosted two-player puzzle game. Each player gets their own 10×10 grid and a tray of 3 random pieces. Place pieces to fill rows and columns — clearing them earns points. Watch your opponent's board update live in a split-screen mirror. The player with the highest score when the timer runs out wins.

---

## ✨ Features

- 🎮 **Real-time split-screen** — your board on the left, opponent's live mirror on the right
- ⏱️ **5-minute timed matches** with a countdown HUD
- ❤️ **Lives system** — 3 lives per player; spend one to rescue yourself when stuck (clear a row or column)
- 💀 **Elimination** — run out of lives with no valid moves and you're out; if both players are eliminated, the game ends instantly
- 🔄 **Rematch system** — request and accept rematches without leaving the room
- 🏠 **Room codes** — create a 6-character room code and share it with your friend
- 📊 **Live score, combo & lines-cleared tracking**
- 📱 **LAN / Hotspot play** — works over local Wi-Fi or a phone hotspot

---

## 🗂️ Project Structure

```
blockblast/
├── server.py        # Flask + Flask-SocketIO backend
├── templates/
│   └── index.html   # Game UI (lobby, waiting room, game screen)
└── static/
    ├── game.js      # Game engine + Socket.IO client
    └── style.css    # Dark sci-fi theme (Orbitron + Rajdhani)
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
pip install flask flask-socketio
```

### 2. Run the server

```bash
python server.py
```

The server starts at `http://0.0.0.0:5001` — accessible from any device on your network.

### 3. Open in browser

- **You (host):** `http://localhost:5001`
- **Friend (same network):** `http://<your-local-ip>:5001`

> Find your local IP with `ipconfig` (Windows) or `ifconfig` / `ip a` (Mac/Linux).  
> Look for an address like `192.168.x.x` or `172.20.10.x`.

---

## 🌐 Playing Over a Phone Hotspot

If you don't share a Wi-Fi router, you can use your phone's mobile hotspot:

1. Enable **Mobile Hotspot** on your phone
2. Connect **both your PC and your friend's device** to the hotspot
3. Your IP will typically be `172.20.10.2`
4. Your friend opens `http://172.20.10.2:5001`

---

## 🔥 Windows Firewall (important for LAN play)

If your friend can't connect, Windows Firewall is likely blocking port 5001. Run this in **CMD as Administrator**:

```bat
netsh advfirewall firewall add rule name="BlockBlast" dir=in action=allow protocol=TCP localport=5001
```

---

## 🎮 How to Play

1. **Host** enters a name and clicks **Create Room** → gets a 6-character room code
2. **Guest** enters their name + the room code and clicks **Join**
3. Host clicks **▶ Start Game**
4. Place pieces by clicking a piece in the tray, then clicking the board
5. Fill a full row or column to clear it and earn points
6. If you run out of valid moves, you enter **Rescue Mode** — click a row or column to clear it (costs 1 life ❤️)
7. Run out of lives → **eliminated 💀**
8. Game ends when the **5-minute timer** hits zero, or **both players are eliminated**
9. Highest score wins — request a **rematch** to play again!

---

## 🧮 Scoring

| Action | Points |
|---|---|
| Place a piece | +1 per cell in the piece |
| Clear 1 line | `+10 × GRID_SIZE` |
| Combo (multiple lines at once) | multiplied by combo count |

---

## ⚙️ Configuration

Edit the top of `server.py` and `game.js` to tweak:

| Setting | Default | Location |
|---|---|---|
| Port | `5001` | `server.py` |
| Game duration | `300s (5 min)` | `server.py` / `game.js` |
| Starting lives | `3` | `server.py` / `game.js` |
| Board size | `10×10` | `game.js` |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask, Flask-SocketIO |
| Frontend | Vanilla JavaScript, HTML5 Canvas |
| Styling | CSS3 (Orbitron + Rajdhani fonts) |
| Realtime | Socket.IO (threading async mode) |

---

## 📝 Notes

- No database or authentication — fully in-memory, resets on server restart
- Works best on **Python 3.10–3.13**; Python 3.14+ on Windows may have a `socket.getfqdn()` bug
- Designed for **LAN play** — not recommended to expose on public internet without added security

---

## 📄 License

MIT — free to use, modify, and share.
