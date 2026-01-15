import Phaser from "phaser";

export type GroundPiece = {
  body: MatterJS.BodyType;
  visuals: Phaser.GameObjects.GameObject[];
  isHazard: boolean;
  endX: number;
};

export type CourseState = {
  pieces: GroundPiece[];
  hazardBodies: Set<number>;
  nextChunkX: number;
  chunkIndex: number;
  worldWidth: number;
  groundY: number;
  groundColors: number[];
  groundCategory: number;
};

export function createCourse(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  groundCategory: number,
  cam?: Phaser.Cameras.Scene2D.Camera,
): CourseState {
  const state: CourseState = {
    pieces: [],
    hazardBodies: new Set<number>(),
    nextChunkX: 0,
    chunkIndex: 0,
    worldWidth: 4000,
    groundY: 440,
    groundColors: [0x3f2d20, 0x35251a, 0x2a1c13],
    groundCategory,
  };

  addStartLine(scene, state);

  while (state.nextChunkX < 3000) {
    addProceduralChunk(scene, state, cam, true);
  }

  expandWorldBounds(scene, state, cam);
  return state;
}

export function ensureCourseAhead(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  chassisX: number,
  cam?: Phaser.Cameras.Scene2D.Camera,
): void {
  const needAhead = 2000;
  while (state.nextChunkX < chassisX + needAhead) {
    addProceduralChunk(scene, state, cam, false);
  }

  cleanupCourse(scene, state, chassisX);
  expandWorldBounds(scene, state, cam);
}

function addGround(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  x: number,
  y: number,
  width: number,
  height: number,
  angle: number,
  color: number,
  isHazard = false,
): GroundPiece {
  const body = scene.matter.add.rectangle(x, y, width, height, {
    isStatic: true,
    angle,
    chamfer: { radius: 8 },
    collisionFilter: { category: state.groundCategory },
    label: isHazard ? "hazard" : "ground",
    friction: 0.9,
    frictionStatic: 0.9,
  });

  const base = scene.add.rectangle(x, y, width, height, color, isHazard ? 0.95 : 1);
  base.setRotation(angle);

  const topColor = isHazard ? 0xbe123c : 0x65a30d;
  const strip = scene.add.rectangle(x, y - height / 2 + 6, width, 12, topColor, isHazard ? 0.95 : 1);
  strip.setRotation(angle);
  strip.setDepth(base.depth + 1);

  if (isHazard) {
    state.hazardBodies.add(body.id);
  }

  const piece: GroundPiece = { body, visuals: [base, strip], isHazard, endX: x + width / 2 };
  state.pieces.push(piece);
  return piece;
}

function addStartLine(scene: Phaser.Scene, state: CourseState): void {
  const y = state.groundY;
  scene.add.rectangle(120, y - 60, 16, 160, 0xf8fafc, 0.8).setDepth(2);
  scene.add.rectangle(120, y - 60, 6, 160, 0x0ea5e9, 0.95).setDepth(3);
  scene.add.text(96, y - 140, "START", { fontSize: "20px", color: "#e2e8f0" }).setDepth(3);
}

function addProceduralChunk(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  cam: Phaser.Cameras.Scene2D.Camera | undefined,
  initialEase: boolean,
): void {
  const startX = state.nextChunkX;
  const difficulty = initialEase ? 0.6 : Math.min(1 + state.chunkIndex * 0.08, 3.5);
  const chunkWidth = 760 + Phaser.Math.Between(-60, 120) + Math.min(state.chunkIndex * 6, 260);
  const height = 78 + Phaser.Math.Between(-6, 10);
  const angleRange = (0.018 + 0.01 * difficulty) * (initialEase ? 0.6 : 1);
  const angle = Phaser.Math.FloatBetween(-angleRange, angleRange);
  const centerX = startX + chunkWidth / 2;
  const baseY = state.groundY + Phaser.Math.Between(-6, 8);
  const color = state.groundColors[(state.chunkIndex + 1) % state.groundColors.length];

  const groundPiece = addGround(scene, state, centerX, baseY, chunkWidth, height, angle, color, false);

  const hazardChance = initialEase ? 0 : Math.min(0.12 + state.chunkIndex * 0.012, 0.38);
  if (Math.random() < hazardChance && chunkWidth > 360) {
    const hazardWidth = Phaser.Math.Between(140, 240);
    const hazardHeight = 36;
    const hazardCenter = startX + Phaser.Math.Between(Math.floor(chunkWidth * 0.35), Math.floor(chunkWidth * 0.78));
    addGround(scene, state, hazardCenter, baseY - 2, hazardWidth, hazardHeight, 0, 0xbe123c, true);
  }

  decorateChunk(scene, state, groundPiece, startX, chunkWidth, baseY, height, angle, initialEase);

  state.nextChunkX += chunkWidth;
  state.chunkIndex += 1;
  expandWorldBounds(scene, state, cam);
}

function decorateChunk(
  scene: Phaser.Scene,
  state: CourseState,
  piece: GroundPiece,
  startX: number,
  width: number,
  baseY: number,
  height: number,
  angle: number,
  initialEase: boolean,
): void {
  const surfaceY = baseY - height / 2;
  const visuals = piece.visuals;
  const depth = 4;

  if (Math.random() < (initialEase ? 0.6 : 0.35)) {
    const teeX = startX + Math.max(38, width * 0.08);
    const gap = 28;
    const teeLeft = scene.add.circle(teeX, surfaceY - 6, 8, 0x0ea5e9, 0.9).setDepth(depth);
    const teeRight = scene.add.circle(teeX + gap, surfaceY - 6, 8, 0xf472b6, 0.9).setDepth(depth);
    const ball = scene.add.circle(teeX + gap * 0.5, surfaceY - 10, 5, 0xf8fafc, 1).setDepth(depth + 1);
    teeLeft.setRotation(angle);
    teeRight.setRotation(angle);
    ball.setRotation(angle);
    visuals.push(teeLeft, teeRight, ball);
  }

  const bunkerChance = initialEase ? 0.25 : 0.45;
  if (Math.random() < bunkerChance) {
    const bunkerWidth = Phaser.Math.Between(120, 180);
    const bunkerHeight = Phaser.Math.Between(36, 54);
    const bunkerX = startX + Phaser.Math.Between(Math.floor(width * 0.25), Math.floor(width * 0.7));
    const bunkerY = surfaceY + Phaser.Math.Between(16, 30);
    const bunker = scene.add.ellipse(bunkerX, bunkerY, bunkerWidth, bunkerHeight, 0xf5d399, 0.92).setDepth(depth - 1);
    bunker.setRotation(angle);
    visuals.push(bunker);
  }

  const pinChance = initialEase ? 0.25 : 0.55;
  if (Math.random() < pinChance && width > 320) {
    const pinX = startX + width * Phaser.Math.FloatBetween(0.52, 0.82);
    const hole = scene.add.circle(pinX, surfaceY - 2, 6, 0x111827, 0.9).setDepth(depth + 1);
    const pin = scene.add.rectangle(pinX, surfaceY - 24, 4, 52, 0xf8fafc, 0.95).setDepth(depth + 2);
    const flag = scene.add.triangle(pinX + 12, surfaceY - 44, 0, 0, 22, 10, 0, 18, 0x10b981, 0.95).setDepth(depth + 3);
    hole.setRotation(angle);
    pin.setRotation(angle);
    flag.setRotation(angle + Phaser.Math.DegToRad(-4));
    visuals.push(hole, pin, flag);
  }
}

function cleanupCourse(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  chassisX: number,
): void {
  const remaining: GroundPiece[] = [];
  const removeBeforeX = chassisX - 1600;

  for (const piece of state.pieces) {
    if (piece.endX < removeBeforeX) {
      scene.matter.world.remove(piece.body);
      piece.visuals.forEach((v) => v.destroy());
      if (piece.isHazard) state.hazardBodies.delete(piece.body.id);
    } else {
      remaining.push(piece);
    }
  }

  state.pieces = remaining;
}

function expandWorldBounds(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  cam?: Phaser.Cameras.Scene2D.Camera,
): void {
  const targetWidth = Math.max(state.nextChunkX + 1200, state.worldWidth);
  state.worldWidth = targetWidth;

  scene.matter.world.setBounds(0, 0, targetWidth, 540, 32, true, true, false, true);
  if (cam) {
    cam.setBounds(0, 0, targetWidth, 540);
  }
}
