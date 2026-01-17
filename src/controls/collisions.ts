import Phaser from "phaser";
import { Cart } from "../cart";
import { tuning } from "../tuning";

export type CollisionHandlers = {
  frontStart: (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => void;
  frontEnd: (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => void;
  rearStart: (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => void;
  rearEnd: (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => void;
  chassisStart: (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => void;
};

export function createCollisionHandlers(opts: {
  scene: Phaser.Scene;
  cart: Cart;
  courseHazards: Set<number> | undefined;
  gameOver: () => boolean;
  frontTouchIgnoreUntil: () => number;
  startX: () => number;
  onFrontContactStart: (time: number) => void;
  onFrontContactEnd: () => void;
  onRearGrounded: (time: number) => void;
  onRearUngrounded: (time: number) => void;
  onFail: (reason: string) => void;
  setRearGrounded: (state: boolean) => void;
  rearGrounded: () => boolean;
  lastTrailTime: () => number;
  setLastTrailTime: (time: number) => void;
  spawnDustIfHardLanding: (pos: Phaser.Types.Math.Vector2Like, vy: number) => void;
  spawnSparksIfScrape: () => void;
}): CollisionHandlers {
  const { scene, cart } = opts;

  const isHazard = (body: MatterJS.BodyType): boolean => {
    return body.label === "hazard" || opts.courseHazards?.has(body.id) === true;
  };

  const isGround = (body: MatterJS.BodyType): boolean => body.label === "ground";

  const handleFrontStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
    if (opts.gameOver()) return;
    if (scene.time.now < opts.frontTouchIgnoreUntil()) return;

    for (const pair of event.pairs) {
      const bodies = [pair.bodyA, pair.bodyB];
      const involvesFront = bodies.some((b) => b.id === cart.frontWheel?.id);
      if (!involvesFront) continue;

      const other = bodies.find((b) => b.id !== cart.frontWheel?.id);
      if (!other) continue;

      if (isHazard(other)) {
        opts.onFail("Front wheel touched down — boom!");
        return;
      }

      if (isGround(other)) {
        const dx = cart.chassis.position.x - opts.startX();
        if (scene.time.now < opts.frontTouchIgnoreUntil() || dx < tuning.front.distanceGatePx) {
          continue;
        }
        opts.onFrontContactStart(scene.time.now);
      }
    }
  };

  const handleFrontEnd = (event: Phaser.Physics.Matter.Events.CollisionEndEvent): void => {
    if (opts.gameOver()) return;
    for (const pair of event.pairs) {
      const bodies = [pair.bodyA, pair.bodyB];
      const involvesFront = bodies.some((b) => b.id === cart.frontWheel?.id);
      if (!involvesFront) continue;
      opts.onFrontContactEnd();
    }
  };

  const handleRearStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
    if (opts.gameOver()) return;
    for (const pair of event.pairs) {
      const bodies = [pair.bodyA, pair.bodyB];
      const involvesRear = bodies.some((b) => b.id === cart.rearWheel?.id);
      if (!involvesRear) continue;

      const other = bodies.find((b) => b.id !== cart.rearWheel?.id);
      if (!other) continue;

      if (isHazard(other)) {
        opts.onFail("Hit hazard — boom!");
        return;
      }

      if (isGround(other)) {
        opts.setRearGrounded(true);
        opts.onRearGrounded(scene.time.now);
        opts.spawnDustIfHardLanding(cart.rearWheel.position, cart.rearWheel.velocity.y);
      }
    }
  };

  const handleRearEnd = (event: Phaser.Physics.Matter.Events.CollisionEndEvent): void => {
    if (opts.gameOver()) return;
    for (const pair of event.pairs) {
      const bodies = [pair.bodyA, pair.bodyB];
      const involvesRear = bodies.some((b) => b.id === cart.rearWheel?.id);
      if (!involvesRear) continue;
      opts.setRearGrounded(false);
      opts.onRearUngrounded(scene.time.now);
    }
  };

  const handleChassisStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
    if (opts.gameOver()) return;
    for (const pair of event.pairs) {
      const bodies = [pair.bodyA, pair.bodyB];
      const involvesChassis = bodies.some((b) => b.id === cart.chassis?.id);
      if (!involvesChassis) continue;

      const other = bodies.find((b) => b.id !== cart.chassis?.id);
      if (!other) continue;

      if (isHazard(other)) {
        opts.onFail("Hit hazard — boom!");
        return;
      }

      if (isGround(other)) {
        opts.spawnSparksIfScrape();
        const deg = Phaser.Math.RadToDeg(cart.chassis.angle % (Math.PI * 2));
        const normalized = ((deg % 360) + 360) % 360;
        const upsideDown = normalized > 150 && normalized < 330;
        if (upsideDown) {
          opts.onFail("Landed on roof — flipped!");
          return;
        }
      }
    }
  };

  return {
    frontStart: handleFrontStart,
    frontEnd: handleFrontEnd,
    rearStart: handleRearStart,
    rearEnd: handleRearEnd,
    chassisStart: handleChassisStart,
  };
}
