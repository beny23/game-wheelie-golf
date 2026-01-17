export const tuning = {
  start: {
    graceMs: 2200,
  },
  front: {
    contactThresholdMs: 120,
    distanceGatePx: 260,
  },
  throttle: {
    torque: 0.0039,
    rampMs: 1400,
    rampMin: 0.35,
    rearRecentMs: 160,
    rearGroundFactor: 1,
    airFactor: 0.62,
    pitchDropStartRad: 0.2,
    pitchDropSlope: 2.1,
    pitchFactorMin: 0.36,
    forces: {
      rear: { x: 8.4, y: -0.1 },
      chassis: { x: 4.8, y: -0.01 },
      lift1: { xOffset: -52, yOffset: 10, y: -0.22 },
      lift2: { xOffset: -64, yOffset: 4, y: -0.04 },
    },
    angularImpulse: {
      gain: 3.5,
      clamp: 0.7,
      angleLimitRad: 0.35,
      chassisClamp: 1.8,
    },
    wheelAngularDelta: 0.05,
    wheelAngularClamp: { min: -8.5, max: 10.5 },
  },
  pitch: {
    airDamp: 0.995,
    airClamp: 4.5,
    damp: 0.979,
    correction: 0.084,
    throttleScale: 0.55,
    targetGain: 1.45,
    clampThrottle: 1.55,
    clampCoast: 2.0,
  },
  stall: {
    max: 100,
    fillRate: 25,
    drainRate: 40,
  },
  speed: {
    maxPxPerSec: 900,
  },
  hud: {
    kmhScale: 0.036, // px/s to km/h when 100px = 1m
  },
  milestones: {
    intervalMeters: 250,
    stallRelief: 20,
    impulse: { x: 0.004, y: -0.0012 },
  },
  trails: {
    minSpeedPxPerSec: 240,
    cooldownMs: 90,
  },
};
