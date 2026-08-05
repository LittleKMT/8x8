export type NoteKind = "tap" | "hold" | "flick-left" | "flick-right";

export type RhythmNote = {
  id: number;
  lane: number;
  time: number;
  kind: NoteKind;
  hold?: number;
};

export type HitGrade = "perfect" | "good" | "miss";

const MOTIFS = [
  [0, 1, 2, 3],
  [3, 2, 1, 0],
  [0, 2, 1, 3],
  [3, 1, 2, 0],
  [1, 0, 3, 2],
  [2, 3, 0, 1],
];

export function buildChart(duration: number, bpm = 150, variant = 0): RhythmNote[] {
  const notes: RhythmNote[] = [];
  const beatLength = 60 / bpm;
  const firstBeat = 4;
  const lastBeat = duration / beatLength - 3;
  let id = 0;
  let bar = 0;

  while (firstBeat + bar * 4 < lastBeat) {
    const barBeat = firstBeat + bar * 4;
    const easy = bar < 6;
    const chorus = bar >= 14 && bar % 8 >= 5;
    const motif = MOTIFS[(bar + variant * 2) % MOTIFS.length];
    const offsets = easy
      ? [0, 1, 2, 3]
      : chorus && bar % 2 === 1
        ? [0, 0.75, 1.5, 2.5, 3.25]
        : [0, 1, 2, 3];
    const holdBar = !easy && bar % 7 === (variant + 3) % 7;
    const chordBar = bar >= 10 && bar % 8 === 7;
    const holdLane = motif[0];

    offsets.forEach((offset, index) => {
      const time = Number(((barBeat + offset) * beatLength).toFixed(3));
      if (time >= duration - 1.2) return;

      if (holdBar && index === 0) {
        const holdBeats = [2, 2.5, 3, 3.5][(bar + variant) % 4];
        notes.push({
          id: id++, lane: holdLane, time, kind: "hold",
          hold: Number((holdBeats * beatLength).toFixed(3)),
        });
        return;
      }

      let lane = motif[index % motif.length];
      if (holdBar) {
        const holdIsLeft = holdLane < 2;
        const safeLanes = holdIsLeft ? [2, 3] : [0, 1];
        lane = safeLanes[index % 2];
      }

      const isFlick = !easy && index === offsets.length - 1 && (bar + variant) % 3 === 2;
      const kind: NoteKind = isFlick ? (lane < 2 ? "flick-left" : "flick-right") : "tap";
      notes.push({ id: id++, lane, time, kind });

      if (chordBar && index === 0) {
        notes.push({ id: id++, lane: (lane + 2) % 4, time, kind: "tap" });
      }
    });

    bar += 1;
  }

  return notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
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
