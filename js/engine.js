/**
 * Moteur de Ludo pour un nombre quelconque de joueurs.
 * Le tour de piste fait SQUARES_PER_PLAYER cases par joueur.
 */
(function (root, factory) {
  const api = factory();
  root.LudoEngine = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PAWNS = 4;
  const SQUARES_PER_PLAYER = 13;
  const HOME_LEN = 5;
  const MAX_SIX_STREAK = 3;

  function trackLen(n) {
    return n * SQUARES_PER_PLAYER;
  }

  const CLASSIC_COLORS = [
    { h: 4, css: "#e53935", cssDark: "#b71c1c", cssLight: "#ef9a9a", cssSoft: "#ffcdd2" },
    { h: 122, css: "#43a047", cssDark: "#1b5e20", cssLight: "#a5d6a7", cssSoft: "#c8e6c9" },
    { h: 48, css: "#fbc02d", cssDark: "#f9a825", cssLight: "#ffe082", cssSoft: "#fff9c4" },
    { h: 207, css: "#1e88e5", cssDark: "#0d47a1", cssLight: "#90caf9", cssSoft: "#bbdefb" },
  ];

  function hslColor(i, n) {
    if (i < CLASSIC_COLORS.length) return Object.assign({}, CLASSIC_COLORS[i]);
    const h = Math.round((i * 360) / Math.max(n, 1));
    return {
      h,
      css: `hsl(${h} 72% 48%)`,
      cssDark: `hsl(${h} 72% 28%)`,
      cssLight: `hsl(${h} 80% 70%)`,
      cssSoft: `hsl(${h} 50% 88%)`,
    };
  }

  function createPawns() {
    return Array.from({ length: PAWNS }, (_, k) => ({
      id: k,
      area: "yard",
      index: k,
      steps: -1,
    }));
  }

  function createGame(playerDefs) {
    const n = playerDefs.length;
    return {
      players: playerDefs.map((p, i) => ({
        id: p.id != null ? p.id : i,
        name: String(p.name || `Joueur ${i + 1}`).slice(0, 18),
        color: p.color || hslColor(i, n),
        isBot: !!p.isBot,
        disconnected: false,
        pawns: createPawns(),
        finished: false,
        rank: null,
      })),
      n,
      current: 0,
      diceValue: null,
      sixStreak: 0,
      phase: "waiting",
      winners: [],
      lastAction: null,
      turnCount: 0,
      startedAt: Date.now(),
      turnEndsAt: null,
    };
  }

  function startIndex(playerIndex) {
    return playerIndex * SQUARES_PER_PLAYER;
  }

  function isSafeSquare(index, n) {
    const T = trackLen(n);
    if (T === 0) return false;
    return index % SQUARES_PER_PLAYER === 0;
  }

  function occupants(state, area, index, ignorePlayer, ignorePawn) {
    const found = [];
    state.players.forEach((pl, pi) => {
      pl.pawns.forEach((pw) => {
        if (pi === ignorePlayer && pw.id === ignorePawn) return;
        if (pw.area === area && pw.index === index) {
          found.push({ player: pi, pawn: pw.id, colorOwner: pi });
        }
      });
    });
    return found;
  }

  function isBlockade(state, area, index, movingPlayer) {
    if (area !== "track") return false;
    const groups = {};
    occupants(state, area, index).forEach((o) => {
      groups[o.player] = (groups[o.player] || 0) + 1;
    });
    return Object.entries(groups).some(
      ([pi, count]) => Number(pi) !== movingPlayer && count >= 2
    );
  }

  function pathBlocked(state, playerIndex, fromSteps, toSteps) {
    const T = trackLen(state.n);
    const start = startIndex(playerIndex);
    for (let s = fromSteps + 1; s < toSteps; s++) {
      if (s >= T - 1) break;
      const idx = (start + s) % T;
      if (isBlockade(state, "track", idx, playerIndex)) return true;
    }
    return false;
  }

  function destination(state, playerIndex, pawn, dice) {
    const T = trackLen(state.n);
    const start = startIndex(playerIndex);
    const maxTrack = T - 1;

    if (pawn.area === "done") return null;
    if (pawn.area === "yard") {
      if (dice !== 6) return null;
      return { area: "track", index: start, steps: 0, onStar: true };
    }

    if (pawn.area === "track") {
      const newSteps = pawn.steps + dice;
      if (newSteps < maxTrack) {
        const idx = (start + newSteps) % T;
        return { area: "track", index: idx, steps: newSteps };
      }
      if (newSteps === maxTrack) {
        const idx = (start + maxTrack) % T;
        return { area: "track", index: idx, steps: newSteps };
      }
      const homeIdx = newSteps - maxTrack - 1;
      if (homeIdx < 0 || homeIdx > HOME_LEN) return null;
      if (homeIdx === HOME_LEN) return { area: "done", index: 0, steps: newSteps };
      const same = state.players[playerIndex].pawns.filter(
        (p) => p.id !== pawn.id && p.area === "home" && p.index === homeIdx
      );
      if (same.length) return null;
      return { area: "home", index: homeIdx, steps: newSteps };
    }

    if (pawn.area === "home") {
      const ni = pawn.index + dice;
      if (ni === HOME_LEN) return { area: "done", index: 0, steps: pawn.steps + dice };
      if (ni > HOME_LEN) return null;
      const same = state.players[playerIndex].pawns.filter(
        (p) => p.id !== pawn.id && p.area === "home" && p.index === ni
      );
      if (same.length) return null;
      return { area: "home", index: ni, steps: pawn.steps + dice };
    }
    return null;
  }

  function legalMoves(state, playerIndex, dice) {
    const pl = state.players[playerIndex];
    if (!pl || pl.finished) return [];
    const moves = [];
    pl.pawns.forEach((pawn) => {
      const dest = destination(state, playerIndex, pawn, dice);
      if (!dest) return;
      moves.push({ pawnId: pawn.id, dest });
    });
    return moves;
  }

  function capturesAt(state, playerIndex, dest) {
    if (dest.area !== "track") return [];
    return occupants(state, "track", dest.index, playerIndex, -1)
      .filter((o) => o.player !== playerIndex)
      .map((o) => ({ player: o.player, pawn: o.pawn }));
  }

  function nextActive(state, from) {
    const n = state.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      const pl = state.players[i];
      if (!pl.finished && !pl.disconnected) return i;
    }
    return from;
  }

  function applyMove(state, playerIndex, pawnId) {
    if (state.phase !== "rolled") return { ok: false, error: "Pas encore de lancer" };
    if (state.current !== playerIndex) return { ok: false, error: "Ce n'est pas votre tour" };
    const dice = state.diceValue;
    const moves = legalMoves(state, playerIndex, dice);
    const chosen = moves.find((m) => m.pawnId === pawnId);
    if (!chosen) return { ok: false, error: "Coup illégal" };

    const pl = state.players[playerIndex];
    const pawn = pl.pawns[pawnId];
    const from = { area: pawn.area, index: pawn.index, steps: pawn.steps };
    const captured = capturesAt(state, playerIndex, chosen.dest);

    captured.forEach((c) => {
      const victim = state.players[c.player].pawns[c.pawn];
      victim.area = "yard";
      victim.index = victim.id;
      victim.steps = -1;
    });

    pawn.area = chosen.dest.area;
    pawn.index = chosen.dest.index;
    pawn.steps = chosen.dest.steps;

    let justFinished = false;
    if (pawn.area === "done" && pl.pawns.every((p) => p.area === "done")) {
      pl.finished = true;
      pl.rank = state.winners.length + 1;
      state.winners.push(playerIndex);
      justFinished = true;
    }

    const remaining = state.players.filter((p) => !p.finished);
    if (remaining.length <= 1 && state.winners.length) {
      remaining.forEach((p) => {
        if (!p.finished) {
          p.finished = true;
          p.rank = state.winners.length + 1;
          state.winners.push(state.players.indexOf(p));
        }
      });
      state.phase = "ended";
    }

    const extra =
      ((dice === 6 && state.sixStreak < MAX_SIX_STREAK) || captured.length > 0) &&
      !pl.finished &&
      state.phase !== "ended";

    if (state.phase !== "ended") {
      if (extra) {
        state.phase = "waiting";
        state.diceValue = null;
      } else {
        state.current = nextActive(state, state.current);
        state.phase = "waiting";
        state.diceValue = null;
        state.sixStreak = 0;
        state.turnCount += 1;
      }
    }

    state.lastAction = {
      type: "move",
      player: playerIndex,
      pawnId,
      from,
      dest: chosen.dest,
      captured,
      dice,
      extraTurn: extra,
      justFinished,
      eat: captured.length > 0,
    };
    return { ok: true, state };
  }

  function rollDice(state, playerIndex, forced) {
    if (state.phase !== "waiting") return { ok: false, error: "Vous avez déjà lancé" };
    if (state.current !== playerIndex) return { ok: false, error: "Ce n'est pas votre tour" };
    if (state.players[playerIndex].finished) return { ok: false, error: "Joueur déjà arrivé" };

    const value = forced || 1 + Math.floor(Math.random() * 6);
    state.diceValue = value;
    if (value === 6) state.sixStreak += 1;
    else state.sixStreak = 0;

    if (state.sixStreak >= MAX_SIX_STREAK) {
      state.sixStreak = 0;
      state.current = nextActive(state, state.current);
      state.phase = "waiting";
      state.diceValue = null;
      state.lastAction = {
        type: "bust",
        player: playerIndex,
        dice: value,
        message: "Trois 6 d'affilée : tour perdu",
      };
      return { ok: true, state, bust: true };
    }

    const moves = legalMoves(state, playerIndex, value);
    if (!moves.length) {
      const extra = value === 6;
      if (extra) {
        state.phase = "waiting";
        state.diceValue = null;
      } else {
        state.current = nextActive(state, state.current);
        state.phase = "waiting";
        state.diceValue = null;
        state.sixStreak = 0;
        state.turnCount += 1;
      }
      state.lastAction = {
        type: "skip",
        player: playerIndex,
        dice: value,
        extraTurn: extra,
        message: extra ? "Aucun coup, mais 6 : relancez" : "Aucun coup possible",
      };
      return { ok: true, state, skipped: true };
    }

    state.phase = "rolled";
    state.lastAction = { type: "roll", player: playerIndex, dice: value, moves };
    return { ok: true, state };
  }

  function skipTurn(state) {
    if (!state || state.phase === "ended") return { ok: false, error: "Partie terminée" };
    const from = state.current;
    const pl = state.players[from];
    if (!pl) return { ok: false };
    state.current = nextActive(state, from);
    state.phase = "waiting";
    state.diceValue = null;
    state.sixStreak = 0;
    state.turnCount += 1;
    state.lastAction = {
      type: "timeout",
      player: from,
      message: pl.name + " n’a pas joué à temps. Au suivant.",
    };
    return { ok: true, state };
  }

  function botChoose(state) {
    const i = state.current;
    const dice = state.diceValue;
    const moves = legalMoves(state, i, dice);
    if (!moves.length) return null;
    const scored = moves.map((m) => {
      let score = 0;
      const caps = capturesAt(state, i, m.dest);
      score += caps.length * 50;
      if (m.dest.area === "done") score += 80;
      if (m.dest.area === "home") score += 30 + m.dest.index;
      if (m.dest.area === "track" && m.dest.steps === 0) score += 20;
      score += (state.players[i].pawns[m.pawnId].steps || 0) * 0.4;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].m.pawnId;
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  return {
    PAWNS,
    SQUARES_PER_PLAYER,
    HOME_LEN,
    trackLen,
    hslColor,
    createGame,
    legalMoves,
    applyMove,
    rollDice,
    skipTurn,
    botChoose,
    isSafeSquare,
    startIndex,
    clone,
    nextActive,
  };
});
