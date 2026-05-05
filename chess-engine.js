/* Royal Chess — shared engine (main thread + Web Worker via importScripts) */
'use strict';

var RoyalChess = (function () {
  const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
  const PST = {
    P: [[0, 0, 0, 0, 0, 0, 0, 0], [50, 50, 50, 50, 50, 50, 50, 50], [10, 10, 20, 30, 30, 20, 10, 10], [5, 5, 10, 25, 25, 10, 5, 5], [0, 0, 0, 20, 20, 0, 0, 0], [5, -5, -10, 0, 0, -10, -5, 5], [5, 10, 10, -20, -20, 10, 10, 5], [0, 0, 0, 0, 0, 0, 0, 0]],
    N: [[-50, -40, -30, -30, -30, -30, -40, -50], [-40, -20, 0, 0, 0, 0, -20, -40], [-30, 0, 10, 15, 15, 10, 0, -30], [-30, 5, 15, 20, 20, 15, 5, -30], [-30, 0, 15, 20, 20, 15, 0, -30], [-30, 5, 10, 15, 15, 10, 5, -30], [-40, -20, 0, 5, 5, 0, -20, -40], [-50, -40, -30, -30, -30, -30, -40, -50]],
    B: [[-20, -10, -10, -10, -10, -10, -10, -20], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 0, 5, 10, 10, 5, 0, -10], [-10, 5, 5, 10, 10, 5, 5, -10], [-10, 0, 10, 10, 10, 10, 0, -10], [-10, 10, 10, 10, 10, 10, 10, -10], [-10, 5, 0, 0, 0, 0, 5, -10], [-20, -10, -10, -10, -10, -10, -10, -20]],
    R: [[0, 0, 0, 0, 0, 0, 0, 0], [5, 10, 10, 10, 10, 10, 10, 5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [0, 0, 0, 5, 5, 0, 0, 0]],
    Q: [[-20, -10, -10, -5, -5, -10, -10, -20], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 0, 5, 5, 5, 5, 0, -10], [-5, 0, 5, 5, 5, 5, 0, -5], [0, 0, 5, 5, 5, 5, 0, -5], [-10, 5, 5, 5, 5, 5, 0, -10], [-10, 0, 5, 0, 0, 0, 0, -10], [-20, -10, -10, -5, -5, -10, -10, -20]],
    K: [[-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-20, -30, -30, -40, -40, -30, -30, -20], [-10, -20, -20, -20, -20, -20, -20, -10], [20, 20, 0, 0, 0, 0, 20, 20], [20, 30, 10, 0, 0, 10, 30, 20]],
  };

  const colOf = (i) => i % 8;
  const rowOf = (i) => Math.floor(i / 8);
  const sqIdx = (r, c) => r * 8 + c;
  const inBnds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const pc = (p) => (p ? p[0] : null);
  const pt = (p) => (p ? p[1] : null);
  const opp = (c) => (c === 'w' ? 'b' : 'w');

  const CHAR_TO_PIECE = { p: 'bP', n: 'bN', b: 'bB', r: 'bR', q: 'bQ', k: 'bK', P: 'wP', N: 'wN', B: 'wB', R: 'wR', Q: 'wQ', K: 'wK' };

  function defaultCastleRights() {
    return { wK: true, wQR: true, wKR: true, bK: true, bQR: true, bKR: true };
  }

  function getPSTForBoard(piece, sqI) {
    const type = pt(piece),
      color = pc(piece),
      r = rowOf(sqI),
      c = colOf(sqI);
    const tbl = PST[type];
    if (!tbl) return 0;
    return color === 'w' ? tbl[r][c] : tbl[7 - r][c];
  }

  function evaluateBoard(b) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const v = PIECE_VALUES[pt(p)] + getPSTForBoard(p, i);
      score += pc(p) === 'w' ? v : -v;
    }
    return score;
  }

  function getRawMoves(i, b, ep) {
    const piece = b[i];
    if (!piece) return [];
    const color = pc(piece),
      type = pt(piece),
      r = rowOf(i),
      c = colOf(i),
      moves = [];
    const add = (tr, tc) => {
      if (!inBnds(tr, tc)) return;
      const t = b[sqIdx(tr, tc)];
      if (t && pc(t) === color) return;
      moves.push({ from: i, to: sqIdx(tr, tc) });
    };
    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        let tr = r + dr,
          tc = c + dc;
        while (inBnds(tr, tc)) {
          const t = b[sqIdx(tr, tc)];
          if (t) {
            if (pc(t) !== color) moves.push({ from: i, to: sqIdx(tr, tc) });
            break;
          }
          moves.push({ from: i, to: sqIdx(tr, tc) });
          tr += dr;
          tc += dc;
        }
      }
    };
    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1,
        startRow = color === 'w' ? 6 : 1,
        promoRow = color === 'w' ? 0 : 7,
        tr1 = r + dir;
      if (inBnds(tr1, c) && !b[sqIdx(tr1, c)]) {
        if (tr1 === promoRow) {
          for (const pr of ['Q', 'R', 'B', 'N']) moves.push({ from: i, to: sqIdx(tr1, c), special: 'promo', promoTo: color + pr });
        } else {
          moves.push({ from: i, to: sqIdx(tr1, c) });
          if (r === startRow && !b[sqIdx(r + dir * 2, c)]) moves.push({ from: i, to: sqIdx(r + dir * 2, c), special: 'double' });
        }
      }
      for (const dc of [-1, 1]) {
        const tc2 = c + dc;
        if (!inBnds(tr1, tc2)) continue;
        const t = b[sqIdx(tr1, tc2)];
        if (t && pc(t) !== color) {
          if (tr1 === promoRow) for (const pr of ['Q', 'R', 'B', 'N']) moves.push({ from: i, to: sqIdx(tr1, tc2), special: 'promo', promoTo: color + pr });
          else moves.push({ from: i, to: sqIdx(tr1, tc2) });
        }
        if (ep !== null && sqIdx(tr1, tc2) === ep) moves.push({ from: i, to: sqIdx(tr1, tc2), special: 'ep' });
      }
    } else if (type === 'N') {
      for (const [dr, dc] of [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ])
        add(r + dr, c + dc);
    } else if (type === 'B') slide([
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]);
    else if (type === 'R') slide([
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
    else if (type === 'Q')
      slide([
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
    else if (type === 'K') for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) add(r + dr, c + dc);
    return moves;
  }

  function applyTemp(b, move) {
    const nb = [...b],
      piece = nb[move.from];
    nb[move.to] = move.special === 'promo' ? move.promoTo : piece;
    nb[move.from] = null;
    if (move.special === 'ep') {
      const dir = pc(piece) === 'w' ? 1 : -1;
      nb[move.to + dir * 8] = null;
    }
    return nb;
  }

  function findKing(b, color) {
    for (let i = 0; i < 64; i++) if (b[i] === color + 'K') return i;
    return -1;
  }

  function isAttacked(b, sqI, byColor) {
    for (let i = 0; i < 64; i++) {
      if (!b[i] || pc(b[i]) !== byColor) continue;
      if (getRawMoves(i, b, null).some((m) => m.to === sqI)) return true;
    }
    return false;
  }

  function inCheck(b, color) {
    const k = findKing(b, color);
    if (k === -1) return false;
    return isAttacked(b, k, opp(color));
  }

  function getLegalMoves(i, b, cr, ep) {
    const piece = b[i];
    if (!piece) return [];
    const color = pc(piece),
      type = pt(piece);
    let moves = getRawMoves(i, b, ep);
    if (type === 'K') {
      const r = rowOf(i);
      if (color === 'w' ? cr.wK && cr.wKR : cr.bK && cr.bKR) {
        const kr = color === 'w' ? 63 : 7;
        if (!b[sqIdx(r, 5)] && !b[sqIdx(r, 6)] && !inCheck(b, color) && !isAttacked(b, sqIdx(r, 5), opp(color)) && !isAttacked(b, sqIdx(r, 6), opp(color)) && b[kr] === color + 'R')
          moves.push({ from: i, to: sqIdx(r, 6), special: 'castleK' });
      }
      if (color === 'w' ? cr.wK && cr.wQR : cr.bK && cr.bQR) {
        const qr = color === 'w' ? 56 : 0;
        if (!b[sqIdx(r, 3)] && !b[sqIdx(r, 2)] && !b[sqIdx(r, 1)] && !inCheck(b, color) && !isAttacked(b, sqIdx(r, 3), opp(color)) && !isAttacked(b, sqIdx(r, 2), opp(color)) && b[qr] === color + 'R')
          moves.push({ from: i, to: sqIdx(r, 2), special: 'castleQ' });
      }
    }
    return moves.filter((move) => {
      let nb = applyTemp(b, move);
      if (move.special === 'castleK') {
        nb[sqIdx(rowOf(i), 5)] = color + 'R';
        nb[sqIdx(rowOf(i), 7)] = null;
      }
      if (move.special === 'castleQ') {
        nb[sqIdx(rowOf(i), 3)] = color + 'R';
        nb[sqIdx(rowOf(i), 0)] = null;
      }
      return !inCheck(nb, color);
    });
  }

  function allLegalMoves(color, b, cr, ep) {
    const all = [];
    for (let i = 0; i < 64; i++) if (b[i] && pc(b[i]) === color) all.push(...getLegalMoves(i, b, cr, ep));
    return all;
  }

  function orderMoves(moves, b) {
    return moves.sort((a, b2) => {
      let sa = 0,
        sb = 0;
      if (b[a.to]) sa += PIECE_VALUES[pt(b[a.to])];
      if (a.special === 'promo') sa += PIECE_VALUES['Q'];
      if (b[b2.to]) sb += PIECE_VALUES[pt(b[b2.to])];
      if (b2.special === 'promo') sb += PIECE_VALUES['Q'];
      return sb - sa;
    });
  }

  function applyMoveForAI(b, move, cr, ep) {
    const nb = [...b],
      piece = nb[move.from],
      color = pc(piece);
    const newCR = { ...cr };
    let newEP = null;
    if (move.special === 'ep') {
      const dir = color === 'w' ? 1 : -1;
      nb[move.to + dir * 8] = null;
    }
    if (move.special === 'castleK') {
      const r = rowOf(move.from);
      nb[sqIdx(r, 5)] = color + 'R';
      nb[sqIdx(r, 7)] = null;
    }
    if (move.special === 'castleQ') {
      const r = rowOf(move.from);
      nb[sqIdx(r, 3)] = color + 'R';
      nb[sqIdx(r, 0)] = null;
    }
    nb[move.to] = move.special === 'promo' ? move.promoTo : piece;
    nb[move.from] = null;
    if (pt(piece) === 'K') {
      newCR[color + 'K'] = false;
      newCR[color + 'QR'] = false;
      newCR[color + 'KR'] = false;
    }
    if (move.from === 63 || move.to === 63) newCR.wKR = false;
    if (move.from === 56 || move.to === 56) newCR.wQR = false;
    if (move.from === 0 || move.to === 0) newCR.bQR = false;
    if (move.from === 7 || move.to === 7) newCR.bKR = false;
    if (move.special === 'double') newEP = sqIdx((rowOf(move.from) + rowOf(move.to)) / 2, colOf(move.from));
    return { nb, newCR, newEP };
  }

  const tt = new Map();
  const TT_MAX = 120000;
  function ttTrim() {
    if (tt.size <= TT_MAX) return;
    const it = tt.keys();
    for (let i = 0; i < 20000; i++) {
      const k = it.next().value;
      if (k === undefined) break;
      tt.delete(k);
    }
  }

  function ttKey(b, maximizing, cr, ep, depth) {
    let s = '';
    for (let i = 0; i < 64; i++) s += b[i] || '.';
    s += maximizing ? 'w' : 'b';
    s += (cr.wK ? '1' : '0') + (cr.wQR ? '1' : '0') + (cr.wKR ? '1' : '0') + (cr.bK ? '1' : '0') + (cr.bQR ? '1' : '0') + (cr.bKR ? '1' : '0');
    s += ep !== null ? ep : '-';
    s += depth;
    return s;
  }

  function minimax(b, depth, alpha, beta, maximizing, cr, ep) {
    if (depth === 0) return evaluateBoard(b);
    const color = maximizing ? 'w' : 'b';
    const tk = ttKey(b, maximizing, cr, ep, depth);
    const te = tt.get(tk);
    if (te && te.d >= depth) return te.s;
    const moves = orderMoves(allLegalMoves(color, b, cr, ep), b);
    if (!moves.length) {
      const v = inCheck(b, color) ? (maximizing ? -99999 + depth : 99999 - depth) : 0;
      tt.set(tk, { s: v, d: depth });
      ttTrim();
      return v;
    }
    if (maximizing) {
      let best = -Infinity;
      for (const m of moves) {
        const { nb, newCR, newEP } = applyMoveForAI(b, m, cr, ep);
        const v = minimax(nb, depth - 1, alpha, beta, false, newCR, newEP);
        best = Math.max(best, v);
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      tt.set(tk, { s: best, d: depth });
      ttTrim();
      return best;
    }
    let best = Infinity;
    for (const m of moves) {
      const { nb, newCR, newEP } = applyMoveForAI(b, m, cr, ep);
      const v = minimax(nb, depth - 1, alpha, beta, true, newCR, newEP);
      best = Math.min(best, v);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    tt.set(tk, { s: best, d: depth });
    ttTrim();
    return best;
  }

  function getBestMove(color, depth, b, cr, ep) {
    const moves = orderMoves(allLegalMoves(color, b, cr, ep), b);
    if (!moves.length) return null;
    const maximizing = color === 'w';
    let best = maximizing ? -Infinity : Infinity,
      bestMove = null;
    for (const m of moves) {
      const { nb, newCR, newEP } = applyMoveForAI([...b], m, cr, ep);
      const v = minimax(nb, depth - 1, -Infinity, Infinity, !maximizing, newCR, newEP);
      if (maximizing ? v > best : v < best) {
        best = v;
        bestMove = m;
      }
    }
    return bestMove;
  }

  function sqToAlgebraic(i) {
    return String.fromCharCode(97 + colOf(i)) + (8 - rowOf(i));
  }

  function algebraicToSq(s) {
    if (!s || s.length < 2 || s === '-') return null;
    const file = s.charCodeAt(0) - 97;
    const rank = 8 - parseInt(s[1], 10);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return sqIdx(rank, file);
  }

  function boardToFEN(b, turn, cr, ep, halfMoveClock, fullMoveNumber) {
    let fen = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = b[sqIdx(r, c)];
        if (!p) {
          empty++;
        } else {
          if (empty) {
            fen += empty;
            empty = 0;
          }
          const t = pt(p),
            w = pc(p) === 'w';
          const ch = w ? t : t.toLowerCase();
          fen += ch;
        }
      }
      if (empty) fen += empty;
      if (r < 7) fen += '/';
    }
    fen += ' ' + turn + ' ';
    let cast = '';
    if (cr.wKR) cast += 'K';
    if (cr.wQR) cast += 'Q';
    if (cr.bKR) cast += 'k';
    if (cr.bQR) cast += 'q';
    fen += cast || '-';
    fen += ' ';
    if (ep === null || ep === undefined) fen += '-';
    else fen += sqToAlgebraic(ep);
    fen += ' ' + (halfMoveClock | 0) + ' ' + (fullMoveNumber | 1);
    return fen;
  }

  function parseFEN(fenStr) {
    const parts = fenStr.trim().split(/\s+/);
    const rows = parts[0].split('/');
    const b = Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') c += parseInt(ch, 10);
        else {
          b[sqIdx(r, c)] = CHAR_TO_PIECE[ch];
          c++;
        }
      }
    }
    const turn = parts[1] === 'b' ? 'b' : 'w';
    const cr = defaultCastleRights();
    cr.wK = cr.wQR = cr.wKR = cr.bK = cr.bQR = cr.bKR = false;
    const cast = parts[2] || '-';
    if (cast !== '-') {
      if (cast.includes('K')) {
        cr.wKR = true;
        cr.wK = true;
      }
      if (cast.includes('Q')) {
        cr.wQR = true;
        cr.wK = true;
      }
      if (cast.includes('k')) {
        cr.bKR = true;
        cr.bK = true;
      }
      if (cast.includes('q')) {
        cr.bQR = true;
        cr.bK = true;
      }
    } else {
      cr.wK = cr.wQR = cr.wKR = cr.bK = cr.bQR = cr.bKR = false;
    }
    const ep = parts[3] && parts[3] !== '-' ? algebraicToSq(parts[3]) : null;
    const hmc = parts[4] ? parseInt(parts[4], 10) : 0;
    const fmn = parts[5] ? parseInt(parts[5], 10) : 1;
    return { board: b, turn, castleRights: cr, enPassantTarget: ep, halfMoveClock: hmc, fullMoveNumber: fmn };
  }

  function fenKey4(fenStr) {
    const p = fenStr.trim().split(/\s+/);
    return p.slice(0, 4).join(' ');
  }

  const OPENING_BOOK = {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': [
      { from: sqIdx(6, 4), to: sqIdx(4, 4) },
      { from: sqIdx(6, 3), to: sqIdx(4, 3) },
      { from: sqIdx(7, 6), to: sqIdx(5, 5) },
      { from: sqIdx(7, 1), to: sqIdx(5, 2) },
      { from: sqIdx(6, 2), to: sqIdx(4, 2) },
    ],
  };

  function openingLookup(b, turn, cr, ep, halfMoveClock, fullMoveNumber) {
    const fen = boardToFEN(b, turn, cr, ep, halfMoveClock, fullMoveNumber);
    const k4 = fenKey4(fen);
    let opts = OPENING_BOOK[k4];
    if (!opts) {
      const k3 = k4.split(' ').slice(0, 3).join(' ');
      for (const key of Object.keys(OPENING_BOOK)) {
        if (key.startsWith(k3)) {
          opts = OPENING_BOOK[key];
          break;
        }
      }
    }
    if (!opts || !opts.length) return null;
    const legal = allLegalMoves(turn, b, cr, ep);
    const ok = [];
    for (const cand of opts) {
      const m = legal.find((mv) => mv.from === cand.from && mv.to === cand.to && (!cand.special || mv.special === cand.special));
      if (m) ok.push(m);
    }
    if (!ok.length) return null;
    return ok[(Math.random() * ok.length) | 0];
  }

  const PUZZLES = [
    { fen: '6k1/5ppp/8/8/8/8/5PPP/4K2R w K - 0 1' },
    { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1' },
    { fen: '8/8/8/8/8/4k3/4P3/4K3 w - - 0 1' },
    { fen: '8/5pk1/8/8/8/8/5P1P/4K3 w - - 0 1' },
    { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 1' },
    { fen: '8/8/8/8/3k4/8/3P4/3K4 w - - 0 1' },
    { fen: '5rk1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1' },
    { fen: '8/8/8/8/8/6k1/5Q2/5K2 w - - 0 1' },
    { fen: '6rk/5ppp/8/8/8/8/5PPP/5RK1 w - - 0 1' },
    { fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1' },
    { fen: '8/8/8/3k4/8/3K4/8/8 w - - 0 1' },
    { fen: '2rq1rk1/ppp2ppp/3p4/3Nn3/2P1P3/1P6/P4PPP/R1B2RK1 w - - 0 1' },
    { fen: '8/p7/8/1P6/8/k7/8/K7 w - - 0 1' },
    { fen: '8/8/8/8/8/8/4k3/R3K2R w KQ - 0 1' },
    { fen: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1' },
  ];

  function trainStep(depth) {
    const p = PUZZLES[(Math.random() * PUZZLES.length) | 0];
    let st;
    try {
      st = parseFEN(p.fen);
    } catch (e) {
      return;
    }
    getBestMove(st.turn, Math.min(depth, 4), st.board, st.castleRights, st.enPassantTarget);
  }

  return {
    getBestMove,
    applyMoveForAI,
    allLegalMoves,
    getLegalMoves,
    orderMoves,
    evaluateBoard,
    inCheck,
    boardToFEN,
    parseFEN,
    openingLookup,
    trainStep,
    sqToAlgebraic,
    algebraicToSq,
    sqIdx,
    rowOf,
    colOf,
    pc,
    pt,
    opp,
    PIECE_VALUES,
    defaultCastleRights,
    PUZZLES,
  };
})();
