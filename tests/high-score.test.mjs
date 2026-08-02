import assert from "node:assert/strict";
import test from "node:test";
import { HIGH_SCORE_KEY, readHighScore, saveHighScore } from "../app/high-score.ts";

function makeStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(HIGH_SCORE_KEY, initialValue);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test("keeps the highest score on the same device", () => {
  const storage = makeStorage();
  assert.equal(saveHighScore(storage, 18), 18);
  assert.equal(saveHighScore(storage, 7), 18);
  assert.equal(readHighScore(storage), 18);
});

test("normalizes invalid and fractional saved scores", () => {
  assert.equal(readHighScore(makeStorage("not-a-score")), 0);
  assert.equal(readHighScore(makeStorage("12.9")), 12);
});
