import assert from "node:assert/strict";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/rhythm/chart.ts", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`;
const { buildChart, gradeHit, pointsForGrade } = await import(moduleUrl);

test("chart fills four lanes with ordered notes inside the song", () => {
  const chart = buildChart(60);
  assert.ok(chart.length > 100);
  assert.deepEqual([...new Set(chart.map((note) => note.lane))].sort(), [0, 1, 2, 3]);
  assert.ok(chart.every((note) => note.time >= 1.6 && note.time < 59));
  assert.ok(chart.every((note, index) => index === 0 || note.time >= chart[index - 1].time));
});

test("timing grades and combo points are predictable", () => {
  assert.equal(gradeHit(0.05), "perfect");
  assert.equal(gradeHit(-0.2), "good");
  assert.equal(gradeHit(0.3), "miss");
  assert.equal(pointsForGrade("perfect", 10), 120);
  assert.equal(pointsForGrade("miss", 10), 0);
});
