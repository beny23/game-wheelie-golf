import Phaser from "phaser";

const matter = (Phaser.Physics.Matter as any).Matter;
const { Body, Bodies, Vector } = matter;

export type CartDetail = { obj: Phaser.GameObjects.Shape; offset: Phaser.Math.Vector2; baseRotation: number };

export type Cart = {
  chassis: MatterJS.BodyType;
  rearWheel: MatterJS.BodyType;
  frontWheel: MatterJS.BodyType;
  chassisRect: Phaser.GameObjects.Rectangle;
  rearWheelCircle: Phaser.GameObjects.Arc;
  frontWheelCircle: Phaser.GameObjects.Arc;
  details: CartDetail[];
  followTarget: Phaser.GameObjects.Zone;
};

export function createCart(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  group: number,
  startX = 200,
  startY = 360,
): Cart {
  const details: CartDetail[] = [];

  const chassis = Bodies.rectangle(startX, startY, 160, 36, {
    chamfer: { radius: 12 },
    mass: 5,
    frictionAir: 0.006,
    friction: 0.7,
    collisionFilter: { group },
    label: "chassis",
  }) as MatterJS.BodyType;

  const rearWheel = Bodies.circle(startX - 50, startY + 26, 28, {
    friction: 0.9,
    restitution: 0,
    frictionAir: 0.011,
    collisionFilter: { group },
    label: "rear-wheel",
  }) as MatterJS.BodyType;

  const frontWheel = Bodies.circle(startX + 55, startY + 22, 18, {
    friction: 0.22,
    restitution: 0,
    frictionAir: 0.009,
    collisionFilter: { group },
    label: "front-wheel",
  }) as MatterJS.BodyType;

  scene.matter.world.add([chassis, rearWheel, frontWheel]);

  scene.matter.add.constraint(chassis, rearWheel, 10, 1, {
    pointA: { x: -52, y: 14 },
    pointB: { x: 0, y: 0 },
    damping: 0.62,
    stiffness: 0.98,
  });

  scene.matter.add.constraint(chassis, frontWheel, 10, 1, {
    pointA: { x: 62, y: 14 },
    pointB: { x: 0, y: 0 },
    damping: 0.66,
    stiffness: 0.98,
  });

  Body.setCentre(chassis, { x: -16, y: 0 }, true);
  Body.setAngle(chassis, -0.1);
  Body.setAngle(rearWheel, -0.1);
  Body.setAngle(frontWheel, -0.1);
  Body.translate(frontWheel, { x: 0, y: -16 });

  Body.applyForce(rearWheel, rearWheel.position, Vector.create(0.03, -0.001));

  const chassisRect = scene.add.rectangle(startX, startY, 160, 36, 0x38bdf8, 0.95);
  chassisRect.setDepth(5);

  const rearWheelCircle = scene.add.circle(startX - 50, startY + 28, 28, 0x0ea5e9, 0.95);
  rearWheelCircle.setDepth(6);

  const frontWheelCircle = scene.add.circle(startX + 55, startY + 24, 22, 0x7dd3fc, 0.95);
  frontWheelCircle.setDepth(6);

  const followTarget = scene.add.zone(startX, startY, 10, 10);

  addCartDetail(details, scene.add.rectangle(startX + 8, startY - 28, 126, 12, 0xe2e8f0, 0.95), 8, -28);
  addCartDetail(details, scene.add.rectangle(startX - 44, startY - 2, 10, 52, 0x0ea5e9, 0.9), -44, -2);
  addCartDetail(details, scene.add.rectangle(startX + 32, startY - 6, 68, 8, 0x1f2937, 0.9), 32, -6);
  addCartDetail(details, scene.add.rectangle(startX - 6, startY + 6, 90, 18, 0xf8fafc, 0.95), -6, 6);
  addCartDetail(details, scene.add.rectangle(startX - 6, startY - 10, 90, 8, 0x94a3b8, 0.95), -6, -10);
  addCartDetail(details, scene.add.rectangle(startX + 76, startY + 10, 44, 10, 0x0ea5e9, 0.85), 76, 10);
  addCartDetail(
    details,
    scene.add.triangle(startX + 26, startY - 14, -12, 16, 40, 16, -12, -6, 0xcbd5f5, 0.55),
    26,
    -14,
  );
  addCartDetail(details, scene.add.rectangle(startX - 78, startY - 6, 18, 58, 0x78350f, 0.96), -78, -6);
  addCartDetail(details, scene.add.rectangle(startX - 78, startY - 6, 6, 62, 0xfbbf24, 0.95), -78, -6);
  addCartDetail(details, scene.add.rectangle(startX - 82, startY - 38, 6, 46, 0xd9e3f0, 0.95), -82, -38, Phaser.Math.DegToRad(-10));
  addCartDetail(details, scene.add.rectangle(startX - 90, startY - 14, 20, 6, 0x1f2937, 0.95), -90, -14, Phaser.Math.DegToRad(-10));
  addCartDetail(details, scene.add.rectangle(startX - 72, startY - 36, 6, 44, 0xd9e3f0, 0.95), -72, -36, Phaser.Math.DegToRad(-6));
  addCartDetail(details, scene.add.rectangle(startX - 80, startY - 12, 18, 6, 0x1f2937, 0.95), -80, -12, Phaser.Math.DegToRad(-6));

  return {
    chassis,
    rearWheel,
    frontWheel,
    chassisRect,
    rearWheelCircle,
    frontWheelCircle,
    details,
    followTarget,
  };
}

export function syncCartVisuals(cart: Cart): void {
  const { chassis, rearWheel, frontWheel, chassisRect, rearWheelCircle, frontWheelCircle, details, followTarget } = cart;

  chassisRect.setPosition(chassis.position.x, chassis.position.y);
  chassisRect.setRotation(chassis.angle);

  rearWheelCircle.setPosition(rearWheel.position.x, rearWheel.position.y);
  rearWheelCircle.setRotation(rearWheel.angle);

  frontWheelCircle.setPosition(frontWheel.position.x, frontWheel.position.y);
  frontWheelCircle.setRotation(frontWheel.angle);

  const angle = chassis.angle;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  details.forEach((detail) => {
    const dx = detail.offset.x;
    const dy = detail.offset.y;
    const x = chassis.position.x + dx * cos - dy * sin;
    const y = chassis.position.y + dx * sin + dy * cos;
    detail.obj.setPosition(x, y);
    detail.obj.setRotation(angle + detail.baseRotation);
  });

  followTarget.setPosition(chassis.position.x, chassis.position.y);
}

function addCartDetail(
  details: CartDetail[],
  shape: Phaser.GameObjects.Shape,
  offsetX: number,
  offsetY: number,
  baseRotation = 0,
): void {
  shape.setDepth(7);
  details.push({ obj: shape, offset: new Phaser.Math.Vector2(offsetX, offsetY), baseRotation });
}
