export type RhythmNote = {
  id: number;
  lane: number;
  time: number;
  hold?: number;
};

export type HitGrade = "perfect" | "good" | "miss";

const LANE_PATTERN = [0, 2, 1, 3, 0, 1, 2, 3, 1, 0, 3, 2];

export function buildChart(duration: number, bpm = 150, variant = 0): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const beatLength = 60 / bpm;
  const end = Math.max(4, duration - 1.2);
  let id = 0;

  for (let beat = 4; beat * beatLength < end; beat += 1) {
    const measureBeat = beat % 8;
    if (measureBeat === 6) continue;
    const time = Number((beat * beatLength).toFixed(3));
    const lane = LANE_PATTERN[(beat + variant * 3) % LANE_PATTERN.length];
    const isHold = beat > 12 && (beat + variant * 5) % 24 === 0;
    const hold = isHold ? Number((beatLength * (variant % 2 === 0 ? 4 : 3)).toFixed(3)) : undefined;
    notes.push({ id: id++, lane, time, ...(hold ? { hold } : {}) });

    if (!hold && (measureBeat === 3 || (beat > 40 && measureBeat === 7))) {
      notes.push({ id: id++, lane: (lane + 2) % 4, time });
    }
  }

  return notes;
}

export function gradeHit(offsetSeconds: number): HitGrade {
  const distance = Math.abs(offsetSeconds);
  if (distance <= 0.09) return "perfect";
  if (distance <= 0.22) return "good";
  return "miss";
}

export function pointsForGrade(grade: HitGrade, combo: number, isHold = false): number {
  if (grade === "miss") return 0;
  const base = grade === "perfect" ? 100 : 60;
  return base + Math.min(100, combo * 2) + (isHold ? 140 : 0);
}
