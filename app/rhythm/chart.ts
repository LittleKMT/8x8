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
  let beat = 4;
  let event = 0;

  while (beat * beatLength < end) {
    const time = Number((beat * beatLength).toFixed(3));
    const lane = LANE_PATTERN[(event + variant * 2) % LANE_PATTERN.length];
    const early = time < 20;
    const middle = time >= 20 && time < 55;
    const isHold = !early && event % 8 === 5;
    const holdBeats = 2 + ((event + variant) % 4);

    if (early) {
      const pair = event % 2 === 0 ? [0, 1] : [2, 3];
      pair.forEach((pairLane) => notes.push({ id: id++, lane: pairLane, time }));
    } else if (isHold) {
      notes.push({ id: id++, lane, time, hold: Number((beatLength * holdBeats).toFixed(3)) });
      if (!middle && event % 24 === 21) {
        notes.push({ id: id++, lane: (lane + 2) % 4, time, hold: Number((beatLength * (holdBeats - 1)).toFixed(3)) });
      }
    } else {
      notes.push({ id: id++, lane, time });
      if (!middle && event % 5 === 3) notes.push({ id: id++, lane: (lane + 1) % 4, time });
    }

    beat += early ? 4 : middle ? 3 : 2;
    event += 1;
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
