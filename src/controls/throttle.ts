import Phaser from "phaser";
import { Cart } from "../cart";
import { tuning } from "../tuning";

const matter = (Phaser.Physics.Matter as any).Matter;
const { Body, Vector } = matter;

type ThrottleParams = {
  cart: Cart;
  throttleActive: boolean;
  sceneStartTime: number;
  timeNow: number;
  rearGrounded: boolean;
  lastRearGroundTime: number;
};

export function applyThrottleForces(params: ThrottleParams): void {
  const { cart, throttleActive, sceneStartTime, timeNow, rearGrounded, lastRearGroundTime } = params;
  if (!cart.rearWheel || !cart.chassis) return;

  const torque = throttleActive ? tuning.throttle.torque : 0;
  const elapsed = timeNow - sceneStartTime;
  const ramp = Phaser.Math.Clamp(elapsed / tuning.throttle.rampMs, tuning.throttle.rampMin, 1);

  const rearContactAge = timeNow - lastRearGroundTime;
  const groundedOrRecent = rearGrounded || rearContactAge < tuning.throttle.rearRecentMs;
  if (!groundedOrRecent) return;

  const pitchAbs = Math.abs(cart.chassis.angle);
  const pitchFactor = Phaser.Math.Clamp(
    1 - Math.max(0, pitchAbs - tuning.throttle.pitchDropStartRad) * tuning.throttle.pitchDropSlope,
    tuning.throttle.pitchFactorMin,
    1,
  );

  const drive =
    torque *
    ramp *
    (rearGrounded ? tuning.throttle.rearGroundFactor : tuning.throttle.airFactor) *
    pitchFactor;

  if (drive <= 0) return;

  Body.applyForce(
    cart.rearWheel,
    cart.rearWheel.position,
    Vector.create(drive * tuning.throttle.forces.rear.x, drive * tuning.throttle.forces.rear.y),
  );

  Body.applyForce(
    cart.chassis,
    cart.chassis.position,
    Vector.create(drive * tuning.throttle.forces.chassis.x, drive * tuning.throttle.forces.chassis.y),
  );

  Body.applyForce(
    cart.chassis,
    {
      x: cart.chassis.position.x + tuning.throttle.forces.lift1.xOffset,
      y: cart.chassis.position.y + tuning.throttle.forces.lift1.yOffset,
    },
    Vector.create(0, drive * tuning.throttle.forces.lift1.y),
  );

  Body.applyForce(
    cart.chassis,
    {
      x: cart.chassis.position.x + tuning.throttle.forces.lift2.xOffset,
      y: cart.chassis.position.y + tuning.throttle.forces.lift2.yOffset,
    },
    Vector.create(0, drive * tuning.throttle.forces.lift2.y),
  );

  if (pitchAbs < tuning.throttle.angularImpulse.angleLimitRad) {
    const angImpulse = Phaser.Math.Clamp(
      drive * tuning.throttle.angularImpulse.gain,
      -tuning.throttle.angularImpulse.clamp,
      tuning.throttle.angularImpulse.clamp,
    );
    Body.setAngularVelocity(
      cart.chassis,
      Phaser.Math.Clamp(
        cart.chassis.angularVelocity - angImpulse,
        -tuning.throttle.angularImpulse.chassisClamp,
        tuning.throttle.angularImpulse.chassisClamp,
      ),
    );
  }

  Body.setAngularVelocity(
    cart.rearWheel,
    Phaser.Math.Clamp(
      cart.rearWheel.angularVelocity + tuning.throttle.wheelAngularDelta,
      tuning.throttle.wheelAngularClamp.min,
      tuning.throttle.wheelAngularClamp.max,
    ),
  );
}
