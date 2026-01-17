import Phaser from "phaser";

export type StallMeter = {
  value: number;
  max: number;
  fillRate: number;
  drainRate: number;
};

export function updateStallMeter(stall: StallMeter, throttleActive: boolean, dt: number): boolean {
  const change = throttleActive ? -stall.drainRate : stall.fillRate;
  stall.value = Phaser.Math.Clamp(stall.value + change * dt, 0, stall.max);
  return stall.value >= stall.max;
}

export function frontContactExceeded(frontContactStart: number, now: number, thresholdMs: number): boolean {
  if (!frontContactStart) return false;
  return now - frontContactStart >= thresholdMs;
}
