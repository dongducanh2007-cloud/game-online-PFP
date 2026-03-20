# 🟥🟧🟨 BlockBlast Multiplayer

A real-time 2-player block puzzle game inspired by Block Blast.  
Each player has their own board and races to score the most points before the 5-minute timer runs out.

---

## 📁 Project Structure

```
blockblast_multiplayer/
├── server.py              # Flask + SocketIO backend
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html         # Game UI (lobby, waiting room, game screen)
└── static/
    ├── game.js            # All game logic (board, pieces, lives, rescue, networking)
    └── style.css          # Dark arcade theme
```

---

## ⚙️ Installation

### 1. Install Python dependencies

```bash
pip install flask flask-socketio simple-websocket
```

### 2. Run the server

```bash
cd blockblast_multiplayer
python server.py
```

You should see:
```
==================================================
  BlockBlast Multiplayer Server
  http://localhost:5001
  (share your LAN IP for Player 2)
==================================================
```

---

## 🌐 How Two Players Connect

**Player 1 (host machine):**
```
http://localhost:5001
```

**Player 2 (different computer, same Wi-Fi network):**

First find the host's local IP address.

- **Windows:** open PowerShell and run `ipconfig` — look for **IPv4 Address** under Wi-Fi
- **Mac/Linux:** run `ifconfig` or `ip a` — look for something like `192.168.x.x`

Then Player 2 opens:
```
http://192.168.x.x:5001
```

> ⚠️ Both computers must be on the **same local network** (same Wi-Fi or router).  
> Do **not** open the HTML file directly — always go through `http://localhost:5001`.

---

## 🎮 How to Play

### Lobby
1. Enter your name
2. **Player 1** clicks **Create Room** → receives a 6-character room code
3. **Player 2** enters the room code and clicks **Join**
4. Once both players are connected, **Player 1** clicks **▶ Start Game**

### Gameplay
| Action | How |
|--------|-----|
| Select a piece | Click one of the 3 pieces in the **NEXT PIECES** tray |
| Preview placement | Hover your mouse over the board — ghost piece appears |
| Place a piece | Click the board where you want to drop it |
| Clear lines | Fill a complete **row** or **column** — it clears automatically |
| Score points | Placement = 1pt per cell · Line clear = 10 × grid size × combo |
| Combo bonus | Clear lines on consecutive moves to multiply your score |

### Timer
- Both players share a synchronized **5-minute countdown**
- When time reaches 0, scores are compared and the winner is announced
- The timer turns **red** and pulses when under 30 seconds

---

## ❤️ Lives & Rescue System

Each player starts with **3 lives** (shown as ♥♥♥ in the HUD).

### When you run out of moves:
1. A **"⚠️ NO MOVES LEFT!"** panel appears over your board
2. Choose **CLEAR ROW** or **CLEAR COL** using the buttons
3. Hover over the board — the row or column highlights in red
4. **Click** to clear it → costs **1 life** → you get **3 fresh pieces**
5. Play resumes automatically

### Elimination:
- If you are stuck and have **0 lives** → you are **eliminated** (💀)
- If **both players** are eliminated → the game **ends immediately** (no waiting for the timer)
- If only one player is eliminated, the other keeps playing until the timer runs out

---

## 🏆 Scoring

| Event | Points |
|-------|--------|
| Place a piece | +1 per cell in the piece |
| Clear 1 line | +100 |
| Clear 2 lines at once | +200 × combo |
| Clear 3+ lines at once | +300+ × combo |
| Combo multiplier | Stacks each move you clear at least 1 line |

After 5 minutes (or both players eliminated), scores are compared:
- Higher score = **Winner** 🏆
- Equal scores = **Tie** 🤝

---

## 🔄 Rematch

After the game ends:
1. Either player clicks **🔄 Rematch**
2. The other player sees a prompt and clicks **✅ Accept Rematch**
3. Both boards reset, lives reset to 3, and a fresh 5-minute game begins

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, JavaScript, Canvas API |
| Backend | Python, Flask |
| Real-time | Flask-SocketIO (threading mode) |
| WebSocket | simple-websocket |

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| `WinError 10048` (port in use) | Server uses port **5001**. If still blocked, run `netstat -ano \| findstr :5001` then `taskkill /PID <number> /F` |
| `game.js 404` error | Make sure `game.js` is in `static/game.js` (not `game (1).js`) |
| Can't create/join room | You opened the HTML file directly. Use `http://localhost:5001` instead |
| Player 2 can't connect | Check firewall — allow port 5001. Confirm both are on same network |
| Rescue panel doesn't respond | Update `style.css` — old versions had a `pointer-events` bug on the panel |

---

## 📜 License

Free to use and modify for personal and educational projects.
