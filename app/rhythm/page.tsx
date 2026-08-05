"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FIRST_SONG_BEAT_OFFSET, buildChart, gradeHit, pointsForGrade, type HitGrade, type RhythmNote } from "./chart";
import styles from "./rhythm.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const APPROACH_SECONDS = 1.8;
const MISS_AFTER_SECONDS = 0.25;
const STORAGE_PREFIX = "fangkuai-leyuan-rhythm-high-score";
const LANE_COLORS = ["#28c7ff", "#8e5cff", "#ff3fb5", "#ffd23f"];
const LANE_KEYS = ["D", "F", "J", "K"];

const SONGS = [
  { id: "yoru", title: "夜を突き抜けろ", label: "日文電子搖滾", bpm: 150, file: "yoru-wo-tsukinukero.mp3", duration: 221.08 },
  { id: "pulse", title: "Zero Gravity Pulse", label: "日文 Cyber Rock", bpm: 165, file: "zero-gravity-pulse.mp3", duration: 220 },
  { id: "crown", title: "Electric Crown", label: "英文 Electro Pop Rock", bpm: 140, file: "electric-crown.mp3", duration: 220 },
] as const;

type Status = "ready" | "playing" | "paused" | "finished";
type ResultCounts = Record<HitGrade, number>;
type ActiveHold = { note: RhythmNote; grade: HitGrade; startedAt: number; endsAt: number };
type FlickStart = { x: number; grade: HitGrade };
type Feedback = HitGrade | "hold" | "swipe" | null;

function scoreKey(songId: string) {
  return `${STORAGE_PREFIX}-${songId}`;
}

function readBest(songId: string) {
  if (typeof window === "undefined") return 0;
  const value = Number.parseInt(window.localStorage.getItem(scoreKey(songId)) ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function subscribeBest() {
  return () => undefined;
}

export default function RhythmGame() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const judgedRef = useRef(new Set<number>());
  const pressedLanesRef = useRef(new Set<number>());
  const activeHoldsRef = useRef(new Map<number, ActiveHold>());
  const flickStartsRef = useRef(new Map<number, FlickStart>());
  const toneRef = useRef<AudioContext | null>(null);
  const comboRef = useRef(0);
  const scoreRef = useRef(0);
  const [songIndex, setSongIndex] = useState(0);
  const song = SONGS[songIndex];
  const [duration, setDuration] = useState<number>(song.duration);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<Status>("ready");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const getStoredBest = useCallback(() => readBest(song.id), [song.id]);
  const storedBest = useSyncExternalStore(subscribeBest, getStoredBest, () => 0);
  const [sessionBest, setSessionBest] = useState(0);
  const best = Math.max(storedBest, sessionBest);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [counts, setCounts] = useState<ResultCounts>({ perfect: 0, good: 0, miss: 0 });
  const [laneFlash, setLaneFlash] = useState<number | null>(null);
  const [judgedIds, setJudgedIds] = useState<Set<number>>(() => new Set());
  const [activeHoldIds, setActiveHoldIds] = useState<Set<number>>(() => new Set());
  const [activeHoldStarts, setActiveHoldStarts] = useState<Map<number, number>>(() => new Map());
  const chart = useMemo(() => buildChart(duration, song.bpm, songIndex), [duration, song.bpm, songIndex]);
  const isFirstSong = songIndex === 0;
  const approachSeconds = isFirstSong ? 2.35 : APPROACH_SECONDS;
  const beatPhase = ((currentTime - FIRST_SONG_BEAT_OFFSET) * song.bpm / 60 % 1 + 1) % 1;

  const playKeyTone = useCallback((lane: number) => {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = toneRef.current ?? new Context();
    toneRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const frequencies = [523.25, 659.25, 783.99, 1046.5];
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequencies[lane], context.currentTime);
    gain.gain.setValueAtTime(0.055, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.17);
  }, []);

  const recordGrade = useCallback((note: RhythmNote, grade: HitGrade, isHold = false) => {
    if (judgedRef.current.has(note.id)) return;
    judgedRef.current.add(note.id);
    setJudgedIds(new Set(judgedRef.current));
    setFeedback(grade);

    if (grade === "miss") {
      comboRef.current = 0;
      setCombo(0);
      setCounts((value) => ({ ...value, miss: value.miss + 1 }));
      return;
    }

    const nextCombo = comboRef.current + 1;
    playKeyTone(note.lane);
    scoreRef.current += pointsForGrade(grade, nextCombo, isHold);
    comboRef.current = nextCombo;
    setCombo(nextCombo);
    setScore(scoreRef.current);
    setCounts((value) => ({ ...value, [grade]: value[grade] + 1 }));
  }, [playKeyTone]);

  const finishHold = useCallback((lane: number, success: boolean) => {
    const active = activeHoldsRef.current.get(lane);
    if (!active) return;
    activeHoldsRef.current.delete(lane);
    pressedLanesRef.current.delete(lane);
    setLaneFlash((value) => value === lane ? null : value);
    setActiveHoldIds(new Set([...activeHoldsRef.current.values()].map((value) => value.note.id)));
    setActiveHoldStarts(new Map([...activeHoldsRef.current.values()].map((value) => [value.note.id, value.startedAt])));
    recordGrade(active.note, success ? active.grade : "miss", true);
  }, [recordGrade]);

  const finishSong = useCallback(() => {
    setStatus("finished");
    setCombo(0);
    comboRef.current = 0;
    pressedLanesRef.current.clear();
    activeHoldsRef.current.clear();
    flickStartsRef.current.clear();
    setActiveHoldIds(new Set());
    setActiveHoldStarts(new Map());
    const finalScore = scoreRef.current;
    const next = Math.max(readBest(song.id), finalScore);
    try { window.localStorage.setItem(scoreKey(song.id), String(next)); } catch { /* storage can be unavailable */ }
    setSessionBest(next);
  }, [song.id]);

  useEffect(() => {
    if (status !== "playing") return;

    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const now = audio.currentTime;
      setCurrentTime(now);

      for (const [lane, active] of activeHoldsRef.current) {
        if (now >= active.endsAt - 0.05 && pressedLanesRef.current.has(lane)) finishHold(lane, true);
      }

      const activeIds = new Set([
        ...[...activeHoldsRef.current.values()].map((value) => value.note.id),
        ...flickStartsRef.current.keys(),
      ]);
      const missed: RhythmNote[] = [];
      for (const note of chart) {
        if (note.time >= now - MISS_AFTER_SECONDS) break;
        if (!judgedRef.current.has(note.id) && !activeIds.has(note.id)) missed.push(note);
      }
      missed.forEach((note) => recordGrade(note, "miss"));

      if (!audio.ended) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
  }, [chart, finishHold, recordGrade, status]);

  const resetGame = useCallback(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    judgedRef.current = new Set();
    pressedLanesRef.current.clear();
    activeHoldsRef.current.clear();
    flickStartsRef.current.clear();
    setJudgedIds(new Set());
    setActiveHoldIds(new Set());
    setActiveHoldStarts(new Map());
    comboRef.current = 0;
    scoreRef.current = 0;
    setCurrentTime(0);
    setScore(0);
    setCombo(0);
    setCounts({ perfect: 0, good: 0, miss: 0 });
    setFeedback(null);
    setStatus("ready");
  }, []);

  const chooseSong = useCallback((index: number) => {
    resetGame();
    setSongIndex(index);
    setDuration(SONGS[index].duration);
    setSessionBest(0);
  }, [resetGame]);

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
    if (status === "playing") {
      audio.pause();
      for (const lane of activeHoldsRef.current.keys()) finishHold(lane, false);
      pressedLanesRef.current.clear();
      setStatus("paused");
    } else if (status === "paused") {
      await audio.play();
      setStatus("playing");
    }
  }, [finishHold, status]);

  const pressLane = useCallback((lane: number) => {
    if (status !== "playing" || pressedLanesRef.current.has(lane)) return;
    const audio = audioRef.current;
    if (!audio) return;
    pressedLanesRef.current.add(lane);
    const now = audio.currentTime;
    setLaneFlash(lane);

    let target: RhythmNote | null = null;
    let closest = Number.POSITIVE_INFINITY;
    for (const note of chart) {
      if (note.lane !== lane || judgedRef.current.has(note.id)) continue;
      const distance = Math.abs(note.time - now);
      if (distance < closest) { closest = distance; target = note; }
      if (note.time > now + 0.24) break;
    }
    if (!target || closest > 0.22) return;

    const grade = gradeHit(target.time - now);
    if (target.hold) {
      activeHoldsRef.current.set(lane, {
        note: target,
        grade,
        startedAt: now,
        endsAt: isFirstSong ? target.time + (target.hold ?? 0) : now + (target.hold ?? 0),
      });
      setActiveHoldIds(new Set([...activeHoldsRef.current.values()].map((value) => value.note.id)));
      setActiveHoldStarts(new Map([...activeHoldsRef.current.values()].map((value) => [value.note.id, value.startedAt])));
      setFeedback("hold");
      playKeyTone(target.lane);
    } else {
      recordGrade(target, grade);
    }
  }, [chart, isFirstSong, playKeyTone, recordGrade, status]);

  const releaseLane = useCallback((lane: number) => {
    pressedLanesRef.current.delete(lane);
    setLaneFlash((value) => value === lane ? null : value);
    const active = activeHoldsRef.current.get(lane);
    const audio = audioRef.current;
    if (!active || !audio) return;
    finishHold(lane, audio.currentTime >= active.endsAt - 0.18);
  }, [finishHold]);

  const pressNote = useCallback((note: RhythmNote, pointerX: number) => {
    if (status !== "playing" || judgedRef.current.has(note.id)) return;
    const audio = audioRef.current;
    if (!audio || activeHoldsRef.current.has(note.lane)) return;
    const grade = isFirstSong ? gradeHit(note.time - audio.currentTime) : "perfect";
    if (isFirstSong && grade === "miss") {
      setFeedback(null);
      return;
    }
    pressedLanesRef.current.add(note.lane);
    setLaneFlash(note.lane);

    if (note.kind === "flick-left" || note.kind === "flick-right") {
      flickStartsRef.current.set(note.id, { x: pointerX, grade });
      setFeedback("swipe");
    } else if (note.hold) {
      activeHoldsRef.current.set(note.lane, {
        note,
        grade,
        startedAt: audio.currentTime,
        endsAt: isFirstSong ? note.time + note.hold : audio.currentTime + note.hold,
      });
      setActiveHoldIds(new Set([...activeHoldsRef.current.values()].map((value) => value.note.id)));
      setActiveHoldStarts(new Map([...activeHoldsRef.current.values()].map((value) => [value.note.id, value.startedAt])));
      setFeedback("hold");
      playKeyTone(note.lane);
    } else {
      recordGrade(note, grade);
    }
  }, [isFirstSong, playKeyTone, recordGrade, status]);

  const releaseNote = useCallback((note: RhythmNote, pointerX: number) => {
    const flickStart = flickStartsRef.current.get(note.id);
    if (flickStart) {
      flickStartsRef.current.delete(note.id);
      pressedLanesRef.current.delete(note.lane);
      setLaneFlash((value) => value === note.lane ? null : value);
      const distance = pointerX - flickStart.x;
      const correct = note.kind === "flick-left" ? distance <= -24 : distance >= 24;
      recordGrade(note, correct ? flickStart.grade : "miss");
      return;
    }
    releaseLane(note.lane);
  }, [recordGrade, releaseLane]);

  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(event.key.toUpperCase());
      if (lane >= 0 && !event.repeat) { event.preventDefault(); pressLane(lane); }
    };
    const handleUp = (event: KeyboardEvent) => {
      const lane = LANE_KEYS.indexOf(event.key.toUpperCase());
      if (lane >= 0) { event.preventDefault(); releaseLane(lane); }
    };
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, [pressLane, releaseLane]);

  const visibleNotes = chart.filter((note) => {
    if (judgedIds.has(note.id)) return false;
    const until = note.time - currentTime;
    const holdEnd = note.time + (note.hold ?? 0);
    return until <= approachSeconds + 0.15 && holdEnd >= currentTime - MISS_AFTER_SECONDS;
  });

  return (
    <main className={styles.shell}>
      <audio
        key={song.id}
        ref={audioRef}
        src={`${BASE_PATH}/audio/${song.file}`}
        preload="auto"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || song.duration)}
        onEnded={finishSong}
      />

      <header className={styles.header}>
        <Link href="/" className={styles.back}>← 方塊樂園</Link>
        <div className={styles.best}>🏆 {best}</div>
      </header>

      <section className={styles.songPicker} aria-label="選擇歌曲">
        {SONGS.map((item, index) => (
          <button key={item.id} onClick={() => chooseSong(index)} className={songIndex === index ? styles.songSelected : ""}>
            <strong>{index + 1}</strong><span>{item.title}</span>
          </button>
        ))}
      </section>

      <section className={styles.titleBlock}>
        <p>NEON BEAT</p>
        <h1>{song.title}</h1>
        <span>{song.label} · {song.bpm} BPM · 點擊／長按／照箭頭左右滑</span>
      </section>

      <section className={styles.scoreRow} aria-label="遊戲分數">
        <div><span>SCORE</span><strong>{score}</strong></div>
        <div><span>COMBO</span><strong>{combo}</strong></div>
      </section>

      <section className={`${styles.stage} ${isFirstSong ? styles.sekaiStage : ""}`} aria-label="四軌節奏遊戲">
        <div className={styles.lanes}>
          {isFirstSong && <div className={styles.trackHighway} aria-hidden="true" />}
          {LANE_COLORS.map((color, lane) => (
            <div key={color} className={`${styles.lane} ${laneFlash === lane ? styles.laneHit : ""}`} />
          ))}
          {visibleNotes.map((note) => {
            const isActive = activeHoldIds.has(note.id);
            const progress = 1 - (note.time - currentTime) / approachSeconds;
            const depth = Math.max(0, Math.min(1, progress));
            const top = isFirstSong
              ? Math.max(4, Math.min(86, 6 + Math.pow(depth, 1.45) * 80))
              : Math.max(-8, Math.min(87, progress * 87));
            const laneCenter = note.lane * 25 + 12.5;
            const perspectiveLeft = isFirstSong ? 50 + (laneCenter - 50) * (0.2 + depth * 0.8) : laneCenter;
            const noteScale = isFirstSong ? 0.3 + depth * 0.78 : 1;
            const activeStart = activeHoldStarts.get(note.id);
            const remainingHold = note.hold
              ? Math.max(0, activeStart === undefined ? note.hold : note.hold - (currentTime - activeStart))
              : 0;
            const holdLength = Math.min(80, remainingHold / approachSeconds * 87);
            const slideDirection = (note.endLane ?? note.lane) - note.lane;
            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                aria-label={note.hold ? `第 ${note.lane + 1} 軌長按音符` : note.kind.startsWith("flick") ? `第 ${note.lane + 1} 軌滑動音符` : `第 ${note.lane + 1} 軌點擊音符`}
                className={`${styles.note} ${isFirstSong ? styles.sekaiNote : ""} ${note.hold ? styles.holdNote : ""} ${note.kind === "slide" ? styles.slideNote : ""} ${note.kind.startsWith("flick") ? styles.flickNote : ""} ${isActive ? styles.activeHold : ""}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pressNote(note, event.clientX);
                }}
                onPointerUp={(event) => releaseNote(note, event.clientX)}
                onPointerCancel={(event) => releaseNote(note, event.clientX)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                    if (note.kind.startsWith("flick")) recordGrade(note, "perfect");
                    else pressNote(note, 0);
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === "Enter" || event.key === " ") releaseNote(note, 0);
                }}
                style={{
                  left: `${perspectiveLeft}%`,
                  top: `${top}%`,
                  background: LANE_COLORS[note.lane],
                  color: LANE_COLORS[note.lane],
                  boxShadow: `0 0 18px ${LANE_COLORS[note.lane]}`,
                  "--hold-length": `${holdLength}%`,
                  "--note-scale": noteScale,
                  "--slide-skew": `${slideDirection * 14}deg`,
                  opacity: isFirstSong ? 0.38 + depth * 0.62 : 1,
                } as React.CSSProperties}
              >
                {note.kind === "slide" && <span className={styles.slideRibbon} />}
                {note.kind === "flick-left" && <span className={styles.flickArrow}>←</span>}
                {note.kind === "flick-right" && <span className={styles.flickArrow}>→</span>}
              </div>
            );
          })}
          <div
            className={`${styles.judgeLine} ${isFirstSong ? styles.tempoJudge : ""}`}
            style={isFirstSong ? { opacity: 0.56 + (1 - beatPhase) * 0.44, transform: `scaleY(${1 + (1 - beatPhase) * 0.85})` } : undefined}
          />
          {feedback && status === "playing" && (
            <div className={`${styles.grade} ${styles[feedback]}`}>{feedback === "hold" ? "HOLD" : feedback === "swipe" ? "SWIPE!" : feedback.toUpperCase()}</div>
          )}
          <div className={styles.pianoKeys} aria-hidden="true">
            {LANE_COLORS.map((color, lane) => <i key={color} className={laneFlash === lane ? styles.pianoKeyActive : ""}>{lane + 1}</i>)}
          </div>
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

      <div className={styles.bottomActions}>
        <button onClick={togglePause} disabled={status === "ready" || status === "finished"}>{status === "paused" ? "▶ 繼續" : "Ⅱ 暫停"}</button>
        <button onClick={resetGame}>↻ 重新開始</button>
      </div>
    </main>
  );
}
