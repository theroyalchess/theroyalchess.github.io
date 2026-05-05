/* AI move search + background puzzle training (import chess-engine.js) */
'use strict';

importScripts('chess-engine.js');

const MAIN_DEPTH = 6;
const TRAIN_DEPTH = 3;
let trainTimer = null;

function pickMove(state, depth, useBook) {
  const { board, turn, castleRights, enPassantTarget, halfMoveClock, fullMoveNumber } = state;
  if (useBook) {
    const om = RoyalChess.openingLookup(board, turn, castleRights, enPassantTarget, halfMoveClock, fullMoveNumber);
    if (om) return om;
  }
  return RoyalChess.getBestMove(turn, depth, board, castleRights, enPassantTarget);
}

self.onmessage = function (e) {
  const d = e.data;
  if (d.type === 'importTT') {
    if (d.entries && d.entries.length) RoyalChess.importTranspositionTable(d.entries);
  }
  if (d.type === 'exportTT') {
    const payload = RoyalChess.exportTranspositionTable(d.maxEntries || 2500);
    self.postMessage({ type: 'ttExport', payload: payload });
  }
  if (d.type === 'startTraining') {
    if (trainTimer) clearInterval(trainTimer);
    trainTimer = setInterval(function () {
      for (let i = 0; i < 10; i++) RoyalChess.trainStep(TRAIN_DEPTH);
    }, 100);
  }
  if (d.type === 'stopTraining') {
    if (trainTimer) {
      clearInterval(trainTimer);
      trainTimer = null;
    }
  }
  if (d.type === 'bestMove') {
    let state;
    try {
      state = RoyalChess.parseFEN(d.fen);
    } catch (err) {
      self.postMessage({ type: 'bestMove', move: null, id: d.id, err: String(err) });
      return;
    }
    const depth = d.depth != null ? d.depth : MAIN_DEPTH;
    const useBook = d.useBook !== false;
    let mv = pickMove(state, depth, useBook);
    if (mv && mv.special === 'promo' && !mv.promoTo) mv = { ...mv, promoTo: state.turn + 'Q' };
    self.postMessage({ type: 'bestMove', move: mv, id: d.id });
  }
};
