/**
 * BlockBlast Multiplayer — game.js
 * Split-screen edition: each player sees their own board (left)
 * and a live mirror of the opponent's board (right).
 */
"use strict";

// ═══════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════
const GRID_SIZE     = 10;
const BOARD_PX      = 340;   // my board canvas size
const OPP_PX        = 340;   // opponent board canvas size
const CELL_PX       = BOARD_PX / GRID_SIZE;
const OPP_CELL_PX   = OPP_PX  / GRID_SIZE;
const PIECE_PX      = 100;
const GAME_DURATION = 300;
const MAX_LIVES     = 3;

const PIECES = [
  { shape:[[0,0]], color:'#ef4444' },
  { shape:[[0,0],[0,1]], color:'#f97316' },
  { shape:[[0,0],[1,0]], color:'#f97316' },
  { shape:[[0,0],[0,1],[0,2]], color:'#eab308' },
  { shape:[[0,0],[1,0],[2,0]], color:'#eab308' },
  { shape:[[0,0],[0,1],[1,0],[1,1]], color:'#22c55e' },
  { shape:[[0,0],[1,0],[2,0],[2,1]], color:'#3b82f6' },
  { shape:[[0,0],[0,1],[1,0],[2,0]], color:'#3b82f6' },
  { shape:[[0,0],[1,0],[1,1],[2,1]], color:'#8b5cf6' },
  { shape:[[0,1],[1,0],[1,1],[2,0]], color:'#8b5cf6' },
  { shape:[[0,0],[0,1],[0,2],[1,1]], color:'#ec4899' },
  { shape:[[0,0],[0,1],[0,2],[0,3]], color:'#06b6d4' },
  { shape:[[0,0],[1,0],[2,0],[3,0]], color:'#06b6d4' },
  { shape:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], color:'#f43f5e' },
  { shape:[[0,0],[0,1],[1,0]], color:'#a3e635' },
  { shape:[[0,0],[0,1],[1,1]], color:'#a3e635' },
  { shape:[[0,0],[1,0],[1,1]], color:'#fb923c' },
  { shape:[[0,1],[1,0],[1,1]], color:'#fb923c' },
  { shape:[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]], color:'#2dd4bf' },
  { shape:[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], color:'#2dd4bf' },
];

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let state = {
  socket: null,
  roomCode: '',
  myRole: '',
  myName: '',
  opponentName: '',

  // My board
  board: [],
  trayPieces: [null, null, null],
  selectedPiece: -1,
  hoverCell: { row:-1, col:-1 },

  // Opponent's board (received from server)
  oppBoard: [],
  oppLinesCleared: 0,

  myScore:      0,
  oppScore:     0,
  combo:        0,
  bestCombo:    0,
  linesCleared: 0,

  myLives:       MAX_LIVES,
  oppLives:      MAX_LIVES,
  myEliminated:  false,
  oppEliminated: false,

  rescueMode:      false,
  rescueType:      'row',
  rescueHoverIdx:  -1,

  timeLeft:          GAME_DURATION,
  gameActive:        false,
  stuckCheckPending: false,
  rematchRequested:  false,
};

let ctxBoard;       // my board
let ctxOpp;         // opponent board
let ctxPiece = [null, null, null];

// ═══════════════════════════════════════════
//  BOARD UTILITIES
// ═══════════════════════════════════════════
function createBoard() {
  return Array.from({ length:GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}
function getPieceCells(piece, ar, ac) {
  return piece.shape.map(([dr,dc]) => [ar+dr, ac+dc]);
}
function canPlace(board, piece, ar, ac) {
  for (const [r,c] of getPieceCells(piece,ar,ac)) {
    if (r<0||r>=GRID_SIZE||c<0||c>=GRID_SIZE) return false;
    if (board[r][c] !== 0) return false;
  }
  return true;
}
function placePiece(board, piece, ar, ac) {
  const nb = board.map(r=>[...r]);
  for (const [r,c] of getPieceCells(piece,ar,ac)) nb[r][c] = piece.color;
  return nb;
}
function clearLines(board) {
  const nb = board.map(r=>[...r]);
  const rowsToClear=[], colsToClear=[];
  for (let r=0;r<GRID_SIZE;r++) if(nb[r].every(c=>c!==0)) rowsToClear.push(r);
  for (let c=0;c<GRID_SIZE;c++) if(nb.every(r=>r[c]!==0)) colsToClear.push(c);
  for (const r of rowsToClear) for(let c=0;c<GRID_SIZE;c++) nb[r][c]=0;
  for (const c of colsToClear) for(let r=0;r<GRID_SIZE;r++) nb[r][c]=0;
  return { newBoard:nb, linesCleared:rowsToClear.length+colsToClear.length,
           rowsCleared:rowsToClear, colsCleared:colsToClear };
}
function calcScore(piece, linesCleared, combo) {
  return piece.shape.length + linesCleared * GRID_SIZE * 10 * Math.max(1, combo);
}
function hasAnyValidMove(board, trayPieces) {
  for (const p of trayPieces) {
    if (!p) continue;
    for (let r=0;r<GRID_SIZE;r++)
      for (let c=0;c<GRID_SIZE;c++)
        if (canPlace(board,p,r,c)) return true;
  }
  return false;
}
function hasValidMoveForPiece(piece) {
  for (let r=0;r<GRID_SIZE;r++)
    for (let c=0;c<GRID_SIZE;c++)
      if (canPlace(state.board,piece,r,c)) return true;
  return false;
}

// ═══════════════════════════════════════════
//  PIECE GENERATION
// ═══════════════════════════════════════════
function randomPiece() {
  const i = Math.floor(Math.random()*PIECES.length);
  return { ...PIECES[i], shape: PIECES[i].shape };
}
function fillTray() {
  for (let i=0;i<3;i++) if(!state.trayPieces[i]) state.trayPieces[i] = randomPiece();
  renderAllPreviews();
}

// ═══════════════════════════════════════════
//  SERIALIZE BOARD (for network)
// ═══════════════════════════════════════════
/** Send compact board state to server after every move */
function broadcastBoard() {
  state.socket.emit('board_update', {
    room_code:     state.roomCode,
    board:         state.board,
    lines_cleared: state.linesCleared,
  });
}

// ═══════════════════════════════════════════
//  LIVES UI
// ═══════════════════════════════════════════
function updateLivesUI() {
  const myEl  = document.getElementById('lives-my');
  const oppEl = document.getElementById('lives-opp');
  if (myEl)  myEl.innerHTML  = renderHearts(state.myLives, false);
  if (oppEl) oppEl.innerHTML = renderHearts(state.oppLives, true);
  const rlc = document.getElementById('rescue-lives-count');
  if (rlc) rlc.textContent = state.myLives;
}
function renderHearts(lives, isOpp) {
  let html = '';
  for (let i=0;i<MAX_LIVES;i++)
    html += `<span class="heart ${i<lives?'alive':'dead'}">${i<lives?'♥':'♡'}</span>`;
  return html;
}

// ═══════════════════════════════════════════
//  RESCUE SYSTEM
// ═══════════════════════════════════════════
function triggerStuck() {
  if (state.rescueMode || state.myEliminated) return;
  state.stuckCheckPending = false;
  state.gameActive = false;

  if (state.myLives > 0) {
    state.rescueMode     = true;
    state.rescueType     = 'row';
    state.rescueHoverIdx = -1;
    showRescuePanel();
    renderBoard();
  } else {
    eliminateMe();
  }
}

function showRescuePanel() {
  document.getElementById('rescue-panel')?.classList.remove('hidden');
  document.getElementById('canvas-board')?.classList.add('rescue-cursor');
  updateRescueToggleUI();
  updateLivesUI();
}
function hideRescuePanel() {
  document.getElementById('rescue-panel')?.classList.add('hidden');
  document.getElementById('canvas-board')?.classList.remove('rescue-cursor');
}
function updateRescueToggleUI() {
  document.getElementById('rescue-row-btn')?.classList.toggle('active', state.rescueType==='row');
  document.getElementById('rescue-col-btn')?.classList.toggle('active', state.rescueType==='col');
}

function executeRescue(idx) {
  if (!state.rescueMode || idx < 0 || idx >= GRID_SIZE) return;

  state.myLives = Math.max(0, state.myLives - 1);
  const hearts = document.querySelectorAll('#lives-my .heart');
  const lost = hearts[state.myLives];
  if (lost) { lost.classList.add('losing'); setTimeout(()=>lost.classList.remove('losing'),600); }

  const nb = state.board.map(r=>[...r]);
  if (state.rescueType==='row') { for(let c=0;c<GRID_SIZE;c++) nb[idx][c]=0; }
  else                          { for(let r=0;r<GRID_SIZE;r++) nb[r][idx]=0; }
  state.board = nb;

  animateClear(
    state.rescueType==='row'?[idx]:[],
    state.rescueType==='col'?[idx]:[],
    () => {
      state.rescueMode     = false;
      state.rescueHoverIdx = -1;
      hideRescuePanel();
      updateLivesUI();

      state.socket.emit('lives_update', { room_code:state.roomCode, lives:state.myLives });
      broadcastBoard();

      state.trayPieces    = [randomPiece(), randomPiece(), randomPiece()];
      state.selectedPiece = -1;
      renderBoard();
      renderAllPreviews();

      if (!hasAnyValidMove(state.board, state.trayPieces)) {
        setTimeout(triggerStuck, 350);
      } else {
        state.gameActive = true;
      }
    }
  );
}

function eliminateMe() {
  if (state.myEliminated) return;
  state.myEliminated = true;
  state.gameActive   = false;
  state.myLives      = 0;
  updateLivesUI();
  state.socket.emit('player_eliminated', { room_code:state.roomCode, score:state.myScore });
  showMessage('💀 Eliminated!',
    `You ran out of lives!<br>Score: <strong>${state.myScore}</strong><br>Waiting for result…`);
}

// ═══════════════════════════════════════════
//  RENDERING — MY BOARD
// ═══════════════════════════════════════════
function darkenColor(hex, amount=40) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.max(0,r-amount)},${Math.max(0,g-amount)},${Math.max(0,b-amount)})`;
}
function drawRoundRect(ctx,x,y,w,h,r,fill,stroke) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function drawCell(ctx, col, row, color, cs, alpha=1.0) {
  const x=col*cs+1, y=row*cs+1, s=cs-2;
  ctx.globalAlpha=alpha;
  drawRoundRect(ctx,x,y,s,s,4,color,darkenColor(color,60));
  ctx.globalAlpha=alpha*0.35;
  drawRoundRect(ctx,x+2,y+2,s-4,(s-4)/2.5,3,'#ffffff',null);
  ctx.globalAlpha=1.0;
}

function renderBoard() {
  if (!ctxBoard) return;
  const ctx=ctxBoard, cs=CELL_PX;
  ctx.fillStyle='#0f0f1c'; ctx.fillRect(0,0,BOARD_PX,BOARD_PX);

  ctx.strokeStyle='#2a2a45'; ctx.lineWidth=0.5;
  for(let i=0;i<=GRID_SIZE;i++){
    ctx.beginPath();ctx.moveTo(i*cs,0);ctx.lineTo(i*cs,BOARD_PX);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*cs);ctx.lineTo(BOARD_PX,i*cs);ctx.stroke();
  }
  for(let r=0;r<GRID_SIZE;r++)
    for(let c=0;c<GRID_SIZE;c++)
      if(state.board[r][c]) drawCell(ctx,c,r,state.board[r][c],cs);

  // Rescue highlight
  if(state.rescueMode && state.rescueHoverIdx>=0){
    ctx.globalAlpha=0.38; ctx.fillStyle='#ef4444';
    if(state.rescueType==='row') ctx.fillRect(0,state.rescueHoverIdx*cs,BOARD_PX,cs);
    else                         ctx.fillRect(state.rescueHoverIdx*cs,0,cs,BOARD_PX);
    ctx.globalAlpha=1.0;
    ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle='#ff6b6b';ctx.lineWidth=2.5;
    if(state.rescueType==='row') ctx.strokeRect(1,state.rescueHoverIdx*cs+1,BOARD_PX-2,cs-2);
    else                         ctx.strokeRect(state.rescueHoverIdx*cs+1,1,cs-2,BOARD_PX-2);
    ctx.restore();
    return;
  }

  // Ghost piece
  const sel=state.selectedPiece;
  if(sel>=0&&state.trayPieces[sel]&&state.hoverCell.row>=0&&state.gameActive){
    const piece=state.trayPieces[sel], {row:hr,col:hc}=state.hoverCell;
    const fits=canPlace(state.board,piece,hr,hc);
    for(const [dr,dc] of piece.shape){
      const r=hr+dr, c=hc+dc;
      if(r>=0&&r<GRID_SIZE&&c>=0&&c<GRID_SIZE)
        drawCell(ctx,c,r,fits?piece.color:'#ef4444',cs,fits?0.5:0.3);
    }
  }
}

// ═══════════════════════════════════════════
//  RENDERING — OPPONENT BOARD
// ═══════════════════════════════════════════
function renderOppBoard() {
  if (!ctxOpp) return;
  const ctx=ctxOpp, cs=OPP_CELL_PX;
  ctx.fillStyle='#0f0f1c'; ctx.fillRect(0,0,OPP_PX,OPP_PX);

  ctx.strokeStyle='#2a2a3a'; ctx.lineWidth=0.5;
  for(let i=0;i<=GRID_SIZE;i++){
    ctx.beginPath();ctx.moveTo(i*cs,0);ctx.lineTo(i*cs,OPP_PX);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,i*cs);ctx.lineTo(OPP_PX,i*cs);ctx.stroke();
  }

  if(!state.oppBoard || state.oppBoard.length===0) return;
  for(let r=0;r<GRID_SIZE;r++)
    for(let c=0;c<GRID_SIZE;c++)
      if(state.oppBoard[r][c]) drawCell(ctx,c,r,state.oppBoard[r][c],cs);
}

// ═══════════════════════════════════════════
//  RENDERING — PIECE PREVIEWS
// ═══════════════════════════════════════════
function renderPiecePreview(index) {
  const ctx=ctxPiece[index]; if(!ctx) return;
  const piece=state.trayPieces[index];
  ctx.clearRect(0,0,PIECE_PX,PIECE_PX);
  ctx.fillStyle='#12121f'; ctx.fillRect(0,0,PIECE_PX,PIECE_PX);
  if(!piece) return;
  const rows=piece.shape.map(([r])=>r), cols=piece.shape.map(([,c])=>c);
  const minR=Math.min(...rows),maxR=Math.max(...rows);
  const minC=Math.min(...cols),maxC=Math.max(...cols);
  const cs=Math.min(Math.floor((PIECE_PX-12)/Math.max(maxR-minR+1,maxC-minC+1)),28);
  const offX=Math.floor((PIECE_PX-(maxC-minC+1)*cs)/2)-minC*cs;
  const offY=Math.floor((PIECE_PX-(maxR-minR+1)*cs)/2)-minR*cs;
  for(const [dr,dc] of piece.shape){
    const px=offX+dc*cs, py=offY+dr*cs;
    ctx.globalAlpha=1;
    drawRoundRect(ctx,px+1,py+1,cs-2,cs-2,3,piece.color,darkenColor(piece.color,60));
    ctx.globalAlpha=0.35;
    drawRoundRect(ctx,px+3,py+3,cs-6,(cs-6)/2.5,2,'#ffffff',null);
    ctx.globalAlpha=1;
  }
}
function renderAllPreviews() {
  for(let i=0;i<3;i++) renderPiecePreview(i);
  updatePieceSelectionUI();
}
function updatePieceSelectionUI() {
  for(let i=0;i<3;i++){
    const canvas=document.getElementById(`canvas-piece-${i}`); if(!canvas) continue;
    canvas.classList.toggle('selected', state.selectedPiece===i);
    const piece=state.trayPieces[i];
    canvas.classList.toggle('disabled',!piece||(!hasValidMoveForPiece(piece)&&state.gameActive&&!state.rescueMode));
  }
}

// ═══════════════════════════════════════════
//  ANIMATIONS
// ═══════════════════════════════════════════
function animateClear(rowsCleared, colsCleared, callback) {
  let frame=0; const FRAMES=8;
  function flashFrame(){
    renderBoard();
    ctxBoard.globalAlpha=0.6*(1-frame/FRAMES); ctxBoard.fillStyle='#ffffff';
    for(const r of rowsCleared) ctxBoard.fillRect(0,r*CELL_PX,BOARD_PX,CELL_PX);
    for(const c of colsCleared) ctxBoard.fillRect(c*CELL_PX,0,CELL_PX,BOARD_PX);
    ctxBoard.globalAlpha=1.0;
    frame++;
    if(frame<FRAMES) requestAnimationFrame(flashFrame);
    else { renderBoard(); if(callback) callback(); }
  }
  flashFrame();
}
function showScorePop(text, x, y) {
  const bw=document.querySelector('.my-side .board-wrapper');
  if(!bw) return;
  const pop=document.createElement('div');
  pop.className='score-pop';
  pop.textContent=typeof text==='number'?`+${text}`:text;
  pop.style.left=`${x}px`; pop.style.top=`${y}px`;
  bw.appendChild(pop); setTimeout(()=>pop.remove(),1000);
}

// ═══════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════
function mouseToCell(canvas, evt, boardSize) {
  const rect=canvas.getBoundingClientRect();
  return {
    row: Math.floor((evt.clientY-rect.top) *(boardSize/rect.height)/CELL_PX),
    col: Math.floor((evt.clientX-rect.left)*(boardSize/rect.width) /CELL_PX),
  };
}

function setupBoardInput() {
  const canvas=document.getElementById('canvas-board');

  canvas.addEventListener('mousemove', (evt)=>{
    const {row,col}=mouseToCell(canvas,evt,BOARD_PX);
    if(state.rescueMode){
      state.rescueHoverIdx=state.rescueType==='row'?row:col;
      renderBoard(); return;
    }
    if(!state.gameActive) return;
    state.hoverCell={row,col}; renderBoard();
  });

  canvas.addEventListener('mouseleave', ()=>{
    state.hoverCell={row:-1,col:-1}; state.rescueHoverIdx=-1; renderBoard();
  });

  canvas.addEventListener('click', (evt)=>{
    const {row,col}=mouseToCell(canvas,evt,BOARD_PX);
    if(state.rescueMode){ executeRescue(state.rescueType==='row'?row:col); return; }
    if(!state.gameActive) return;

    const sel=state.selectedPiece;
    if(sel<0||!state.trayPieces[sel]) return;
    const piece=state.trayPieces[sel];
    if(!canPlace(state.board,piece,row,col)){
      canvas.style.filter='brightness(1.6) saturate(2)';
      setTimeout(()=>{canvas.style.filter='';},150); return;
    }

    state.board=placePiece(state.board,piece,row,col);
    const {newBoard,linesCleared,rowsCleared,colsCleared}=clearLines(state.board);
    state.board=newBoard;
    if(linesCleared>0) state.combo++; else state.combo=0;
    if(state.combo>state.bestCombo) state.bestCombo=state.combo;
    const earned=calcScore(piece,linesCleared,state.combo);
    state.myScore+=earned; state.linesCleared+=linesCleared;
    state.trayPieces[sel]=null; state.selectedPiece=-1;

    if(linesCleared>0){
      animateClear(rowsCleared,colsCleared,()=>{ renderBoard(); afterPlace(earned,row,col); });
    } else { renderBoard(); afterPlace(earned,row,col); }
  });
}

function afterPlace(earned, row, col) {
  showScorePop(earned, col*CELL_PX, row*CELL_PX);
  updateScoreUI();
  fillTray();
  renderAllPreviews();
  state.socket.emit('score_update',{ room_code:state.roomCode, score:state.myScore });
  broadcastBoard();  // send board to opponent

  if(!hasAnyValidMove(state.board,state.trayPieces)){
    if(!state.stuckCheckPending){
      state.stuckCheckPending=true;
      setTimeout(triggerStuck,400);
    }
  }
}

function setupPieceInput() {
  for(let i=0;i<3;i++){
    document.getElementById(`canvas-piece-${i}`).addEventListener('click',()=>{
      if(!state.gameActive) return;
      if(!state.trayPieces[i]) return;
      state.selectedPiece=(state.selectedPiece===i)?-1:i;
      updatePieceSelectionUI(); renderBoard();
    });
  }
}

// ═══════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════
function updateScoreUI() {
  document.getElementById('hud-my-score').textContent  = state.myScore;
  document.getElementById('panel-score').textContent   = state.myScore;
  document.getElementById('panel-combo').textContent   = state.bestCombo;
  document.getElementById('panel-lines').textContent   = state.linesCleared;
}
function updateOppUI() {
  document.getElementById('hud-opp-score').textContent  = state.oppScore;
  document.getElementById('opp-panel-score').textContent = state.oppScore;
  document.getElementById('opp-panel-lines').textContent = state.oppLinesCleared;
}
function updateTimerUI() {
  const mins=Math.floor(state.timeLeft/60), secs=state.timeLeft%60;
  const el=document.getElementById('hud-timer');
  el.textContent=`${mins}:${String(secs).padStart(2,'0')}`;
  el.classList.toggle('urgent', state.timeLeft<=30);
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showMessage(title, body) {
  document.getElementById('overlay-title').textContent=title;
  document.getElementById('overlay-body').innerHTML=body;
  document.getElementById('game-overlay').classList.remove('hidden');
}
function hideMessage() {
  document.getElementById('game-overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════
//  GAME LIFECYCLE
// ═══════════════════════════════════════════
function initGame() {
  state.board=createBoard(); state.oppBoard=createBoard();
  state.trayPieces=[null,null,null]; state.selectedPiece=-1;
  state.hoverCell={row:-1,col:-1};
  state.myScore=0; state.oppScore=0; state.combo=0; state.bestCombo=0;
  state.linesCleared=0; state.oppLinesCleared=0;
  state.myLives=MAX_LIVES; state.oppLives=MAX_LIVES;
  state.myEliminated=false; state.oppEliminated=false;
  state.rescueMode=false; state.rescueHoverIdx=-1;
  state.stuckCheckPending=false; state.gameActive=true;

  document.getElementById('hud-my-name').textContent  = state.myName;
  document.getElementById('hud-opp-name').textContent = state.opponentName||'Opponent';
  document.getElementById('my-side-name').textContent  = state.myName;
  document.getElementById('opp-side-name').textContent = state.opponentName||'Waiting…';
  document.getElementById('opp-status-text').textContent = 'Playing';
  document.getElementById('opp-eliminated-overlay')?.classList.add('hidden');

  hideMessage(); hideRescuePanel();
  updateScoreUI(); updateOppUI(); updateLivesUI(); updateTimerUI();

  state.trayPieces=[randomPiece(),randomPiece(),randomPiece()];
  renderBoard(); renderOppBoard(); renderAllPreviews();
}

function endGame(winner, scores) {
  state.gameActive=false;
  const myRole=state.myRole, oppRole=myRole==='A'?'B':'A';
  const myFinal  = scores[myRole]  ? scores[myRole].score  : state.myScore;
  const oppFinal = scores[oppRole] ? scores[oppRole].score : state.oppScore;
  let title, body;
  if(winner==='TIE'){
    title="🤝 It's a Tie!"; body=`Both scored <strong>${myFinal}</strong> pts.`;
  } else if(winner===myRole){
    title='🏆 You Win!'; body=`Your score: <strong>${myFinal}</strong><br>Opponent: <strong>${oppFinal}</strong>`;
  } else {
    title='😢 You Lose'; body=`Your score: <strong>${myFinal}</strong><br>Opponent: <strong>${oppFinal}</strong>`;
  }
  showMessage(title,body);
}

// ═══════════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════════
function setupSocket() {
  state.socket=io();

  state.socket.on('connect',()=>console.log('[Socket] Connected'));

  state.socket.on('room_created',(data)=>{
    state.roomCode=data.room_code; state.myRole=data.role; state.myName=data.player_name;
    document.getElementById('display-room-code').textContent=data.room_code;
    document.getElementById('waiting-status').textContent='Waiting for opponent…';
    showScreen('screen-waiting');
  });

  state.socket.on('room_joined',(data)=>{
    state.roomCode=data.room_code; state.myRole=data.role; state.myName=data.player_name;
    document.getElementById('display-room-code').textContent=data.room_code;
    document.getElementById('waiting-status').textContent='Connected! Waiting for host…';
    showScreen('screen-waiting');
  });

  state.socket.on('join_error',(data)=>{
    document.getElementById('lobby-status').textContent=data.message;
  });

  state.socket.on('room_ready',(data)=>{
    state.opponentName=data.players[state.myRole==='A'?'B':'A'];
    document.getElementById('waiting-status').textContent=`${state.opponentName} joined! Ready!`;
    if(state.myRole==='A') document.getElementById('btn-start-game').style.display='block';
  });

  state.socket.on('game_started',(data)=>{
    state.timeLeft=data.time_left;
    showScreen('screen-game'); initGame(); updateTimerUI();
  });

  state.socket.on('timer_tick',(data)=>{
    state.timeLeft=data.time_left; updateTimerUI();
  });

  state.socket.on('opponent_score',(data)=>{
    if(data.role!==state.myRole){
      state.oppScore=data.score;
      document.getElementById('hud-opp-score').textContent=data.score;
      document.getElementById('opp-panel-score').textContent=data.score;
      document.getElementById('hud-opp-name').textContent=data.name;
    }
  });

  // ── Live board mirror ────────────────────────
  state.socket.on('opponent_board',(data)=>{
    if(data.role!==state.myRole){
      state.oppBoard=data.board;
      state.oppLinesCleared=data.lines_cleared||0;
      document.getElementById('opp-panel-lines').textContent=state.oppLinesCleared;
      renderOppBoard();
    }
  });

  state.socket.on('opponent_lives',(data)=>{
    if(data.role!==state.myRole){ state.oppLives=data.lives; updateLivesUI(); }
  });

  state.socket.on('opponent_eliminated',(data)=>{
    if(data.role!==state.myRole){
      state.oppEliminated=true; state.oppLives=0;
      updateLivesUI();
      document.getElementById('opp-eliminated-overlay')?.classList.remove('hidden');
      document.getElementById('opp-status-text').textContent='Eliminated 💀';
      showScorePop('💀 Opp out!',60,10);
    }
  });

  state.socket.on('game_over',(data)=>{
    state.gameActive=false; state.timeLeft=0; updateTimerUI();
    endGame(data.winner,data.scores);
  });

  state.socket.on('opponent_left',(data)=>{
    showMessage('⚠️ Opponent Left',data.message+'<br>Game ended.');
    state.gameActive=false;
  });

  state.socket.on('restart_requested',(data)=>{
    state.rematchRequested=true;
    document.getElementById('overlay-title').textContent='🔄 Rematch?';
    document.getElementById('overlay-body').innerHTML=`<strong>${data.from}</strong> wants a rematch!`;
    document.getElementById('btn-rematch').textContent='✅ Accept';
    document.getElementById('game-overlay').classList.remove('hidden');
  });

  state.socket.on('game_restarted',(data)=>{
    state.timeLeft=data.time_left; initGame(); updateTimerUI(); hideMessage();
    state.rematchRequested=false;
    document.getElementById('btn-rematch').textContent='🔄 Rematch';
    document.getElementById('btn-rematch').disabled=false;
  });
}

// ═══════════════════════════════════════════
//  LOBBY + RESCUE UI
// ═══════════════════════════════════════════
function setupLobbyUI() {
  const names=['Puzzler','BlockMaster','GridHero','TileSmash','ClearBot'];
  document.getElementById('input-name').value=
    names[Math.floor(Math.random()*names.length)]+Math.floor(Math.random()*99+1);

  document.getElementById('btn-create').addEventListener('click',()=>{
    const name=document.getElementById('input-name').value.trim()||'Player A';
    document.getElementById('lobby-status').textContent='';
    state.socket.emit('create_room',{player_name:name});
  });
  document.getElementById('btn-join').addEventListener('click',()=>{
    const name=document.getElementById('input-name').value.trim()||'Player B';
    const code=document.getElementById('input-code').value.trim().toUpperCase();
    if(!code){document.getElementById('lobby-status').textContent='Enter a room code.';return;}
    document.getElementById('lobby-status').textContent='';
    state.socket.emit('join_room_request',{player_name:name,room_code:code});
  });
  document.getElementById('input-code').addEventListener('keydown',(e)=>{
    if(e.key==='Enter') document.getElementById('btn-join').click();
  });
  document.getElementById('btn-copy-code').addEventListener('click',()=>{
    navigator.clipboard.writeText(document.getElementById('display-room-code').textContent)
      .then(()=>{
        document.getElementById('btn-copy-code').textContent='✅ Copied!';
        setTimeout(()=>document.getElementById('btn-copy-code').textContent='📋 Copy',2000);
      });
  });
  document.getElementById('btn-start-game').addEventListener('click',()=>{
    state.socket.emit('start_game',{room_code:state.roomCode});
  });
  document.getElementById('btn-lobby').addEventListener('click',()=>location.reload());
  document.getElementById('btn-rematch').addEventListener('click',()=>{
    if(state.rematchRequested){
      state.socket.emit('confirm_restart',{room_code:state.roomCode});
    } else {
      state.socket.emit('request_restart',{room_code:state.roomCode});
      document.getElementById('overlay-body').innerHTML='Waiting for opponent to accept…';
      document.getElementById('btn-rematch').disabled=true;
    }
  });
  document.getElementById('rescue-row-btn')?.addEventListener('click',()=>{
    state.rescueType='row'; state.rescueHoverIdx=-1; updateRescueToggleUI(); renderBoard();
  });
  document.getElementById('rescue-col-btn')?.addEventListener('click',()=>{
    state.rescueType='col'; state.rescueHoverIdx=-1; updateRescueToggleUI(); renderBoard();
  });
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
window.addEventListener('load',()=>{
  ctxBoard    = document.getElementById('canvas-board').getContext('2d');
  ctxOpp      = document.getElementById('canvas-opp-board').getContext('2d');
  ctxPiece[0] = document.getElementById('canvas-piece-0').getContext('2d');
  ctxPiece[1] = document.getElementById('canvas-piece-1').getContext('2d');
  ctxPiece[2] = document.getElementById('canvas-piece-2').getContext('2d');

  state.board=createBoard(); state.oppBoard=createBoard();
  renderBoard(); renderOppBoard();
  setupBoardInput(); setupPieceInput(); setupLobbyUI(); setupSocket();
  console.log('[BlockBlast] Split-screen ready!');
});
