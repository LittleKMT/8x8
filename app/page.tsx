"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Cell = number | null;
type Point = { r: number; c: number };
type Piece = { id: string; cells: Point[]; color: number };
type Snapshot = { board: Cell[][]; pieces: Array<Piece | null>; score: number };
type DragSession = {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const SIZE = 10;
const HIGH_SCORE_KEY = "fangkuai-leyuan-high-score";
const DRAG_START_DISTANCE = 3;
const DRAG_LIFT_CELLS = 2.4;
const DRAG_X_SENSITIVITY = 1.35;
const DRAG_Y_SENSITIVITY = 1.18;
const SHAPES: Point[][] = [
  [{ r: 0, c: 0 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }],
  [{ r: 0, c: 0 }, { r: 1, c: 0 }],
  [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }],
  [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }],
  [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }],
  [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 2, c: 1 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 1 }],
  [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }],
  [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 0 }, { r: 1, c: 1 }],
  [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 2 }],
  [
    { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 },
    { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 },
    { r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 },
  ],
];

const emptyBoard = (): Cell[][] => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
const cloneBoard = (board: Cell[][]) => board.map((row) => [...row]);

function makeBatch(): Piece[] {
  return Array.from({ length: 3 }, (_, index) => ({
    id: `${Date.now()}-${index}-${Math.random()}`,
    cells: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: Math.floor(Math.random() * 6),
  }));
}

function canPlace(board: Cell[][], piece: Piece, row: number, col: number) {
  return piece.cells.every(({ r, c }) => {
    const rr = row + r;
    const cc = col + c;
    return rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === null;
  });
}

function pieceFits(board: Cell[][], piece: Piece) {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) if (canPlace(board, piece, r, c)) return true;
  }
  return false;
}

function nearestValidCell(board: Cell[][], piece: Piece, target: Point) {
  let nearest: Point | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (!canPlace(board, piece, r, c)) continue;
      const distance = Math.abs(r - target.r) + Math.abs(c - target.c);
      if (distance < nearestDistance) {
        nearest = { r, c };
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

function PieceView({ piece }: { piece: Piece }) {
  const rows = Math.max(...piece.cells.map((cell) => cell.r)) + 1;
  const cols = Math.max(...piece.cells.map((cell) => cell.c)) + 1;
  return (
    <span className="mini-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {piece.cells.map((cell, i) => (
        <i key={i} className={`mini-block color-${piece.color}`} style={{ gridRow: cell.r + 1, gridColumn: cell.c + 1 }} />
      ))}
    </span>
  );
}

export default function Home() {
  const [board, setBoard] = useState<Cell[][]>(() => emptyBoard());
  const [pieces, setPieces] = useState<Array<Piece | null>>(() => makeBatch());
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [drag, setDrag] = useState<{ index: number; pointerId: number } | null>(null);
  const [undo, setUndo] = useState<Snapshot | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [sound, setSound] = useState(true);
  const [sparkles, setSparkles] = useState<string[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const highScoreRef = useRef(0);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(HIGH_SCORE_KEY));
      if (Number.isFinite(saved) && saved > 0) highScoreRef.current = Math.floor(saved);
    } catch {
      // The game still works when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (score <= highScoreRef.current) return;
    highScoreRef.current = score;
    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
    } catch {
      // The game still works when browser storage is unavailable.
    }
  }, [score]);

  const selectedPiece = selected === null ? null : pieces[selected];
  const preview = useMemo(() => {
    if (!selectedPiece || !hover) return new Set<string>();
    return new Set(selectedPiece.cells.map(({ r, c }) => `${hover.r + r}-${hover.c + c}`));
  }, [selectedPiece, hover]);
  const previewValid = !!(selectedPiece && hover && canPlace(board, selectedPiece, hover.r, hover.c));

  function tone(kind: "place" | "clear") {
    if (!sound) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const ctx = audioRef.current || new Context();
    audioRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "clear" ? 660 : 320, ctx.currentTime);
    if (kind === "clear") osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  function finishMove(nextBoard: Cell[][], nextPieces: Array<Piece | null>, added: number) {
    const completeRows = nextBoard.map((row, i) => row.every((cell) => cell !== null) ? i : -1).filter((i) => i >= 0);
    const completeCols = Array.from({ length: SIZE }, (_, c) => nextBoard.every((row) => row[c] !== null) ? c : -1).filter((i) => i >= 0);
    const cleared = new Set<string>();
    completeRows.forEach((r) => { for (let c = 0; c < SIZE; c += 1) cleared.add(`${r}-${c}`); });
    completeCols.forEach((c) => { for (let r = 0; r < SIZE; r += 1) cleared.add(`${r}-${c}`); });
    cleared.forEach((key) => {
      const [r, c] = key.split("-").map(Number);
      nextBoard[r][c] = null;
    });

    const bonus = (completeRows.length + completeCols.length) * 20 + Math.max(0, completeRows.length + completeCols.length - 1) * 20;
    const nextScore = score + added + bonus;
    setBoard(nextBoard);
    setScore(nextScore);
    if (cleared.size) {
      setSparkles([...cleared]);
      tone("clear");
      window.setTimeout(() => setSparkles([]), 450);
    } else {
      tone("place");
    }

    let finalPieces = nextPieces;
    if (finalPieces.every((piece) => piece === null)) finalPieces = makeBatch();
    setPieces(finalPieces);
    const playable = finalPieces.some((piece) => piece && pieceFits(nextBoard, piece));
    if (!playable) {
      setGameOver(true);
    }
  }

  function place(index: number, row: number, col: number) {
    const piece = pieces[index];
    if (!piece || !canPlace(board, piece, row, col)) return;
    setUndo({ board: cloneBoard(board), pieces: pieces.map((item) => item ? { ...item } : null), score });
    const nextBoard = cloneBoard(board);
    piece.cells.forEach(({ r, c }) => { nextBoard[row + r][col + c] = piece.color; });
    const nextPieces = [...pieces];
    nextPieces[index] = null;
    setSelected(null);
    setHover(null);
    finishMove(nextBoard, nextPieces, piece.cells.length);
  }

  function restart() {
    setBoard(emptyBoard());
    setPieces(makeBatch());
    setScore(0);
    setSelected(null);
    setHover(null);
    setUndo(null);
    setGameOver(false);
  }

  function undoMove() {
    if (!undo || gameOver) return;
    setBoard(cloneBoard(undo.board));
    setPieces(undo.pieces.map((piece) => piece ? { ...piece } : null));
    setScore(undo.score);
    setUndo(null);
    setSelected(null);
  }

  function pointCell(x: number, y: number, piece: Piece) {
    const grid = boardRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const step = rect.width / SIZE;
    const liftedY = y - Math.max(92, step * DRAG_LIFT_CELLS);
    const reach = step * 3;
    if (x < rect.left - reach || x > rect.right + reach || liftedY < rect.top - reach || liftedY > rect.bottom + reach) return null;
    const pieceRows = Math.max(...piece.cells.map((cell) => cell.r)) + 1;
    const pieceCols = Math.max(...piece.cells.map((cell) => cell.c)) + 1;
    const rawRow = Math.round((liftedY - rect.top) / step - pieceRows / 2);
    const rawCol = Math.round((x - rect.left) / step - pieceCols / 2);
    return {
      r: Math.max(0, Math.min(SIZE - pieceRows, rawRow)),
      c: Math.max(0, Math.min(SIZE - pieceCols, rawCol)),
    };
  }

  function startDrag(index: number, event: React.PointerEvent) {
    if (!pieces[index] || gameOver) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    setSelected(index);
    setDrag({ index, pointerId: event.pointerId });
  }

  function moveDrag(event: React.PointerEvent) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (!session.moved && Math.hypot(deltaX, deltaY) < DRAG_START_DISTANCE) return;
    session.moved = true;
    const piece = pieces[session.index];
    if (piece) {
      const sensitiveX = session.startX + deltaX * DRAG_X_SENSITIVITY;
      const sensitiveY = session.startY + deltaY * DRAG_Y_SENSITIVITY;
      const target = pointCell(sensitiveX, sensitiveY, piece);
      setHover(target ? nearestValidCell(board, piece, target) : null);
    }
  }

  function endDrag(event: React.PointerEvent) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const piece = pieces[session.index];
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    const sensitiveX = session.startX + deltaX * DRAG_X_SENSITIVITY;
    const sensitiveY = session.startY + deltaY * DRAG_Y_SENSITIVITY;
    const target = session.moved && piece ? pointCell(sensitiveX, sensitiveY, piece) : null;
    const cell = piece && target ? nearestValidCell(board, piece, target) : null;
    if (cell && piece) place(session.index, cell.r, cell.c);
    dragRef.current = null;
    setDrag(null);
    setHover(null);
  }

  function cancelDrag() {
    dragRef.current = null;
    setDrag(null);
    setHover(null);
  }

  return (
    <main className="game-shell" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}>
      <header className="topbar">
        <div className="brand"><h1>方塊樂園</h1></div>
        <div className="header-tools">
          <div className="score-pill"><span>分數</span><strong>{score}</strong></div>
          <button className="sound-button" onClick={() => setSound(!sound)} aria-label={sound ? "關閉音效" : "開啟音效"}>{sound ? "🔊" : "🔇"}</button>
        </div>
      </header>

      <section className="board-wrap">
        <div className="board" ref={boardRef} role="grid" aria-label="10乘10方塊棋盤">
          {board.map((row, r) => row.map((cell, c) => {
            const key = `${r}-${c}`;
            const isPreview = preview.has(key);
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                data-cell
                data-row={r}
                data-col={c}
                aria-label={`第${r + 1}列第${c + 1}格`}
                className={`cell ${cell !== null ? `filled color-${cell}` : ""} ${isPreview ? (previewValid ? `preview color-${selectedPiece?.color}` : "preview invalid") : ""} ${sparkles.includes(key) ? "sparkle" : ""}`}
                onPointerEnter={() => selectedPiece && !drag && setHover({ r, c })}
                onFocus={() => selectedPiece && setHover({ r, c })}
                onClick={() => selected !== null && place(selected, r, c)}
              />
            );
          }))}
        </div>
      </section>

      <section className="tray" aria-label="可選擇的方塊">
        <div className="piece-row">
          {pieces.map((piece, index) => piece ? (
            <button
              key={piece.id}
              className={`piece-button ${selected === index ? "selected" : ""} ${drag?.index === index ? "dragging" : ""} ${!pieceFits(board, piece) ? "disabled-piece" : ""}`}
              onPointerDown={(event) => startDrag(index, event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelected(index);
              }}
              aria-label={`選擇第${index + 1}個方塊`}
            ><PieceView piece={piece} /></button>
          ) : <div className="piece-button used" key={index}><span>✓</span></div>)}
        </div>
      </section>

      <div className="actions">
        <button onClick={undoMove} disabled={!undo || gameOver}>↶ 回上一步</button>
        <button onClick={restart}>↻ 重新開始</button>
      </div>

      {gameOver && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div className="game-modal">
            <div className="celebration">🎉</div>
            <h2 id="game-over-title">好棒的挑戰！</h2>
            <p>這次得到</p><strong>{score} 分</strong>
            <button onClick={restart}>再玩一次</button>
          </div>
        </div>
      )}
    </main>
  );
}

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}
