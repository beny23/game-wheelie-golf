export function frontContactExceeded(frontContactStart: number, now: number, thresholdMs: number): boolean {
  if (!frontContactStart) return false;
  return now - frontContactStart >= thresholdMs;
}
