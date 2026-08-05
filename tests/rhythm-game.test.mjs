import assert from "node:assert/strict";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/rhythm/chart.ts", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`;
const { FIRST_SONG_BEAT_OFFSET, buildChart, gradeHit, pointsForGrade } = await import(moduleUrl);

test("first song uses a tempo-locked Sekai-style chart with curved slide holds", () => {
  const chart = buildChart(60, 150, 0);
  assert.ok(chart.length > 120 && chart.length < 190);
  assert.deepEqual([...new Set(chart.map((note) => note.lane))].sort(), [0, 1, 2, 3]);
  assert.ok(chart.every((note) => note.time >= 1.89 && note.time < 59));
  assert.ok(chart.every((note, index) => index === 0 || note.time >= chart[index - 1].time));
  assert.ok(chart.filter((note) => note.kind === "slide").length >= 4);
  assert.ok(chart.filter((note) => note.kind.startsWith("flick")).length >= 4);
  assert.ok(new Set(chart.filter((note) => note.hold).map((note) => note.hold)).size >= 3);
  assert.ok(chart.filter((note) => note.kind === "slide").every((note) => note.endLane !== note.lane));

  const beatLength = 60 / 150;
  assert.ok(chart.every((note) => {
    const snapped = (note.time - FIRST_SONG_BEAT_OFFSET) / beatLength * 4;
    return Math.abs(snapped - Math.round(snapped)) < 0.01;
  }));

  const groups = Map.groupBy(chart, (note) => note.time);
  assert.ok([...groups.values()].every((notes) => notes.length <= 2));
  assert.ok([...groups.values()].filter((notes) => notes[0].time < 11).every((notes) => notes.length === 1));
});

test("other songs keep their existing piano motif chart", () => {
  const chart = buildChart(60, 165, 1);
  assert.ok(chart.some((note) => note.kind === "hold"));
  assert.equal(chart.some((note) => note.kind === "slide"), false);
});

test("timing grades and combo points are predictable", () => {
  assert.equal(gradeHit(0.05), "perfect");
  assert.equal(gradeHit(-0.2), "good");
  assert.equal(gradeHit(0.3), "miss");
  assert.equal(pointsForGrade("perfect", 10), 120);
  assert.equal(pointsForGrade("perfect", 10, true), 260);
  assert.equal(pointsForGrade("miss", 10), 0);
});
