export const HIGH_SCORE_KEY = "fangkuai-leyuan-high-score";

type HighScoreStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeHighScore(value: string | null) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
}

export function readHighScore(storage: Pick<HighScoreStorage, "getItem"> | null | undefined) {
  if (!storage) return 0;
  try {
    return normalizeHighScore(storage.getItem(HIGH_SCORE_KEY));
  } catch {
    return 0;
  }
}

export function saveHighScore(storage: HighScoreStorage | null | undefined, score: number) {
  const safeScore = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
  const current = readHighScore(storage);
  const best = Math.max(current, safeScore);
  if (!storage || best === current) return best;
  try {
    storage.setItem(HIGH_SCORE_KEY, String(best));
  } catch {
    return current;
  }
  return best;
}
