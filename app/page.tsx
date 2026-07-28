"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Cell = number | null;
type Point = { r: number; c: number };
type Piece = { id: string; cells: Point[]; color: number };
type Snapshot = { board: Cell[][]; pieces: Array<Piece | null>; score: number };

const SIZE = 10;
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
  const [best, setBest] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [drag, setDrag] = useState<{ index: number; x: number; y: number } | null>(null);
  const [undo, setUndo] = useState<Snapshot | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [sound, setSound] = useState(true);
  const [message, setMessage] = useState("選一個方塊，放進格子裡吧！");
  const [sparkles, setSparkles] = useState<string[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const saved = Number(localStorage.getItem("block-garden-best") || 0);
    const timer = window.setTimeout(() => setBest(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    if (nextScore > best) {
      setBest(nextScore);
      localStorage.setItem("block-garden-best", String(nextScore));
    }
    if (cleared.size) {
      setSparkles([...cleared]);
      setMessage(completeRows.length + completeCols.length > 1 ? "太厲害了！一次消除好多排！" : "漂亮！完成一排！");
      tone("clear");
      window.setTimeout(() => setSparkles([]), 450);
    } else {
      setMessage("放得好！再選一個吧！");
      tone("place");
    }

    let finalPieces = nextPieces;
    if (finalPieces.every((piece) => piece === null)) finalPieces = makeBatch();
    setPieces(finalPieces);
    const playable = finalPieces.some((piece) => piece && pieceFits(nextBoard, piece));
    if (!playable) {
      setGameOver(true);
      setMessage("好棒！看看你得到幾分！");
    }
  }

  function place(index: number, row: number, col: number) {
    const piece = pieces[index];
    if (!piece || !canPlace(board, piece, row, col)) {
      setMessage("這裡放不下，換個位置試試看！");
      return;
    }
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
    setMessage("新的挑戰開始囉！");
  }

  function undoMove() {
    if (!undo || gameOver) return;
    setBoard(cloneBoard(undo.board));
    setPieces(undo.pieces.map((piece) => piece ? { ...piece } : null));
    setScore(undo.score);
    setUndo(null);
    setSelected(null);
    setMessage("已經回到上一步囉！");
  }

  function pointCell(x: number, y: number) {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    if (!el) return null;
    return { r: Number(el.dataset.row), c: Number(el.dataset.col) };
  }

  function startDrag(index: number, event: React.PointerEvent) {
    if (!pieces[index] || gameOver) return;
    event.preventDefault();
    setSelected(index);
    setDrag({ index, x: event.clientX, y: event.clientY });
    setMessage("拖到想放的位置，再放開手指！");
  }

  function moveDrag(event: React.PointerEvent) {
    if (!drag) return;
    event.preventDefault();
    setDrag({ ...drag, x: event.clientX, y: event.clientY });
    setHover(pointCell(event.clientX, event.clientY));
  }

  function endDrag(event: React.PointerEvent) {
    if (!drag) return;
    const cell = pointCell(event.clientX, event.clientY);
    if (cell) place(drag.index, cell.r, cell.c);
    setDrag(null);
    setHover(null);
  }

  return (
    <main className="game-shell" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
      <header className="topbar">
        <div className="brand"><span aria-hidden="true">▦</span><div><h1>方塊樂園</h1><p>動動腦，排整齊！</p></div></div>
        <button className="sound-button" onClick={() => setSound(!sound)} aria-label={sound ? "關閉音效" : "開啟音效"}>{sound ? "🔊" : "🔇"}</button>
      </header>

      <section className="score-row" aria-label="分數">
        <div className="score-card"><span>現在分數</span><strong>{score}</strong></div>
        <div className="score-card best"><span>🏆 最高分</span><strong>{best}</strong></div>
      </section>

      <p className="coach" aria-live="polite"><span aria-hidden="true">✨</span>{message}</p>

      <section className="board-wrap">
        <div className="board" role="grid" aria-label="10乘10方塊棋盤">
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
        <h2>選一個方塊</h2>
        <div className="piece-row">
          {pieces.map((piece, index) => piece ? (
            <button
              key={piece.id}
              className={`piece-button ${selected === index ? "selected" : ""} ${!pieceFits(board, piece) ? "disabled-piece" : ""}`}
              onPointerDown={(event) => startDrag(index, event)}
              onClick={() => setSelected(index)}
              aria-label={`選擇第${index + 1}個方塊`}
            ><PieceView piece={piece} /></button>
          ) : <div className="piece-button used" key={index}><span>✓</span></div>)}
        </div>
      </section>

      <div className="actions">
        <button onClick={undoMove} disabled={!undo || gameOver}>↶ 回上一步</button>
        <button onClick={restart}>↻ 重新開始</button>
      </div>

      <p className="tip"><b>小提示：</b>排滿橫線或直線，就能消除方塊！</p>

      {drag && pieces[drag.index] && (
        <div className="drag-piece" style={{ left: drag.x, top: drag.y }}><PieceView piece={pieces[drag.index]!} /></div>
      )}

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
