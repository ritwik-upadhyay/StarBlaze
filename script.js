const SOUND_PATHS = {
  shoot: "Shoot.mp3",
  move:  "Tap.mp3",
  hit:   "Hit.mp3",
  gameOver: "Game_Over.mp3",
  bgMusic: "StarBlaze_Score.mp3"
};

// ----------------- SOUND OBJECTS -----------------
const shootSound = new Audio(SOUND_PATHS.shoot);
const moveSound  = new Audio(SOUND_PATHS.move);
const hitSound   = new Audio(SOUND_PATHS.hit);
const gameOverSound = new Audio(SOUND_PATHS.gameOver);

// volumes (tweak)
// target volumes (tweak)
const BGM_TARGET_VOLUME = 0.6;
shootSound.volume = 0.6;
moveSound.volume = 0.3;
hitSound.volume = 0.5;
gameOverSound.volume = 0.6;

// ----------------- DOM & CANVAS -----------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
const gameWrapper = document.getElementById("gameWrapper");
const player = document.getElementById("player");
const alien = document.getElementById("alien");

const resultPanel = document.getElementById("result");
const resultScore = document.getElementById("score");
const liveScore = document.getElementById("liveScore");
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBigBtn = document.getElementById('resumeBigBtn');

const countdownScreen = document.getElementById("countdownScreen");
const countdownText = document.getElementById("countdownText");

const leftBtn  = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const shootBtn = document.getElementById("shootBtn");
const pauseBtn = document.getElementById("pauseBtn");
const playBtn  = document.getElementById("playBtn");

let bgMusic = document.getElementById("bgMusic");
if (!bgMusic) {
  bgMusic = document.createElement("audio");
  bgMusic.id = "bgMusic";
  bgMusic.src = SOUND_PATHS.bgMusic;
  bgMusic.loop = true;
  document.body.appendChild(bgMusic);
}
// initialize at target volume (will be controlled/faded when starting)
bgMusic.volume = BGM_TARGET_VOLUME;

// fade control
let bgFadeInterval = null;

// ----------------- BACKGROUND SCROLL -----------------
const bg = new Image();
bg.src = "field.png";
let bgY = 0;
let bgSpeed = 7;
let bgRAF = null; // requestAnimationFrame id (null when stopped)
let _bgSavedSpeed = null; // used to freeze/unfreeze the background without stopping RAF

function _bgDrawFrame(){
  if (!ctx) return;
  bgY += bgSpeed;
  // use logical (CSS) height so movement and wrapping are consistent
  if (bgY >= logicalH) bgY = 0;
  ctx.clearRect(0,0,logicalW,logicalH);
  ctx.drawImage(bg,0,bgY,logicalW,logicalH);
  ctx.drawImage(bg,0,bgY-logicalH,logicalW,logicalH);
  bgRAF = requestAnimationFrame(_bgDrawFrame);
}

function startBackgroundAnimation(){
  if (bgRAF) return; // already running
  // ensure logical sizes are up to date before starting
  try{ resizeCanvasToWrapper(); }catch(e){}
  // start loop
  bgRAF = requestAnimationFrame(_bgDrawFrame);
}

function stopBackgroundAnimation(){
  if (!bgRAF) return;
  cancelAnimationFrame(bgRAF);
  bgRAF = null;
}

// ----------------- STATE -----------------
let isGameOver = false;
let gameStarted = false;
let paused = false;
let score = 0;
let alienHidden = false;
let alienFallInterval = null;
let alienMoveInterval = null;

let moveLeft = false;
let moveRight = false;

// responsive canvas / logical size helpers
let DPR = window.devicePixelRatio || 1;
let logicalW = canvas ? (canvas.clientWidth || 390) : 390;
let logicalH = canvas ? (canvas.clientHeight || 600) : 600;

function resizeCanvasToWrapper(){
  if (!canvas || !ctx || !gameWrapper) return;
  DPR = window.devicePixelRatio || 1;
  // logical (CSS) size
  logicalW = gameWrapper.clientWidth || 390;
  logicalH = gameWrapper.clientHeight || 600;
  // set internal pixel size for sharp rendering
  canvas.width = Math.max(1, Math.floor(logicalW * DPR));
  canvas.height = Math.max(1, Math.floor(logicalH * DPR));
  // ensure CSS size fills wrapper
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  // map drawing operations to CSS pixels
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // also update player / alien pixel widths to match CSS percentages
  try{
    if (player){
      const pW = Math.min(Math.round(logicalW * 0.18), 140);
      player.style.width = pW + 'px';
      // center player at bottom when game hasn't started yet
      if (!gameStarted) {
        player.style.left = Math.round((logicalW - pW) / 2) + 'px';
      }
      // ensure no leftover CSS transform interferes with pixel positioning
      player.style.transform = 'none';
    }
    if (alien){
      // increase enemy ship size to be more prominent (22% of wrapper, capped)
      const aW = Math.min(Math.round(logicalW * 0.22), 180);
      alien.style.width = aW + 'px';
    }
  }catch(e){}
}

// run on resize/orientation changes
window.addEventListener('resize', ()=>{ resizeCanvasToWrapper(); });
window.addEventListener('orientationchange', ()=>{ setTimeout(resizeCanvasToWrapper,120); });

// ----------------- helpers -----------------
function getNumStyle(el, prop, fallback=0){
  if (!el) return fallback;
  const v = window.getComputedStyle(el).getPropertyValue(prop);
  return parseInt(v) || fallback;
}

// ----------------- reset & spawn -----------------
function resetAlien(){
  if (!alien) return;
  alien.style.top = "0px";
  const maxLeft = Math.max((gameWrapper.clientWidth || logicalW || 390) - (alien.clientWidth || 100), 0);
  alien.style.left = Math.floor(Math.random() * (maxLeft + 1)) + "px";
  alien.style.display = "block";
  alienHidden = false;
}

function resetGame(){
  isGameOver = false;
  paused = false;
  score = 0;
  if (liveScore) liveScore.innerText = score;
  if (resultPanel) resultPanel.style.display = "none";
  if (player) {
    player.style.left = ((gameWrapper.clientWidth||logicalW||390)/2 - (player.clientWidth||130)/2) + "px";
    // remove any transform to keep left positioning accurate
    player.style.transform = 'none';
  }
  resetAlien();
}

function _hideShips(){
  try{
    if (player){ player._prevDisplay = player.style.display || ''; player.style.display = 'none'; }
    if (alien){ alien._prevDisplay = alien.style.display || ''; alien.style.display = 'none'; }
  }catch(e){}
}

function _showShips(){
  try{
    if (player){ player.style.display = (player._prevDisplay !== undefined ? player._prevDisplay : 'block'); }
    if (alien){ alien.style.display = (alien._prevDisplay !== undefined ? alien._prevDisplay : 'block'); }
  }catch(e){}
}

// ----------------- music utils -----------------
function playBgMusic(){ try{ bgMusic.play(); }catch(e){} }
function stopBgMusic(){ 
  try{ 
    bgMusic.pause(); 
  }catch(e){}
  try{ 
    if (bgFadeInterval){ clearInterval(bgFadeInterval); bgFadeInterval = null; }
  }catch(e){}
}

// ----------------- game over -----------------
function gameOver(){
  if (isGameOver) return;
  isGameOver = true;
  paused = true;
  clearInterval(alienFallInterval);
  clearInterval(alienMoveInterval);
  // stop background movement when the game ends
  try{ stopBackgroundAnimation(); }catch(e){}
  // stop background music and reset to start for next play
  stopBgMusic();
  try{ bgMusic.currentTime = 0; }catch(e){}
  try{ gameOverSound.currentTime = 0; gameOverSound.play(); }catch(e){}
  if (resultPanel) resultPanel.style.display = "block";
  if (resultScore) resultScore.innerText = `Score: ${score}`;
}

// ----------------- start game -----------------
function startGame(){
  resetGame();
  gameStarted = true;
  paused = false;
  clearInterval(alienFallInterval);
  clearInterval(alienMoveInterval);

  // start the background movement when the game starts
  try{ startBackgroundAnimation(); }catch(e){}

  alienFallInterval = setInterval(()=>{
    if (paused || isGameOver || alienHidden) return;
    const top = getNumStyle(alien,"top",0);
    // change speed here by increasing +4 -> +N
    alien.style.top = (top + 6) + "px"; // faster default (you can tweak)
    const gameOverThreshold = (gameWrapper.clientHeight || 600) - 200;
    if (top > gameOverThreshold && !isGameOver) gameOver();
  }, 28);

  alienMoveInterval = setInterval(()=>{
    if (paused || isGameOver || alienHidden) return;
    const maxLeft = Math.max((gameWrapper.clientWidth || 390) - (alien.clientWidth || 100), 0);
    alien.style.left = Math.floor(Math.random() * (maxLeft + 1)) + "px";
  }, 2900); // slowed: previously 900ms, increased by ~2000ms so enemies reposition less often
}

// ----------------- countdown -----------------
function startCountdown(seconds=5){
  if (!countdownScreen || !countdownText){ startGame(); return; }
  countdownScreen.style.display = "flex";
  let c = seconds;
  countdownText.innerText = c;
  // start background music so its intro coincides with the countdown
  try{
    // reset playback to the start of the track
    bgMusic.currentTime = 0;
    // start with volume 0 and fade in to target
    bgMusic.volume = 0;
    playBgMusic();
    // fade-in over 1500ms
    const fadeDuration = 1500;
    const stepMs = 50;
    const steps = Math.max(1, Math.floor(fadeDuration / stepMs));
    const volStep = BGM_TARGET_VOLUME / steps;
    if (bgFadeInterval) clearInterval(bgFadeInterval);
    bgFadeInterval = setInterval(()=>{
      try{
        const v = Math.min(BGM_TARGET_VOLUME, bgMusic.volume + volStep);
        bgMusic.volume = v;
        if (v >= BGM_TARGET_VOLUME){ clearInterval(bgFadeInterval); bgFadeInterval = null; }
      }catch(e){ clearInterval(bgFadeInterval); bgFadeInterval = null; }
    }, stepMs);
  }catch(e){}
  const id = setInterval(()=>{
    c--;
    if (c > 0) countdownText.innerText = c;
    else if (c === 0) countdownText.innerText = "START!";
    else {
      clearInterval(id);
      countdownScreen.style.display = "none";
      startGame();
    }
  },1000);
}

// ----------------- spawn bullet (dynamic) -----------------
function spawnBullet(){
  if (!gameStarted || paused || isGameOver || !player) return;
  // create bullet
  const canon = document.createElement("div");
  canon.className = "bullet";
  canon.style.position = "absolute";
  canon.style.zIndex = 60;
  // image
  const img = document.createElement("img");
  img.src = "lazer.png";
  img.className = "bulletImg";
  img.style.width = "40px"; img.style.height = "20px";
  canon.appendChild(img);
  // position above player
  const pRect = player.getBoundingClientRect();
  const gRect = gameWrapper.getBoundingClientRect();
  const left = (pRect.left - gRect.left) + ((player.clientWidth||130)/2) - 20;
  const top  = (pRect.top - gRect.top) - 10;
  canon.style.left = left + "px";
  canon.style.top = top + "px";
  gameWrapper.appendChild(canon);
  // sound
  try{ shootSound.currentTime = 0; shootSound.play(); }catch(e){}
  // move bullet
  const id = setInterval(()=>{
    if (paused || isGameOver) return;
    const bTop = getNumStyle(canon,"top",0);
    canon.style.top = (bTop - 12) + "px";
    if (bTop < -40){ clearInterval(id); canon.remove(); return; }
    // collision with alien
    const aTop = getNumStyle(alien,"top",0);
    const aLeft = getNumStyle(alien,"left",0);
    const aW = alien.clientWidth || 100;
    const aH = alien.clientHeight || 80;
    const bLeft = getNumStyle(canon,"left",0);
    const bW = canon.clientWidth || 40;
    const bH = canon.clientHeight || 20;
    if (!(bLeft + bW < aLeft || bLeft > aLeft + aW || bTop + bH < aTop || bTop > aTop + aH)){
      // hit
      try{ hitSound.currentTime = 0; hitSound.play(); }catch(e){}
      clearInterval(id);
      canon.remove();
      alienHidden = true;
      alien.style.display = "none";
      score++;
      if (liveScore) liveScore.innerText = score;
      setTimeout(resetAlien, 300);
    }
  },20);
}

// ----------------- button & keyboard hooks -----------------
if (leftBtn){
  leftBtn.addEventListener("touchstart",(e)=>{ e.preventDefault(); moveLeft=true; try{ moveSound.currentTime=0; moveSound.play(); }catch(e){} },{passive:false});
  leftBtn.addEventListener("touchend",()=>{ moveLeft=false },{passive:false});
  leftBtn.addEventListener("mousedown", ()=>{ moveLeft=true; try{ moveSound.currentTime=0; moveSound.play(); }catch(e){} });
  leftBtn.addEventListener("mouseup", ()=> moveLeft=false);
}
if (rightBtn){
  rightBtn.addEventListener("touchstart",(e)=>{ e.preventDefault(); moveRight=true; try{ moveSound.currentTime=0; moveSound.play(); }catch(e){} },{passive:false});
  rightBtn.addEventListener("touchend",()=>{ moveRight=false },{passive:false});
  rightBtn.addEventListener("mousedown", ()=>{ moveRight=true; try{ moveSound.currentTime=0; moveSound.play(); }catch(e){} });
  rightBtn.addEventListener("mouseup", ()=> moveRight=false);
}
if (shootBtn){
  shootBtn.addEventListener("touchstart",(e)=>{ e.preventDefault(); spawnBullet(); },{passive:false});
  shootBtn.addEventListener("mousedown", ()=> spawnBullet());
}
if (pauseBtn){
  pauseBtn.addEventListener("click", ()=>{
    if (!gameStarted || isGameOver) return;
    paused = true;
      // stop audio and freeze background movement (keep the last frame visible)
      try{ stopBgMusic(); }catch(e){}
      try{ if (_bgSavedSpeed === null) _bgSavedSpeed = bgSpeed; bgSpeed = 0; }catch(e){}
    pauseBtn.style.opacity = 0.5; playBtn && (playBtn.style.opacity = 1);
    // show the centered large play button overlay and hide ships
    try{ if (pauseOverlay) pauseOverlay.style.display = 'flex'; }catch(e){}
    _hideShips();
  });
}
if (playBtn){
  // unified handler for click and touchstart so mobile gestures count as user interaction
  function handlePlayPress(e){
    if (e && e.preventDefault) e.preventDefault();
    if (isGameOver) return;
    // if game hasn't started yet, begin the countdown which will start the game
    if (!gameStarted){
      try{
        // ensure playback is initiated on the user gesture (important on some mobile browsers)
        bgMusic.currentTime = 0;
        bgMusic.volume = 0; // will fade in from 0
        const p = bgMusic.play();
        if (p && p.catch) p.catch(()=>{});
      }catch(e){}
      startCountdown(5);
      playBtn.style.opacity = 0.5;
      pauseBtn && (pauseBtn.style.opacity = 1);
      try{ playBtn.blur(); }catch(e){}
      return;
    }
  // otherwise just resume
  paused = false;
  // resume audio and restore background movement (if it was frozen)
  try{ playBgMusic(); }catch(e){}
  try{ if (_bgSavedSpeed !== null) { bgSpeed = _bgSavedSpeed; _bgSavedSpeed = null; } else { startBackgroundAnimation(); } }catch(e){}
    playBtn.style.opacity = 0.5; pauseBtn && (pauseBtn.style.opacity = 1);
    // hide pause overlay and show ships again
    try{ if (pauseOverlay) pauseOverlay.style.display = 'none'; }catch(e){}
    _showShips();
  }

  // helper for initiating the countdown from a direct user gesture (used by big-play overlay)
  function startFromUserGesture(){
    try{ if (pauseOverlay) pauseOverlay.style.display = 'none'; }catch(e){}
    try{ bgMusic.currentTime = 0; bgMusic.volume = 0; const p = bgMusic.play(); if (p && p.catch) p.catch(()=>{}); }catch(e){}
    try{ playBtn.style.opacity = 0.5; pauseBtn && (pauseBtn.style.opacity = 1); }catch(e){}
    _showShips();
    startCountdown(5);
  }

  playBtn.addEventListener("click", handlePlayPress);
  playBtn.addEventListener("touchstart", handlePlayPress, {passive:false});
}

// Restart button inside the result overlay: hide overlay, reset game and start countdown
const restartBtn = document.getElementById('btn');
if (restartBtn){
  restartBtn.addEventListener('click', ()=>{
    try{ resultPanel.style.display = 'none'; }catch(e){}
    resetGame();
    startCountdown(5);
  });
}

// big resume button in center overlay: same resume behavior as play button
if (resumeBigBtn){
  resumeBigBtn.addEventListener('click', ()=>{
    if (isGameOver) return;
    if (!gameStarted){
      startFromUserGesture();
      return;
    }
    paused = false;
    try{ playBgMusic(); }catch(e){}
    try{ if (_bgSavedSpeed !== null) { bgSpeed = _bgSavedSpeed; _bgSavedSpeed = null; } else { startBackgroundAnimation(); } }catch(e){}
    try{ if (pauseOverlay) pauseOverlay.style.display = 'none'; }catch(e){}
    _showShips();
    playBtn && (playBtn.style.opacity = 0.5);
    pauseBtn && (pauseBtn.style.opacity = 1);
  });
  resumeBigBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); resumeBigBtn.click(); }, {passive:false});
}

document.addEventListener("keydown",(e)=>{
  if (e.code === "ArrowLeft") { moveLeft = true; try{ moveSound.currentTime=0; moveSound.play(); }catch(e){} }
  if (e.code === "ArrowRight") { moveRight = true; try{ moveSound.currentTime=0; moveSound.play(); }catch(e){} }
  if (e.code === "Space") spawnBullet();
  if (e.code === "KeyP") {
    if (!gameStarted || isGameOver) return;
    paused = !paused;
    if (paused) {
      try{ stopBgMusic(); }catch(e){}
      try{ if (_bgSavedSpeed === null) _bgSavedSpeed = bgSpeed; bgSpeed = 0; }catch(e){}
    } else {
      try{ playBgMusic(); }catch(e){}
      try{ if (_bgSavedSpeed !== null) { bgSpeed = _bgSavedSpeed; _bgSavedSpeed = null; } else { startBackgroundAnimation(); } }catch(e){}
    }
  }
});
document.addEventListener("keyup",(e)=>{
  if (e.code === "ArrowLeft") moveLeft = false;
  if (e.code === "ArrowRight") moveRight = false;
});

// continuous player movement (hold)
setInterval(()=>{
  if (!gameStarted || paused || isGameOver) return;
  const left = getNumStyle(player,"left",0);
  const wrapper = gameWrapper.clientWidth || 390;
  const pW = player.clientWidth || 130;
  if (moveLeft && left > 5) player.style.left = Math.max(0,left - 12) + "px";
  if (moveRight && left < wrapper - pW - 5) player.style.left = Math.min(wrapper - pW, left + 12) + "px";
},25);

// init
window.addEventListener("load", ()=>{
  if (liveScore) liveScore.innerText = score;
  // ensure canvas & UI are sized correctly before starting
  resizeCanvasToWrapper();
  resetGame();
  // show the big PLAY overlay before countdown so user has a clear starting CTA
  try{ if (pauseOverlay) { pauseOverlay.style.display = 'flex'; } }catch(e){}
  try{ _hideShips(); }catch(e){}
  // countdown will start when the player presses the big PLAY button or the small Play
});
