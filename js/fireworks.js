(function () {
  const COLORS = ["#e53935", "#43a047", "#fbc02d", "#1e88e5", "#ff7043", "#ab47bc", "#ffd54f", "#26c6da"];

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let running = false;
  let w = 0;
  let h = 0;
  let lastSpawn = 0;
  let rockets = [];
  let particles = [];

  function pickColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function explode(x, y, color) {
    const count = 36 + Math.floor(Math.random() * 28);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 2 + Math.random() * 5.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1,
        decay: 0.01 + Math.random() * 0.014,
        size: 1.5 + Math.random() * 2.5,
      });
    }
  }

  function spawnRocket() {
    rockets.push({
      x: w * (0.15 + Math.random() * 0.7),
      y: h + 8,
      vx: (Math.random() - 0.5) * 1.6,
      vy: -(7 + Math.random() * 5),
      color: pickColor(),
      targetY: h * (0.18 + Math.random() * 0.35),
    });
  }

  function burst(count) {
    for (let i = 0; i < count; i++) {
      setTimeout(spawnRocket, i * 180);
    }
  }

  function tick(now) {
    if (!running || !ctx) return;

    ctx.clearRect(0, 0, w, h);

    if (now - lastSpawn > 350 + Math.random() * 450) {
      spawnRocket();
      lastSpawn = now;
    }

    rockets = rockets.filter((r) => {
      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.11;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - r.vx * 3, r.y - r.vy * 3);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (r.vy >= -0.5 || r.y <= r.targetY) {
        explode(r.x, r.y, r.color);
        return false;
      }
      return true;
    });

    particles = particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.07;
      p.vx *= 0.985;
      p.life -= p.decay;

      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      return p.life > 0;
    });

    raf = requestAnimationFrame(tick);
  }

  function start(id) {
    stop();
    canvas = document.getElementById(id || "win-fireworks");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    running = true;
    rockets = [];
    particles = [];
    lastSpawn = 0;
    resize();
    window.addEventListener("resize", resize);
    burst(4);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", resize);
    rockets = [];
    particles = [];
    if (ctx && canvas) ctx.clearRect(0, 0, w, h);
  }

  window.LudoFireworks = { start, stop };
})();
