import assert from "node:assert/strict";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/rhythm/chart.ts", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`;
const { buildChart, gradeHit, pointsForGrade } = await import(moduleUrl);

test("chart follows tempo with piano motifs, holds, flicks, and no three-note chords", () => {
  const chart = buildChart(60, 150, 0);
  assert.ok(chart.length > 120 && chart.length < 190);
  assert.deepEqual([...new Set(chart.map((note) => note.lane))].sort(), [0, 1, 2, 3]);
  assert.ok(chart.every((note) => note.time >= 1.6 && note.time < 59));
  assert.ok(chart.every((note, index) => index === 0 || note.time >= chart[index - 1].time));
  assert.ok(chart.filter((note) => note.kind === "hold").length >= 4);
  assert.ok(chart.filter((note) => note.kind.startsWith("flick")).length >= 4);
  assert.ok(new Set(chart.filter((note) => note.hold).map((note) => note.hold)).size >= 3);

  const beatLength = 60 / 150;
  assert.ok(chart.every((note) => Math.abs(note.time / beatLength * 4 - Math.round(note.time / beatLength * 4)) < 0.01));

  const groups = Map.groupBy(chart, (note) => note.time);
  assert.ok([...groups.values()].every((notes) => notes.length <= 2));
  assert.ok([...groups.values()].filter((notes) => notes[0].time < 11).every((notes) => notes.length === 1));
});

test("timing grades and combo points are predictable", () => {
  assert.equal(gradeHit(0.05), "perfect");
  assert.equal(gradeHit(-0.2), "good");
  assert.equal(gradeHit(0.3), "miss");
  assert.equal(pointsForGrade("perfect", 10), 120);
  assert.equal(pointsForGrade("perfect", 10, true), 260);
  assert.equal(pointsForGrade("miss", 10), 0);
});
