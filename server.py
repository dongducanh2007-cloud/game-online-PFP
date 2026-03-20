"""
BlockBlast Multiplayer Server
=============================
Manages rooms, syncs timers, and broadcasts game state to all players.
Run with: python server.py

NOTE: Uses threading mode (not eventlet) for broad Python 3.12+ compatibility.
"""

from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import time
import threading
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'blockblast_secret_2024'

# Use threading mode — works on all platforms without eventlet monkey-patching issues
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ─────────────────────────────────────────────
#  In-memory game state
# ─────────────────────────────────────────────
rooms = {}
# rooms[code] = {
#   'players': { sid: { 'name': str, 'role': 'A'|'B', 'score': int } },
#   'started': bool,
#   'time_left': int,       # seconds remaining
#   'timer_thread': Thread,
#   'game_over': bool,
# }


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def generate_room_code():
    """Generate a short 6-character alphanumeric room code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def get_room_for_player(sid):
    """Return the room code that a given socket ID belongs to."""
    for code, room in rooms.items():
        if sid in room['players']:
            return code
    return None


def timer_loop(room_code):
    """
    Background thread that counts down 300 seconds (5 minutes).
    Broadcasts 'timer_tick' every second.
    At 0, broadcasts 'game_over' with final scores.
    """
    while True:
        time.sleep(1)  # wait 1 second

        room = rooms.get(room_code)
        if not room or room['game_over']:
            break

        room['time_left'] -= 1

        # Broadcast remaining time to everyone in the room
        socketio.emit('timer_tick', {'time_left': room['time_left']}, room=room_code)

        if room['time_left'] <= 0:
            room['game_over'] = True
            # Collect final scores and determine winner
            _end_game(room_code)
            break


def _end_game(room_code):
    """Determine winner and broadcast game_over event."""
    room = rooms.get(room_code)
    if not room:
        return

    players = room['players']
    scores = {data['role']: {'score': data['score'], 'name': data['name']}
              for data in players.values()}

    # Determine winner
    score_a = scores.get('A', {}).get('score', 0)
    score_b = scores.get('B', {}).get('score', 0)

    if score_a > score_b:
        winner = 'A'
    elif score_b > score_a:
        winner = 'B'
    else:
        winner = 'TIE'

    socketio.emit('game_over', {
        'scores': scores,
        'winner': winner
    }, room=room_code)


# ─────────────────────────────────────────────
#  HTTP Routes
# ─────────────────────────────────────────────

@app.route('/')
def index():
    """Serve the main game page."""
    return render_template('index.html')


# ─────────────────────────────────────────────
#  SocketIO Events
# ─────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    print(f'[+] Client connected: {request.sid}')


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    room_code = get_room_for_player(sid)
    if room_code:
        room = rooms[room_code]
        player_name = room['players'][sid]['name']
        del room['players'][sid]

        # Notify remaining players
        emit('opponent_left', {'message': f'{player_name} disconnected.'}, room=room_code)
        leave_room(room_code)

        # Clean up empty rooms
        if len(room['players']) == 0:
            room['game_over'] = True  # stop timer thread
            del rooms[room_code]
            print(f'[~] Room {room_code} deleted (empty)')

    print(f'[-] Client disconnected: {request.sid}')


@socketio.on('create_room')
def on_create_room(data):
    """
    Player 1 creates a room.
    data = { 'player_name': str }
    """
    sid = request.sid
    name = data.get('player_name', 'Player A')

    # Generate unique code
    code = generate_room_code()
    while code in rooms:
        code = generate_room_code()

    rooms[code] = {
        'players': {
            sid: {'name': name, 'role': 'A', 'score': 0, 'lives': 3, 'dead': False}
        },
        'started': False,
        'time_left': 300,
        'timer_thread': None,
        'game_over': False,
    }

    join_room(code)
    emit('room_created', {'room_code': code, 'role': 'A', 'player_name': name})
    print(f'[+] Room {code} created by {name} ({sid})')


@socketio.on('join_room_request')
def on_join_room(data):
    """
    Player 2 joins an existing room.
    data = { 'room_code': str, 'player_name': str }
    """
    sid = request.sid
    code = data.get('room_code', '').strip().upper()
    name = data.get('player_name', 'Player B')

    if code not in rooms:
        emit('join_error', {'message': 'Room not found. Check the code and try again.'})
        return

    room = rooms[code]

    if len(room['players']) >= 2:
        emit('join_error', {'message': 'Room is full.'})
        return

    if room['started']:
        emit('join_error', {'message': 'Game already in progress.'})
        return

    room['players'][sid] = {'name': name, 'role': 'B', 'score': 0, 'lives': 3, 'dead': False}
    join_room(code)

    # Tell Player B their info
    emit('room_joined', {'room_code': code, 'role': 'B', 'player_name': name})

    # Tell everyone the room is now ready (2 players)
    player_list = {data['role']: data['name'] for data in room['players'].values()}
    socketio.emit('room_ready', {'players': player_list}, room=code)

    print(f'[+] {name} ({sid}) joined room {code}')


@socketio.on('start_game')
def on_start_game(data):
    """
    Either player can trigger game start (once room is ready).
    data = { 'room_code': str }
    """
    code = data.get('room_code', '')
    room = rooms.get(code)

    if not room or len(room['players']) < 2:
        emit('error', {'message': 'Need 2 players to start.'})
        return

    if room['started']:
        return  # already started

    room['started'] = True
    room['time_left'] = 300
    room['game_over'] = False

    # Reset scores and lives
    for p in room['players'].values():
        p['score']      = 0
        p['lives']      = 3
        p['dead']       = False
        p['eliminated'] = False

    # Broadcast game start
    socketio.emit('game_started', {'time_left': 300}, room=code)

    # Launch the countdown timer in a background thread
    t = threading.Thread(target=timer_loop, args=(code,), daemon=True)
    t.start()
    room['timer_thread'] = t

    print(f'[>] Game started in room {code}')


@socketio.on('score_update')
def on_score_update(data):
    """
    Called when a player clears lines and earns points.
    data = { 'room_code': str, 'score': int }
    Broadcasts updated score to opponent.
    """
    sid = request.sid
    code = data.get('room_code', '')
    new_score = data.get('score', 0)

    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    room['players'][sid]['score'] = new_score
    role = room['players'][sid]['role']

    # Tell everyone in the room about the score change
    socketio.emit('opponent_score', {
        'role': role,
        'score': new_score,
        'name': room['players'][sid]['name']
    }, room=code)


@socketio.on('lives_update')
def on_lives_update(data):
    """
    Called when a player uses a rescue (spends a life).
    data = { 'room_code': str, 'lives': int }
    """
    sid = request.sid
    code = data.get('room_code', '')
    lives = data.get('lives', 0)
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return
    room['players'][sid]['lives'] = lives
    role = room['players'][sid]['role']
    socketio.emit('opponent_lives', {'role': role, 'lives': lives}, room=code)


@socketio.on('player_eliminated')
def on_player_eliminated(data):
    """
    Called when a player runs out of lives and valid moves.
    If BOTH players are eliminated, end the game immediately.
    data = { 'room_code': str, 'score': int }
    """
    sid = request.sid
    code = data.get('room_code', '')
    final_score = data.get('score', 0)
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    room['players'][sid]['eliminated'] = True
    room['players'][sid]['score'] = final_score
    role = room['players'][sid]['role']

    # Tell the other player their opponent is out
    socketio.emit('opponent_eliminated', {'role': role}, room=code)

    # If ALL players eliminated → instant game over
    all_out = all(p.get('eliminated', False) for p in room['players'].values())
    if all_out and not room['game_over']:
        room['game_over'] = True
        _end_game(code)
        print(f'[!] Both players eliminated in room {code} — ending early')


@socketio.on('request_restart')
def on_request_restart(data):
    """
    A player requests a rematch.
    data = { 'room_code': str }
    """
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room:
        return

    sid = request.sid
    name = room['players'].get(sid, {}).get('name', 'Someone')

    # Notify the other player
    socketio.emit('restart_requested', {'from': name}, room=code)


@socketio.on('confirm_restart')
def on_confirm_restart(data):
    """
    Second player confirms the rematch. Resets and restarts.
    data = { 'room_code': str }
    """
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room:
        return

    # Stop existing timer if running
    room['game_over'] = True
    time.sleep(0.1)

    # Reset room state
    room['started'] = True
    room['time_left'] = 300
    room['game_over'] = False
    for p in room['players'].values():
        p['score']      = 0
        p['lives']      = 3
        p['dead']       = False
        p['eliminated'] = False

    # Tell clients to reset their boards
    socketio.emit('game_restarted', {'time_left': 300}, room=code)

    # Restart timer
    t = threading.Thread(target=timer_loop, args=(code,), daemon=True)
    t.start()
    room['timer_thread'] = t

    print(f'[>] Game restarted in room {code}')


@socketio.on('lives_update')
def on_lives_update(data):
    """
    A player spent a life on rescue. Broadcast to opponent so their UI updates.
    data = { 'room_code': str, 'lives': int }
    """
    sid = request.sid
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    lives = data.get('lives', 0)
    room['players'][sid]['lives'] = lives
    role = room['players'][sid]['role']

    # Tell everyone (including sender so both UIs stay in sync)
    socketio.emit('opponent_lives', {
        'role': role,
        'lives': lives,
    }, room=code)


@socketio.on('player_eliminated')
def on_player_eliminated(data):
    """
    A player ran out of lives and moves — they are eliminated.
    If BOTH players are now eliminated, end the game immediately.
    data = { 'room_code': str, 'score': int }
    """
    sid = request.sid
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    # Mark player as eliminated and record final score
    room['players'][sid]['eliminated'] = True
    room['players'][sid]['score'] = data.get('score', 0)
    role = room['players'][sid]['role']

    print(f'[!] Player {role} eliminated in room {code}')

    # Notify opponent
    socketio.emit('opponent_eliminated', {'role': role}, room=code)

    # Check if ALL players are eliminated
    all_eliminated = all(
        p.get('eliminated', False) for p in room['players'].values()
    )
    if all_eliminated and not room['game_over']:
        print(f'[!] Both players eliminated in room {code} — ending game')
        room['game_over'] = True
        _end_game(code)


# ─────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────

if __name__ == '__main__':
    PORT = 5001  # Changed from 5000 — macOS/Windows often have port 5000 occupied
    print("=" * 50)
    print("  BlockBlast Multiplayer Server")
    print(f"  Running on http://0.0.0.0:{PORT}")
    print("  Share your local IP with Player 2")
    print(f"  e.g. http://192.168.x.x:{PORT}")
    print("=" * 50)
    socketio.run(app, host='0.0.0.0', port=PORT, debug=False, allow_unsafe_werkzeug=True)
