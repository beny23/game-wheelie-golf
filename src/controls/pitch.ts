import Phaser from "phaser";
import { Cart } from "../cart";
import { tuning } from "../tuning";

const matter = (Phaser.Physics.Matter as any).Matter;
const { Body } = matter;

type PitchParams = {
  cart: Cart;
  dt: number;
  rearGrounded: boolean;
  throttleActive: boolean;
};

export function stabilizePitch(params: PitchParams): void {
  const { cart, dt, rearGrounded, throttleActive } = params;
  if (!cart.chassis) return;

  if (!rearGrounded) {
    const dampedAir = Phaser.Math.Clamp(
      cart.chassis.angularVelocity * tuning.pitch.airDamp,
      -tuning.pitch.airClamp,
      tuning.pitch.airClamp,
    );
    Body.setAngularVelocity(cart.chassis, dampedAir);
    return;
  }

  const damped = cart.chassis.angularVelocity * tuning.pitch.damp;
  const correctionScale = throttleActive ? tuning.pitch.throttleScale : 1;
  const correction = -cart.chassis.angle * tuning.pitch.correction * correctionScale;
  const target = damped + correction * dt * tuning.pitch.targetGain;
  const clampLimit = throttleActive ? tuning.pitch.clampThrottle : tuning.pitch.clampCoast;
  const clamped = Phaser.Math.Clamp(target, -clampLimit, clampLimit);
  Body.setAngularVelocity(cart.chassis, clamped);
}
