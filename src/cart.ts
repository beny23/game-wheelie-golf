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
  rearRim: Phaser.GameObjects.Arc;
  frontRim: Phaser.GameObjects.Arc;
  rearHub: Phaser.GameObjects.Arc;
  frontHub: Phaser.GameObjects.Arc;
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

  const chassisRect = scene.add.rectangle(startX, startY, 152, 32, 0x1fb6ad, 0.98);
  chassisRect.setDepth(5);
  const chassisShadow = scene.add.rectangle(startX, startY + 6, 152, 10, 0x0f172a, 0.18);
  chassisShadow.setDepth(4);

  const rearWheelCircle = scene.add.circle(startX - 50, startY + 26, 28, 0x0f172a, 0.98);
  rearWheelCircle.setDepth(6);
  const rearWheelRim = scene.add.circle(startX - 50, startY + 26, 14, 0xe2e8f0, 0.95);
  rearWheelRim.setDepth(7);
  const rearWheelHub = scene.add.circle(startX - 50, startY + 26, 5, 0x1fb6ad, 0.95);
  rearWheelHub.setDepth(8);

  const frontWheelCircle = scene.add.circle(startX + 55, startY + 22, 18, 0x0f172a, 0.98);
  frontWheelCircle.setDepth(6);
  const frontWheelRim = scene.add.circle(startX + 55, startY + 22, 10, 0xe2e8f0, 0.95);
  frontWheelRim.setDepth(7);
  const frontWheelHub = scene.add.circle(startX + 55, startY + 22, 4, 0x1fb6ad, 0.95);
  frontWheelHub.setDepth(8);

  const followTarget = scene.add.zone(startX, startY, 10, 10);

  // Minimal open cart: roof bar, mid struts anchored to chassis top, simple seat/back, tiny bonnet.
  addCartDetail(details, scene.add.rectangle(startX + 4, startY - 46, 120, 8, 0xf8fafc, 0.95), 4, -46);
  addCartDetail(details, scene.add.rectangle(startX - 20, startY - 12, 8, 44, 0x0b5560, 0.9), -20, -12);
  addCartDetail(details, scene.add.rectangle(startX + 38, startY - 12, 8, 44, 0x0b5560, 0.9), 38, -12);
  addCartDetail(details, scene.add.rectangle(startX, startY + 10, 104, 18, 0xf8fafc, 0.95), 0, 10);
  addCartDetail(details, scene.add.rectangle(startX, startY - 4, 102, 8, 0xd9e3f0, 0.95), 0, -4);
  addCartDetail(details, scene.add.rectangle(startX + 58, startY - 2, 44, 8, 0x0f172a, 0.8), 58, -2);
  // removed golf bag and clubs for a cleaner silhouette

  return {
    chassis,
    rearWheel,
    frontWheel,
    chassisRect,
    rearWheelCircle,
    frontWheelCircle,
    rearRim: rearWheelRim,
    frontRim: frontWheelRim,
    rearHub: rearWheelHub,
    frontHub: frontWheelHub,
    details,
    followTarget,
  };
}

export function syncCartVisuals(cart: Cart): void {
  const {
    chassis,
    rearWheel,
    frontWheel,
    chassisRect,
    rearWheelCircle,
    frontWheelCircle,
    rearRim,
    frontRim,
    rearHub,
    frontHub,
    details,
    followTarget,
  } = cart;

  chassisRect.setPosition(chassis.position.x, chassis.position.y);
  chassisRect.setRotation(chassis.angle);

  rearWheelCircle.setPosition(rearWheel.position.x, rearWheel.position.y);
  rearWheelCircle.setRotation(rearWheel.angle);
  rearRim.setPosition(rearWheel.position.x, rearWheel.position.y);
  rearRim.setRotation(rearWheel.angle);
  rearHub.setPosition(rearWheel.position.x, rearWheel.position.y);
  rearHub.setRotation(rearWheel.angle);

  frontWheelCircle.setPosition(frontWheel.position.x, frontWheel.position.y);
  frontWheelCircle.setRotation(frontWheel.angle);
  frontRim.setPosition(frontWheel.position.x, frontWheel.position.y);
  frontRim.setRotation(frontWheel.angle);
  frontHub.setPosition(frontWheel.position.x, frontWheel.position.y);
  frontHub.setRotation(frontWheel.angle);

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
