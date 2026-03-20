"""
BlockBlast Multiplayer — server.py
====================================
Flask + Flask-SocketIO backend.
Run with:  python server.py
Open in browser:  http://localhost:5001

Lives system:
  - Each player starts with 3 lives
  - When stuck, player spends 1 life to clear a row/col (rescue)
  - When a player hits 0 lives and is still stuck → eliminated
  - When BOTH players are eliminated → game ends immediately
  - Otherwise the 5-minute timer ends the game
"""

from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import time
import threading
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'blockblast_2024'

# threading async_mode — compatible with Python 3.12+ (no eventlet needed)
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')

# ─────────────────────────────────────────────
#  In-memory rooms store
#
#  rooms[code] = {
#    'players': {
#      sid: {
#        'name': str, 'role': 'A'|'B',
#        'score': int, 'lives': int,
#        'eliminated': bool
#      }
#    },
#    'started':  bool,
#    'time_left': int,   # seconds
#    'game_over': bool,
#  }
# ─────────────────────────────────────────────
rooms = {}


# ─── Helpers ──────────────────────────────────

def make_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


def room_of(sid):
    for code, room in rooms.items():
        if sid in room['players']:
            return code
    return None


def fresh_player(name, role):
    return {
        'name': name, 'role': role,
        'score': 0, 'lives': 3, 'eliminated': False
    }


def reset_players(room):
    for p in room['players'].values():
        p['score']      = 0
        p['lives']      = 3
        p['eliminated'] = False


def end_game(code):
    """Determine winner and fire game_over to everyone in the room."""
    room = rooms.get(code)
    if not room:
        return

    scores = {
        p['role']: {'score': p['score'], 'name': p['name']}
        for p in room['players'].values()
    }
    sa = scores.get('A', {}).get('score', 0)
    sb = scores.get('B', {}).get('score', 0)

    if sa > sb:   winner = 'A'
    elif sb > sa: winner = 'B'
    else:         winner = 'TIE'

    socketio.emit('game_over', {'scores': scores, 'winner': winner}, room=code)
    print(f'[=] Game over in room {code} — winner: {winner}  (A:{sa} B:{sb})')


def timer_loop(code):
    """Countdown thread — ticks every second, fires game_over at 0."""
    while True:
        time.sleep(1)
        room = rooms.get(code)
        if not room or room['game_over']:
            break

        room['time_left'] -= 1
        socketio.emit('timer_tick', {'time_left': room['time_left']}, room=code)

        if room['time_left'] <= 0:
            room['game_over'] = True
            end_game(code)
            break


def start_timer(code):
    t = threading.Thread(target=timer_loop, args=(code,), daemon=True)
    t.start()


# ─── HTTP ─────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ─── SocketIO events ──────────────────────────

@socketio.on('connect')
def on_connect():
    print(f'[+] {request.sid} connected')


@socketio.on('disconnect')
def on_disconnect():
    sid  = request.sid
    code = room_of(sid)
    if not code:
        return

    room = rooms[code]
    name = room['players'][sid]['name']
    del room['players'][sid]

    socketio.emit('opponent_left', {'message': f'{name} disconnected.'}, room=code)
    leave_room(code)

    if not room['players']:          # last player left — clean up
        room['game_over'] = True
        del rooms[code]
        print(f'[~] Room {code} removed (empty)')

    print(f'[-] {sid} ({name}) disconnected')


@socketio.on('create_room')
def on_create_room(data):
    sid  = request.sid
    name = data.get('player_name', 'Player A')

    code = make_room_code()
    while code in rooms:
        code = make_room_code()

    rooms[code] = {
        'players':   {sid: fresh_player(name, 'A')},
        'started':   False,
        'time_left': 300,
        'game_over': False,
    }
    join_room(code)
    emit('room_created', {'room_code': code, 'role': 'A', 'player_name': name})
    print(f'[+] Room {code} created by {name}')


@socketio.on('join_room_request')
def on_join_room(data):
    sid  = request.sid
    code = data.get('room_code', '').strip().upper()
    name = data.get('player_name', 'Player B')

    if code not in rooms:
        emit('join_error', {'message': 'Room not found.'})
        return
    room = rooms[code]
    if len(room['players']) >= 2:
        emit('join_error', {'message': 'Room is full.'})
        return
    if room['started']:
        emit('join_error', {'message': 'Game already started.'})
        return

    room['players'][sid] = fresh_player(name, 'B')
    join_room(code)
    emit('room_joined', {'room_code': code, 'role': 'B', 'player_name': name})

    player_names = {p['role']: p['name'] for p in room['players'].values()}
    socketio.emit('room_ready', {'players': player_names}, room=code)
    print(f'[+] {name} joined room {code}')


@socketio.on('start_game')
def on_start_game(data):
    code = data.get('room_code', '')
    room = rooms.get(code)

    if not room or len(room['players']) < 2:
        emit('error', {'message': 'Need 2 players to start.'})
        return
    if room['started']:
        return

    room['started']   = True
    room['time_left'] = 300
    room['game_over'] = False
    reset_players(room)

    socketio.emit('game_started', {'time_left': 300}, room=code)
    start_timer(code)
    print(f'[>] Game started in room {code}')


@socketio.on('score_update')
def on_score_update(data):
    """Player reports their new cumulative score."""
    sid  = request.sid
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    room['players'][sid]['score'] = data.get('score', 0)
    role = room['players'][sid]['role']
    socketio.emit('opponent_score', {
        'role':  role,
        'score': room['players'][sid]['score'],
        'name':  room['players'][sid]['name'],
    }, room=code)


@socketio.on('board_update')
def on_board_update(data):
    """
    Player sends their full board state after every move.
    Server broadcasts it to the opponent as a live mirror.
    data = { 'room_code': str, 'board': [[...]], 'lines_cleared': int }
    """
    sid  = request.sid
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return
    role = room['players'][sid]['role']
    # Relay to everyone in the room (opponent will filter by role)
    socketio.emit('opponent_board', {
        'role':          role,
        'board':         data.get('board', []),
        'lines_cleared': data.get('lines_cleared', 0),
    }, room=code)


@socketio.on('lives_update')
def on_lives_update(data):
    """Player used a rescue — broadcast updated life count to opponent."""
    sid  = request.sid
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    lives = data.get('lives', 0)
    room['players'][sid]['lives'] = lives
    role  = room['players'][sid]['role']
    socketio.emit('opponent_lives', {'role': role, 'lives': lives}, room=code)
    print(f'[♥] Player {role} used rescue — lives left: {lives}')


@socketio.on('player_eliminated')
def on_player_eliminated(data):
    """
    Player has 0 lives and no valid moves — they're eliminated.
    If BOTH players are eliminated, end the game immediately.
    """
    sid  = request.sid
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room or sid not in room['players']:
        return

    room['players'][sid]['eliminated'] = True
    room['players'][sid]['lives']      = 0
    room['players'][sid]['score']      = data.get('score', 0)
    role = room['players'][sid]['role']

    print(f'[💀] Player {role} eliminated in room {code}')
    socketio.emit('opponent_eliminated', {'role': role}, room=code)

    # Both out? End game now without waiting for timer
    if all(p['eliminated'] for p in room['players'].values()):
        if not room['game_over']:
            room['game_over'] = True
            end_game(code)
            print(f'[!] Both eliminated in {code} — instant game over')


@socketio.on('request_restart')
def on_request_restart(data):
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room:
        return
    name = room['players'].get(request.sid, {}).get('name', 'Someone')
    socketio.emit('restart_requested', {'from': name}, room=code)


@socketio.on('confirm_restart')
def on_confirm_restart(data):
    code = data.get('room_code', '')
    room = rooms.get(code)
    if not room:
        return

    room['game_over'] = True          # stop old timer
    time.sleep(0.15)

    room['started']   = True
    room['time_left'] = 300
    room['game_over'] = False
    reset_players(room)

    socketio.emit('game_restarted', {'time_left': 300}, room=code)
    start_timer(code)
    print(f'[>] Game restarted in room {code}')


# ─── Entry point ──────────────────────────────

if __name__ == '__main__':
    PORT = 5001
    print('=' * 50)
    print('  BlockBlast Multiplayer Server')
    print(f'  http://localhost:{PORT}')
    print(f'  (share your LAN IP for Player 2)')
    print('=' * 50)
    # 0.0.0.0 listens on all interfaces so LAN players can connect
    socketio.run(app, host='0.0.0.0', port=PORT,
                 debug=False, allow_unsafe_werkzeug=True)
