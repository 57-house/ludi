/**
 * Plateau de Ludo classique (croix, bases, étoiles) généralisé à N joueurs.
 * À 4 joueurs : grille 15×15 identique au plateau traditionnel.
 * Au-delà : un bras de 3×6 et une base par joueur, centre en N-gone.
 */
(function (root) {
  const E = root.LudoEngine;
  const STROKE = "#424242";

  function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function centroid(pts) {
    let x = 0;
    let y = 0;
    pts.forEach((p) => {
      x += p.x;
      y += p.y;
    });
    return { x: x / pts.length, y: y / pts.length };
  }

  function thetaOut(i, n) {
    return Math.PI - (i * 2 * Math.PI) / n;
  }

  function armPoint(cx, cy, theta, r, s) {
    return {
      x: cx + r * Math.cos(theta) + s * Math.sin(theta),
      y: cy + r * Math.sin(theta) + s * -Math.cos(theta),
    };
  }

  function armQuad(cx, cy, theta, a, cs, u, v) {
    const r0 = a + (5 - u) * cs;
    const r1 = a + (6 - u) * cs;
    const s0 = (v - 1.5) * cs;
    const s1 = (v - 0.5) * cs;
    return [
      armPoint(cx, cy, theta, r0, s0),
      armPoint(cx, cy, theta, r1, s0),
      armPoint(cx, cy, theta, r1, s1),
      armPoint(cx, cy, theta, r0, s1),
    ];
  }

  function gridQuad(ox, oy, cs, c, r) {
    return [
      { x: ox + c * cs, y: oy + r * cs },
      { x: ox + (c + 1) * cs, y: oy + r * cs },
      { x: ox + (c + 1) * cs, y: oy + (r + 1) * cs },
      { x: ox + c * cs, y: oy + (r + 1) * cs },
    ];
  }

  function makeSlots(x, y, size, angle) {
    const inner = size * 0.62;
    const gap = inner * 0.22;
    const slotR = inner * 0.2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    function local(lx, ly) {
      return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
    }
    return [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([ox, oy], k) => {
      const p = local(ox * gap, oy * gap);
      return { id: k, x: p.x, y: p.y, r: slotR };
    });
  }

  function computeLayout(n, cx, cy, radius) {
    n = Math.max(n, 2);
    const S = E.SQUARES_PER_PLAYER;
    const H = E.HOME_LEN;
    const cs = (radius * 2) / (n === 4 ? 15 : 12 + 3 / Math.tan(Math.PI / n) + 2);
    const a = (3 * cs) / (2 * Math.tan(Math.PI / n));
    const center = { x: cx, y: cy };
    const trackCells = [];
    const homePaths = [];
    const yards = [];
    const centerTris = [];

    for (let i = 0; i < n; i++) {
      const theta = thetaOut(i, n);
      const next = (i + 1) % n;
      const thetaNext = thetaOut(next, n);

      for (let k = 0; k < 5; k++) {
        const u = k + 1;
        const quad = armQuad(cx, cy, theta, a, cs, u, 2);
        const index = i * S + k;
        trackCells[index] = {
          index,
          player: i,
          isStart: k === 0,
          isSafe: k === 0,
          quad,
          center: centroid(quad),
        };
      }

      const returnUs = [5, 4, 3, 2, 1, 0];
      returnUs.forEach((u, k) => {
        const quad = armQuad(cx, cy, thetaNext, a, cs, u, 0);
        const index = i * S + 5 + k;
        trackCells[index] = {
          index,
          player: i,
          isStart: false,
          isSafe: false,
          quad,
          center: centroid(quad),
        };
      });
      [1, 2].forEach((v, k) => {
        const quad = armQuad(cx, cy, thetaNext, a, cs, 0, v);
        const index = i * S + 11 + k;
        trackCells[index] = {
          index,
          player: i,
          isStart: false,
          isSafe: false,
          quad,
          center: centroid(quad),
        };
      });

      const path = [];
      for (let h = 0; h < H; h++) {
        const quad = armQuad(cx, cy, theta, a, cs, h + 1, 1);
        path.push({ index: h, quad, center: centroid(quad) });
      }
      homePaths.push(path);

      const p1 = armPoint(cx, cy, theta, a, -1.5 * cs);
      const p2 = armPoint(cx, cy, theta, a, 1.5 * cs);
      centerTris.push({ player: i, points: [center, p1, p2] });
    }

    const ox = cx - 7.5 * cs;
    const oy = cy - 7.5 * cs;
    const outer = a + 6 * cs;

    for (let i = 0; i < n; i++) {
      let x;
      let y;
      let size;
      let angle = 0;
      if (n === 4) {
        size = 6 * cs;
        const corners = [
          { x: ox + 3 * cs, y: oy + 3 * cs },
          { x: ox + 3 * cs, y: oy + 12 * cs },
          { x: ox + 12 * cs, y: oy + 12 * cs },
          { x: ox + 12 * cs, y: oy + 3 * cs },
        ];
        x = corners[i].x;
        y = corners[i].y;
      } else {
        const t0 = thetaOut(i, n);
        const t1 = thetaOut((i - 1 + n) % n, n);
        const d = ((t1 - t0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const mid = t0 + d / 2;
        size = Math.max(cs * 2.4, Math.min(6 * cs, 2 * outer * Math.tan(Math.PI / n) - 3.2 * cs));
        const rYard = outer - size * 0.48;
        x = cx + Math.cos(mid) * rYard;
        y = cy + Math.sin(mid) * rYard;
        angle = mid + Math.PI / 2;
      }
      yards.push({
        player: i,
        x,
        y,
        size,
        angle,
        slots: makeSlots(x, y, size, angle),
        aligned: n === 4,
      });
    }

    const tableVerts = [];
    if (n === 4) {
      tableVerts.push(
        { x: ox, y: oy },
        { x: ox + 15 * cs, y: oy },
        { x: ox + 15 * cs, y: oy + 15 * cs },
        { x: ox, y: oy + 15 * cs }
      );
    } else {
      const R = outer / Math.cos(Math.PI / n);
      for (let i = 0; i < n; i++) {
        const ang = thetaOut(i, n) + Math.PI / n;
        tableVerts.push({
          x: cx + R * Math.cos(ang),
          y: cy + R * Math.sin(ang),
        });
      }
    }

    return {
      n,
      cs,
      center,
      tableR: outer,
      tableV: tableVerts,
      trackCells,
      homePaths,
      yards,
      centerTris,
      finishCenter: center,
      homeInner: a,
      ox,
      oy,
    };
  }

  function fillQuad(ctx, quad, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, (quad[1].x - quad[0].x ? 1.15 : 1.15));
      ctx.stroke();
    }
  }

  function drawStar(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const b = a + Math.PI / 5;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(b) * r * 0.38, y + Math.sin(b) * r * 0.38);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#5c5c5c";
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function pawnRadius(layout) {
    return Math.max(8, layout.cs * 0.36);
  }

  function pawnScreenPos(layout, state, pi, pawn, anim) {
    if (anim && anim.player === pi && anim.pawnId === pawn.id && anim.pos) {
      return anim.pos;
    }
    if (pawn.area === "yard") {
      const sl = layout.yards[pi].slots[pawn.id];
      return { x: sl.x, y: sl.y };
    }
    if (pawn.area === "track") {
      const cell = layout.trackCells[pawn.index];
      const stack = state.players.flatMap((pl, pii) =>
        pl.pawns
          .filter((p) => p.area === "track" && p.index === pawn.index)
          .map((p) => ({ pi: pii, id: p.id }))
      );
      const k = stack.findIndex((s) => s.pi === pi && s.id === pawn.id);
      const spread = layout.cs * 0.18;
      const ang = (k / Math.max(stack.length, 1)) * Math.PI * 2;
      return {
        x: cell.center.x + Math.cos(ang) * spread * (stack.length > 1 ? 1 : 0),
        y: cell.center.y + Math.sin(ang) * spread * (stack.length > 1 ? 1 : 0),
      };
    }
    if (pawn.area === "home") {
      const cell = layout.homePaths[pi][pawn.index];
      return { x: cell.center.x, y: cell.center.y };
    }
    if (pawn.area === "done") {
      const tri = layout.centerTris[pi];
      const mid = lerp(tri.points[1], tri.points[2], 0.5);
      const p = lerp(layout.center, mid, 0.45);
      const jitter = (pawn.id - 1.5) * layout.cs * 0.12;
      const dx = tri.points[2].x - tri.points[1].x;
      const dy = tri.points[2].y - tri.points[1].y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / len) * jitter, y: p.y + (dy / len) * jitter };
    }
    return layout.center;
  }

  function drawPawn(ctx, x, y, r, color, bounce, dim) {
    const lift = bounce || 0;
    const tipX = x;
    const tipY = y - lift;
    const headR = r;
    const headY = tipY - headR * 1.62;

    ctx.save();
    ctx.globalAlpha = dim ? 0.4 : 1;

    ctx.beginPath();
    ctx.ellipse(x, y + 1, headR * (0.62 - Math.min(0.28, lift * 0.025)), headR * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0," + (0.28 - Math.min(0.16, lift * 0.012)) + ")";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.bezierCurveTo(
      tipX - headR * 0.2,
      tipY - headR * 0.45,
      tipX - headR,
      headY + headR * 0.35,
      tipX - headR,
      headY
    );
    ctx.arc(tipX, headY, headR, Math.PI, 0, false);
    ctx.bezierCurveTo(
      tipX + headR,
      headY + headR * 0.35,
      tipX + headR * 0.2,
      tipY - headR * 0.45,
      tipX,
      tipY
    );
    ctx.closePath();
    ctx.fillStyle = color.css;
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = Math.max(1.4, headR * 0.1);
    ctx.strokeStyle = "#1a1a1a";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(tipX, headY - headR * 0.06, headR * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    if (bounce > 0.5) {
      ctx.beginPath();
      ctx.arc(x, y, headR * 0.55 + bounce * 0.08, 0, Math.PI * 2);
      ctx.strokeStyle = color.css;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoard(ctx, layout, state, opts) {
    opts = opts || {};
    const { width, height, highlights, hoverPawn, anim, time } = opts;
    const n = layout.n;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.22)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    layout.tableV.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    layout.tableV.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();

    layout.yards.forEach((yard, pi) => {
      const color = state && state.players[pi] ? state.players[pi].color : E.hslColor(pi, n);
      const s = yard.size;
      ctx.save();
      ctx.translate(yard.x, yard.y);
      ctx.rotate(yard.angle);
      ctx.fillStyle = color.css;
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      const inset = s * 0.18;
      roundRectPath(ctx, -s / 2 + inset, -s / 2 + inset, s - inset * 2, s - inset * 2, s * 0.08);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      if (state && state.players[pi]) {
        ctx.save();
        ctx.rotate(-yard.angle);
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 ${Math.max(10, Math.min(inset * 0.72, s * 0.11))}px "Nunito", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 3;
        ctx.fillText(state.players[pi].name, 0, -s / 2 + inset * 0.5, s * 0.72);
        ctx.restore();
      }
      ctx.restore();

      yard.slots.forEach((sl) => {
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, sl.r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = color.css;
        ctx.lineWidth = Math.max(2, sl.r * 0.14);
        ctx.stroke();
      });
    });

    layout.trackCells.forEach((cell) => {
      const owner = state && state.players[cell.player]
        ? state.players[cell.player]
        : { color: E.hslColor(cell.player, n) };
      let fill = "#ffffff";
      if (cell.isStart) fill = owner.color.css;
      fillQuad(ctx, cell.quad, fill, STROKE);
      if (cell.isSafe) {
        drawStar(ctx, cell.center.x, cell.center.y, layout.cs * 0.32);
      }
    });

    layout.homePaths.forEach((path, pi) => {
      const color = state && state.players[pi] ? state.players[pi].color : E.hslColor(pi, n);
      path.forEach((cell) => fillQuad(ctx, cell.quad, color.css, STROKE));
    });

    layout.centerTris.forEach((tri) => {
      const color = state && state.players[tri.player]
        ? state.players[tri.player].color
        : E.hslColor(tri.player, n);
      ctx.beginPath();
      ctx.moveTo(tri.points[0].x, tri.points[0].y);
      ctx.lineTo(tri.points[1].x, tri.points[1].y);
      ctx.lineTo(tri.points[2].x, tri.points[2].y);
      ctx.closePath();
      ctx.fillStyle = color.css;
      ctx.fill();
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });

    const hits = [];
    if (state) {
      const r = pawnRadius(layout);
      const movable = new Set((highlights || []).map((h) => h.player + "-" + h.pawnId));
      const t = time || 0;
      state.players.forEach((pl, pi) => {
        pl.pawns.forEach((pawn) => {
          const pos = pawnScreenPos(layout, state, pi, pawn, anim);
          const key = pi + "-" + pawn.id;
          const glow = movable.has(key);
          const dim = state.phase === "ended" && pl.rank !== 1;
          const bounce = glow
            ? (0.55 + 0.45 * Math.abs(Math.sin(t / 160 + pawn.id * 0.85))) * layout.cs * 0.32
            : 0;
          const size = pawn.area === "yard" ? layout.yards[pi].slots[pawn.id].r * 0.92 : r;
          drawPawn(ctx, pos.x, pos.y, size, pl.color, bounce, dim);
          hits.push({
            player: pi,
            pawnId: pawn.id,
            x: pos.x,
            y: pos.y - size * 1.1 - bounce * 0.5,
            r: size * 1.7 + layout.cs * 0.12,
          });
        });
      });
    }

    if (hoverPawn) {
      const hit = hits.find((h) => h.player === hoverPawn.player && h.pawnId === hoverPawn.pawnId);
      if (hit) {
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, hit.r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    return hits;
  }

  function cellCenter(layout, state, pi, area, index) {
    if (area === "yard") {
      const sl = layout.yards[pi].slots[index];
      return { x: sl.x, y: sl.y };
    }
    if (area === "track") return layout.trackCells[index].center;
    if (area === "home") return layout.homePaths[pi][index].center;
    if (area === "done") return layout.center;
    return layout.center;
  }

  function buildPath(layout, state, player, from, dest, pawnId) {
    const pts = [];
    const start =
      from.area === "yard"
        ? cellCenter(layout, state, player, "yard", pawnId)
        : cellCenter(layout, state, player, from.area, from.index);
    pts.push(start);
    if (from.area === "yard" && dest.area === "track") {
      pts.push(cellCenter(layout, state, player, "track", dest.index));
      return pts;
    }
    if (from.area === "track" && dest.area === "track") {
      const T = layout.trackCells.length;
      let i = from.index;
      while (i !== dest.index) {
        i = (i + 1) % T;
        pts.push(layout.trackCells[i].center);
      }
      return pts;
    }
    if (from.area === "track" && (dest.area === "home" || dest.area === "done")) {
      const T = layout.trackCells.length;
      const lastTrack = (E.startIndex(player) - 1 + T) % T;
      let i = from.index;
      while (i !== lastTrack) {
        i = (i + 1) % T;
        pts.push(layout.trackCells[i].center);
      }
      const homeEnd = dest.area === "done" ? E.HOME_LEN : dest.index + 1;
      for (let h = 0; h < homeEnd; h++) {
        if (h < E.HOME_LEN) pts.push(layout.homePaths[player][h].center);
      }
      if (dest.area === "done") pts.push(layout.center);
      return pts;
    }
    if (from.area === "home") {
      for (let h = from.index + 1; h <= (dest.area === "done" ? E.HOME_LEN : dest.index); h++) {
        if (h < E.HOME_LEN) pts.push(layout.homePaths[player][h].center);
      }
      if (dest.area === "done") pts.push(layout.center);
      return pts;
    }
    pts.push(cellCenter(layout, state, player, dest.area, dest.index));
    return pts;
  }

  root.LudoBoard = {
    computeLayout,
    drawBoard,
    pawnScreenPos,
    pawnRadius,
    buildPath,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
