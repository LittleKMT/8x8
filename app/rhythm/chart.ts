export type RhythmNote = {
  id: number;
  lane: number;
  time: number;
};

export type HitGrade = "perfect" | "good" | "miss";

const BPM = 150;
const BEAT = 60 / BPM;
const LANE_PATTERN = [0, 2, 1, 3, 0, 1, 2, 3, 1, 0, 3, 2];

export function buildChart(duration: number): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const end = Math.max(4, duration - 1.2);
  let id = 0;

  for (let beat = 4; beat * BEAT < end; beat += 1) {
    const measureBeat = beat % 8;
    if (measureBeat === 6) continue;
    const time = Number((beat * BEAT).toFixed(3));
    notes.push({ id: id++, lane: LANE_PATTERN[beat % LANE_PATTERN.length], time });

    if (measureBeat === 3 || (beat > 40 && measureBeat === 7)) {
      const firstLane = notes[notes.length - 1].lane;
      notes.push({ id: id++, lane: (firstLane + 2) % 4, time });
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

export function pointsForGrade(grade: HitGrade, combo: number): number {
  if (grade === "miss") return 0;
  const base = grade === "perfect" ? 100 : 60;
  return base + Math.min(100, combo * 2);
}
