"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buildChart, gradeHit, pointsForGrade, type HitGrade, type RhythmNote } from "./chart";
import styles from "./rhythm.module.css";

const AUDIO_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/audio/yoru-wo-tsukinukero.mp3`;
const APPROACH_SECONDS = 1.8;
const MISS_AFTER_SECONDS = 0.25;
const STORAGE_KEY = "fangkuai-leyuan-rhythm-high-score";
const LANE_COLORS = ["#28c7ff", "#8e5cff", "#ff3fb5", "#ffd23f"];
const LANE_KEYS = ["D", "F", "J", "K"];

type Status = "ready" | "playing" | "paused" | "finished";
type ResultCounts = Record<HitGrade, number>;

function readBest() {
  if (typeof window === "undefined") return 0;
  const value = Number.parseInt(window.localStorage.getItem(STORAGE_KEY) ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function subscribeBest() {
  return () => undefined;
}

export default function RhythmGame() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const judgedRef = useRef(new Set<number>());
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const [duration, setDuration] = useState(221.08);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<Status>("ready");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const storedBest = useSyncExternalStore(subscribeBest, readBest, () => 0);
  const [sessionBest, setSessionBest] = useState(0);
  const best = Math.max(storedBest, sessionBest);
  const [lastGrade, setLastGrade] = useState<HitGrade | null>(null);
  const [counts, setCounts] = useState<ResultCounts>({ perfect: 0, good: 0, miss: 0 });
  const [laneFlash, setLaneFlash] = useState<number | null>(null);
  const [judgedIds, setJudgedIds] = useState<Set<number>>(() => new Set());
  const chart = useMemo(() => buildChart(duration), [duration]);

  const finishSong = useCallback(() => {
    setStatus("finished");
    setCombo(0);
    comboRef.current = 0;
    const finalScore = scoreRef.current;
    const next = Math.max(readBest(), finalScore);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* storage can be unavailable */ }
    setSessionBest(next);
  }, []);

  useEffect(() => {
    if (status !== "playing") return;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const now = audio.currentTime;
      setCurrentTime(now);

      let missed = 0;
      for (const note of chart) {
        if (note.time >= now - MISS_AFTER_SECONDS) break;
        if (!judgedRef.current.has(note.id)) {
          judgedRef.current.add(note.id);
          missed += 1;
        }
      }
      if (missed) {
        setJudgedIds(new Set(judgedRef.current));
        comboRef.current = 0;
        setCombo(0);
        setCounts((value) => ({ ...value, miss: value.miss + missed }));
        setLastGrade("miss");
      }

      if (!audio.ended && status === "playing") frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
  }, [chart, status]);

  const resetGame = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    judgedRef.current = new Set();
    setJudgedIds(new Set());
    comboRef.current = 0;
    scoreRef.current = 0;
    setCurrentTime(0);
    setScore(0);
    setCombo(0);
    setCounts({ perfect: 0, good: 0, miss: 0 });
    setLastGrade(null);
    setStatus("ready");
  }, []);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === "finished") resetGame();
    try {
      await audio.play();
      setStatus("playing");
    } catch {
      setStatus("ready");
    }
  }, [resetGame, status]);

  const togglePause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === "playing") { audio.pause(); setStatus("paused"); }
    else if (status === "paused") { await audio.play(); setStatus("playing"); }
  }, [status]);

  const hitLane = useCallback((lane: number) => {
    if (status !== "playing") return;
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    setLaneFlash(lane);
    window.setTimeout(() => setLaneFlash((value) => value === lane ? null : value), 90);

    let target: RhythmNote | null = null;
    let closest = Number.POSITIVE_INFINITY;
    for (const note of chart) {
      if (note.lane !== lane || judgedRef.current.has(note.id)) continue;
      const distance = Math.abs(note.time - now);
      if (distance < closest) { closest = distance; target = note; }
      if (note.time > now + 0.24) break;
    }
    if (!target || closest > 0.22) return;

    judgedRef.current.add(target.id);
    setJudgedIds(new Set(judgedRef.current));
    const grade = gradeHit(target.time - now);
    const nextCombo = comboRef.current + 1;
    const gained = pointsForGrade(grade, nextCombo);
    comboRef.current = nextCombo;
    scoreRef.current += gained;
    setCombo(nextCombo);
    setScore(scoreRef.current);
    setCounts((value) => ({ ...value, [grade]: value[grade] + 1 }));
    setLastGrade(grade);
  }, [chart, status]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const index = LANE_KEYS.indexOf(event.key.toUpperCase());
      if (index >= 0 && !event.repeat) hitLane(index);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hitLane]);

  const visibleNotes = chart.filter((note) => {
    if (judgedIds.has(note.id)) return false;
    const until = note.time - currentTime;
    return until <= APPROACH_SECONDS + 0.15 && until >= -MISS_AFTER_SECONDS;
  });

  return (
    <main className={styles.shell}>
      <audio
        ref={audioRef}
        src={AUDIO_PATH}
        preload="auto"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 221.08)}
        onEnded={finishSong}
      />

      <header className={styles.header}>
        <Link href="/" className={styles.back}>← 方塊樂園</Link>
        <div className={styles.best}>🏆 {best}</div>
      </header>

      <section className={styles.titleBlock}>
        <p>NEON BEAT</p>
        <h1>夜を突き抜けろ</h1>
        <span>原創日文電子搖滾 · 150 BPM</span>
      </section>

      <section className={styles.scoreRow} aria-label="遊戲分數">
        <div><span>SCORE</span><strong>{score}</strong></div>
        <div><span>COMBO</span><strong>{combo}</strong></div>
      </section>

      <section className={styles.stage} aria-label="四軌節奏遊戲">
        <div className={styles.lanes}>
          {LANE_COLORS.map((color, lane) => (
            <div key={color} className={`${styles.lane} ${laneFlash === lane ? styles.laneHit : ""}`} />
          ))}
          {visibleNotes.map((note) => {
            const progress = 1 - (note.time - currentTime) / APPROACH_SECONDS;
            return (
              <div
                key={note.id}
                className={styles.note}
                style={{
                  left: `${note.lane * 25 + 2.5}%`,
                  top: `${Math.max(-8, Math.min(87, progress * 87))}%`,
                  background: LANE_COLORS[note.lane],
                  boxShadow: `0 0 18px ${LANE_COLORS[note.lane]}`,
                }}
              />
            );
          })}
          <div className={styles.judgeLine} />
          {lastGrade && status === "playing" && (
            <div className={`${styles.grade} ${styles[lastGrade]}`}>{lastGrade.toUpperCase()}</div>
          )}
        </div>

        {status !== "playing" && (
          <div className={styles.overlay}>
            {status === "finished" ? (
              <div className={styles.results}>
                <h2>演奏完成！</h2>
                <strong>{score}</strong>
                <p>PERFECT {counts.perfect}　GOOD {counts.good}　MISS {counts.miss}</p>
                <button onClick={start}>再玩一次</button>
              </div>
            ) : (
              <button className={styles.startButton} onClick={status === "paused" ? togglePause : start}>
                {status === "paused" ? "繼續演奏" : "開始演奏"}
              </button>
            )}
          </div>
        )}
      </section>

      <section className={styles.controls} aria-label="節奏按鍵">
        {LANE_COLORS.map((color, lane) => (
          <button
            key={color}
            onPointerDown={(event) => { event.preventDefault(); hitLane(lane); }}
            style={{ "--lane-color": color } as React.CSSProperties}
            aria-label={`第 ${lane + 1} 軌`}
          >
            <span>{LANE_KEYS[lane]}</span>
          </button>
        ))}
      </section>

      <div className={styles.bottomActions}>
        <button onClick={togglePause} disabled={status === "ready" || status === "finished"}>{status === "paused" ? "▶ 繼續" : "Ⅱ 暫停"}</button>
        <button onClick={resetGame}>↻ 重新開始</button>
      </div>
    </main>
  );
}
