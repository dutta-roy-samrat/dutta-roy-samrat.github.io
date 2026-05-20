(function() {
  const canvas = document.getElementById('mario-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const hint = document.getElementById('mario-play-hint');
  const wrapper = document.getElementById('notion-cover-wrapper');
  
  const btnStart = document.getElementById('mario-btn-start');
  const btnStop = document.getElementById('mario-btn-stop');
  
  let state = 'STOPPED'; // 'STOPPED', 'PLAYING', 'GAMEOVER'
  let score = 0;
  let rawHiScore = parseInt(localStorage.getItem('mario_hi_score'), 10);
  let hiScore = (isNaN(rawHiScore) || rawHiScore < 0) ? 0 : rawHiScore;
  
  // Game Dimensions & Setup
  let width = canvas.width = wrapper.clientWidth;
  let height = canvas.height = wrapper.clientHeight;
  
  // Game Variables
  let groundY = height - 24;
  let gravity = 0.5;
  let animationFrameId = null;
  
  window.addEventListener('resize', () => {
    width = canvas.width = wrapper.clientWidth;
    height = canvas.height = wrapper.clientHeight;
    groundY = height - 24;
    mario.y = groundY - mario.h; // Relocate Mario correctly
    
    // Only redraw on-demand if the loop is not currently running
    if (state !== 'PLAYING') {
      draw();
    }
  });
  
  // Mario Object
  const mario = {
    x: 60,
    y: groundY - 32,
    w: 24,
    h: 32,
    vy: 0,
    jumpPower: -9.5,
    isJumping: false,
    frame: 0,
    draw() {
      // Classic Mario pixel map (12 columns x 16 rows)
      const pixelMap = [
        [0,0,0,1,1,1,1,1,0,0,0,0],
        [0,0,1,1,1,1,1,1,1,1,1,0],
        [0,0,3,3,3,2,2,3,2,0,0,0],
        [0,3,2,3,2,2,2,3,2,2,2,0],
        [0,3,2,3,3,2,2,2,3,2,2,0],
        [0,3,3,2,2,2,2,2,3,3,0,0],
        [0,0,0,2,2,2,2,2,2,0,0,0],
        [0,0,1,1,4,1,1,1,0,0,0,0],
        [0,1,1,1,4,1,1,4,1,1,1,0],
        [1,1,1,1,4,4,4,4,1,1,1,1],
        [2,2,1,4,2,4,4,2,4,1,2,2],
        [2,2,2,4,4,4,4,4,4,2,2,2],
        [0,0,4,4,4,0,0,4,4,4,0,0],
        [0,3,3,3,0,0,0,0,3,3,3,0],
        [3,3,3,3,0,0,0,0,3,3,3,3]
      ];
      
      const pxW = this.w / 12;
      const pxH = this.h / 16;
      
      ctx.save();
      if (state === 'PLAYING' && !this.isJumping) {
        this.frame += 0.18;
        const tilt = Math.sin(this.frame) * 0.08;
        ctx.translate(this.x + this.w/2, this.y + this.h);
        ctx.rotate(tilt);
        ctx.translate(-this.x - this.w/2, -this.y - this.h);
      }
      
      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 12; c++) {
          const val = pixelMap[r][c];
          if (val === 0) continue;
          
          if (val === 1) ctx.fillStyle = '#ff3823'; // Classic Red
          else if (val === 2) ctx.fillStyle = '#fec3a3'; // Skin
          else if (val === 3) ctx.fillStyle = '#9b5b00'; // Brown hair/shoes
          else if (val === 4) ctx.fillStyle = '#0044ff'; // Blue overalls
          
          ctx.fillRect(this.x + c * pxW, this.y + r * pxH, pxW + 0.6, pxH + 0.6);
        }
      }
      ctx.restore();
    },
    jump() {
      if (!this.isJumping) {
        this.vy = this.jumpPower;
        this.isJumping = true;
        playSound('jump');
      }
    },
    update() {
      this.y += this.vy;
      this.vy += gravity;
      
      if (this.y >= groundY - this.h) {
        this.y = groundY - this.h;
        this.vy = 0;
        this.isJumping = false;
      }
    }
  };
  
  // Obstacles
  let obstacles = [];
  let nextObstacleTimer = 65;
  
  function spawnObstacle() {
    const type = Math.random() > 0.5 ? 'crab' : 'goomba';
    if (type === 'crab') {
      obstacles.push({
        type: 'crab',
        x: width + 24,
        y: groundY - 22,
        w: 24,
        h: 22,
        passed: false
      });
    } else {
      obstacles.push({
        type: 'goomba',
        x: width + 22,
        y: groundY - 22,
        w: 22,
        h: 22,
        passed: false
      });
    }
  }
  
  // Background Elements
  const clouds = [
    { x: 80, y: 35, w: 50, h: 18, speed: 0.12 },
    { x: 320, y: 50, w: 70, h: 22, speed: 0.18 },
    { x: 620, y: 30, w: 45, h: 15, speed: 0.09 }
  ];
  
  const hills = [
    { x: 60, y: groundY - 35, w: 80, h: 35, speed: 0.4 },
    { x: 450, y: groundY - 45, w: 100, h: 45, speed: 0.45 }
  ];
  
  // Synthesized retro sound effects using Web Audio API
  let audioCtx = null;
  function playSound(type) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      if (type === 'jump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
      } else if (type === 'coin') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.07, audioCtx.currentTime + 0.08);
        osc.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } else if (type === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(65, audioCtx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      }
    } catch (e) {
      console.log('Audio init failed:', e);
    }
  }
  
  // Global controls
  function triggerAction() {
    if (state === 'STOPPED') {
      startGame();
    } else if (state === 'PLAYING') {
      mario.jump();
    } else if (state === 'GAMEOVER') {
      startGame();
    }
  }
  
  function startGame() {
    state = 'PLAYING';
    score = 0;
    obstacles = [];
    nextObstacleTimer = 65;
    hint.innerText = "🎮 SCORE: " + score + " | HI-SCORE: " + hiScore;
    playSound('coin');
    
    // Start drawing tick loop
    if (!animationFrameId) {
      tick();
    }
  }
  
  function stopGame() {
    state = 'STOPPED';
    obstacles = [];
    nextObstacleTimer = 65;
    mario.vy = 0;
    mario.y = groundY - mario.h;
    mario.isJumping = false;
    hint.innerText = "🎮 CLICK / SPACE TO PLAY GAME";
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    draw(); // Draw final static state
  }
  
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    triggerAction();
  });
  
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    triggerAction();
  });
  
  if (btnStart) {
    btnStart.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      startGame();
    });
  }
  
  if (btnStop) {
    btnStop.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      stopGame();
    });
  }
  
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault(); // Prevent default scroll
      triggerAction();
    }
  });
  
  // Main Game Update Loop
  function update() {
    groundY = height - 24;
    
    // Clouds move slowly in sky
    clouds.forEach(c => {
      if (state === 'PLAYING') {
        c.x -= c.speed;
      }
      if (c.x + c.w < 0) c.x = width + Math.random() * 120;
    });
    
    // Parallax Hills
    hills.forEach(h => {
      if (state === 'PLAYING') {
        h.x -= h.speed;
      }
      if (h.x + h.w < 0) h.x = width + Math.random() * 180;
    });
    
    if (state === 'PLAYING') {
      mario.update();
      
      nextObstacleTimer--;
      if (nextObstacleTimer <= 0) {
        spawnObstacle();
        nextObstacleTimer = 90 + Math.random() * 110;
      }
      
      // Update Obstacles
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= 2.8; // Speed
        
        // Score
        if (!o.passed && o.x < mario.x) {
          o.passed = true;
          score += 10;
          if (score > hiScore) {
            hiScore = score;
            localStorage.setItem('mario_hi_score', hiScore);
          }
          hint.innerText = "🎮 SCORE: " + score + " | HI-SCORE: " + hiScore;
          playSound('coin');
        }
        
        // Collisions
        if (
          mario.x < o.x + o.w &&
          mario.x + mario.w > o.x &&
          mario.y < o.y + o.h &&
          mario.y + mario.h > o.y
        ) {
          state = 'GAMEOVER';
          playSound('death');
          hint.innerText = "💀 GAME OVER - CLICK TO REPLAY!";
        }
        
        if (o.x + o.w < 0) {
          obstacles.splice(i, 1);
        }
      }
    }
  }
  
  // Canvas Render Loop
  function draw() {
    // Draw OG retro Nintendo blue sky background
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, width, height);
    
    // 1. Draw Clouds
    ctx.fillStyle = '#ffffff';
    clouds.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x + c.w * 0.3, c.y + c.h * 0.5, c.h * 0.4, 0, Math.PI * 2);
      ctx.arc(c.x + c.w * 0.6, c.y + c.h * 0.4, c.h * 0.5, 0, Math.PI * 2);
      ctx.arc(c.x + c.w * 0.8, c.y + c.h * 0.6, c.h * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // 2. Draw Hills (retro deep green)
    hills.forEach(h => {
      ctx.fillStyle = '#00a800';
      ctx.beginPath();
      ctx.moveTo(h.x, groundY);
      ctx.lineTo(h.x + h.w * 0.5, h.y);
      ctx.lineTo(h.x + h.w, groundY);
      ctx.fill();
    });
    
    // 3. Draw Ground (retro brick blocks)
    ctx.fillStyle = '#c84c0c'; // NES Ground dark brick orange
    ctx.fillRect(0, groundY, width, height - groundY);
    
    // Ground top highlight line
    ctx.fillStyle = '#fcbcb0'; // Brick grout peach
    ctx.fillRect(0, groundY, width, 2);
    
    // Draw brick-like dividing lines on ground
    for (let bx = 0; bx < width; bx += 16) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(bx, groundY + 2, 1, height - groundY);
      ctx.fillRect(bx, groundY + 10, 16, 1);
    }
    
    // 4. Draw Obstacles
    obstacles.forEach(o => {
      if (o.type === 'crab') {
        const cMap = [
          [0,0,1,1,0,0,0,0,1,1,0,0],
          [0,1,3,3,1,0,0,1,3,3,1,0],
          [0,1,2,0,1,0,0,1,2,0,1,0],
          [0,0,1,1,0,1,1,0,1,1,0,0],
          [0,0,0,1,1,1,1,1,1,0,0,0],
          [0,0,1,1,1,1,1,1,1,1,0,0],
          [0,1,1,1,1,1,1,1,1,1,1,0],
          [1,1,0,1,1,1,1,1,1,0,1,1],
          [1,0,0,1,1,0,0,1,1,0,0,1],
          [0,0,1,1,0,0,0,0,1,1,0,0],
          [0,1,1,0,0,0,0,0,0,1,1,0]
        ];
        const pxW = o.w / 12;
        const pxH = o.h / 11;
        for (let r = 0; r < 11; r++) {
          for (let c = 0; c < 12; c++) {
            const val = cMap[r][c];
            if (val === 0) continue;
            if (val === 1) ctx.fillStyle = '#ff3823'; // Crab bright red
            else if (val === 2) ctx.fillStyle = '#000000'; // Black
            else if (val === 3) ctx.fillStyle = '#ffffff'; // White eye
            ctx.fillRect(o.x + c * pxW, o.y + r * pxH, pxW + 0.5, pxH + 0.5);
          }
        }
      } else {
        const gMap = [
          [0,0,0,0,1,1,1,1,0,0,0,0],
          [0,0,1,1,1,1,1,1,1,1,0,0],
          [0,1,1,1,1,1,1,1,1,1,1,0],
          [1,1,0,0,1,1,1,1,0,0,1,1],
          [1,1,2,0,1,1,1,1,2,0,1,1],
          [1,1,1,1,1,1,1,1,1,1,1,1],
          [0,1,1,1,3,3,3,3,1,1,1,0],
          [0,0,1,3,3,3,3,3,3,1,0,0],
          [0,0,3,3,3,3,3,3,3,3,0,0],
          [0,3,3,3,3,3,3,3,3,3,3,0],
          [0,2,2,2,0,0,0,0,2,2,2,0],
          [2,2,2,2,0,0,0,0,2,2,2,2]
        ];
        const pxW = o.w / 12;
        const pxH = o.h / 12;
        for (let r = 0; r < 12; r++) {
          for (let c = 0; c < 12; c++) {
            const val = gMap[r][c];
            if (val === 0) continue;
            if (val === 1) ctx.fillStyle = '#c84c0c'; // Goomba body brown
            else if (val === 2) ctx.fillStyle = '#000000'; // Black
            else if (val === 3) ctx.fillStyle = '#fcbcb0'; // Face
            ctx.fillRect(o.x + c * pxW, o.y + r * pxH, pxW + 0.5, pxH + 0.5);
          }
        }
      }
    });
    
    // 5. Draw Mario
    mario.draw();
    
    // 6. Draw Score Screen overlay for Game Over
    if (state === 'GAMEOVER') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 18px 'Inter', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText("💀 GAME OVER", width/2, height/2 - 10);
      
      ctx.font = "12px 'Inter', sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText("SCORE: " + score + " | HIGH SCORE: " + hiScore, width/2, height/2 + 14);
    }
  }
  
  // Tick method runs conditionally when active
  function tick() {
    update();
    draw();
    if (state === 'PLAYING') {
      animationFrameId = requestAnimationFrame(tick);
    } else {
      animationFrameId = null;
    }
  }
  
  // Render the initial static layout frame once
  draw();
})();
