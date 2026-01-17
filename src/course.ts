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
  lastSurfaceY: number;
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
    lastSurfaceY: 440,
  };

  addStartLine(scene, state);

  while (state.nextChunkX < 3000) {
    addProceduralChunk(scene, state, cam, true);
  }

  expandWorldBounds(scene, state, cam);
  return state;
}

function difficultyFactor(state: CourseState, initialEase: boolean): number {
  if (initialEase) return 0.6;
  const ramp = 0.9 + state.chunkIndex * 0.08;
  return Phaser.Math.Clamp(ramp, 0.9, 3.8);
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
  frictionOverride?: number,
  topColorOverride?: number,
): GroundPiece {
  const body = scene.matter.add.rectangle(x, y, width, height, {
    isStatic: true,
    angle,
    chamfer: { radius: 8 },
    collisionFilter: { category: state.groundCategory },
    label: isHazard ? "hazard" : "ground",
    friction: frictionOverride ?? 0.9,
    frictionStatic: frictionOverride ?? 0.9,
  });

  const base = scene.add.rectangle(x, y, width, height, color, isHazard ? 0.95 : 1);
  base.setRotation(angle);

  const topColor = topColorOverride ?? (isHazard ? 0xbe123c : 0x65a30d);
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

function clampSurfaceY(baseY: number, height: number, maxSurfaceY: number): number {
  const surfaceY = baseY - height / 2;
  if (surfaceY > maxSurfaceY) {
    return baseY - (surfaceY - maxSurfaceY);
  }
  return baseY;
}

function addMicroKicker(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  centerX: number,
  surfaceY: number,
  width: number,
  height: number,
  color: number,
): GroundPiece {
  const angle = 0.12;
  // Align top surface with the surrounding terrain while giving a gentle takeoff.
  const centerY = surfaceY + height / 2;
  return addGround(scene, state, centerX, centerY, width, height, angle, color, false);
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
  const diff = difficultyFactor(state, initialEase);
  const progress = Phaser.Math.Clamp(state.chunkIndex / 30, 0, 1);

  const chunkWidth = 720
    + Phaser.Math.Between(-80, 160)
    + Math.min(state.chunkIndex * 10, 360)
    + Math.floor(diff * 40);

  const featureRoll = Math.random();
  const gapChance = initialEase ? 0 : Phaser.Math.Clamp(0.12 + progress * 0.35, 0.12, 0.5);
  const kickerChance = initialEase ? 0.1 : Phaser.Math.Clamp(0.18 + progress * 0.25, 0.18, 0.55);

  if (!initialEase && featureRoll < gapChance) {
    addGapChunk(scene, state, cam, startX, chunkWidth, diff, progress);
    return;
  }

  if (!initialEase && featureRoll < gapChance + kickerChance) {
    addKickerChunk(scene, state, cam, startX, chunkWidth, diff, progress);
    return;
  }

  addRollerChunk(scene, state, cam, startX, chunkWidth, diff, progress, initialEase);
}

function addRollerChunk(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  cam: Phaser.Cameras.Scene2D.Camera | undefined,
  startX: number,
  chunkWidth: number,
  diff: number,
  progress: number,
  initialEase: boolean,
): void {
  const height = 78 + Phaser.Math.Between(-6, 12) + Math.floor(diff * 6);
  const angleRange = (0.02 + 0.012 * diff) * (initialEase ? 0.5 : 0.85);
  const angle = Phaser.Math.FloatBetween(-angleRange, angleRange);
  const prevSurfaceY = state.lastSurfaceY ?? state.groundY;
  const targetBaseY = prevSurfaceY + height / 2 + Phaser.Math.Between(-4, 6);
  const maxSurfaceY = (scene.scale?.height ?? 540) - 60;
  const baseY = clampSurfaceY(targetBaseY, height, maxSurfaceY);
  const centerX = startX + chunkWidth / 2;
  const color = state.groundColors[(state.chunkIndex + 1) % state.groundColors.length];

  const groundPiece = addGround(scene, state, centerX, baseY, chunkWidth, height, angle, color, false);

  const hazardChance = initialEase ? 0 : Phaser.Math.Clamp(0.14 + diff * 0.05 + progress * 0.05, 0, 0.55);
  const downhill = angle < -0.005;
  const hazardAllowed = chunkWidth > 360 && (!downhill || Math.random() < 0.35);
  if (hazardAllowed && Math.random() < hazardChance) {
    const maxWidth = downhill ? 180 : 240;
    const hazardWidth = Phaser.Math.Between(120, maxWidth) + Math.floor(diff * (downhill ? 10 : 20));
    const hazardHeight = 38;
    const surfaceY = baseY - height / 2;
    const hazardCenter = startX + Phaser.Math.Between(Math.floor(chunkWidth * 0.32), Math.floor(chunkWidth * 0.74));

    const kickerWidth = 120;
    const kickerHeight = 60;
    const kickerSpacing = 10;
    const kickerCenter = hazardCenter - hazardWidth / 2 - kickerWidth / 2 - kickerSpacing;
    if (downhill && kickerCenter > startX + 48) {
      addMicroKicker(scene, state, kickerCenter, surfaceY, kickerWidth, kickerHeight, color);
    }

    addGround(scene, state, hazardCenter, baseY - 2, hazardWidth, hazardHeight, 0, 0xbe123c, true);
  }

  maybeAddSoftSand(scene, state, startX, chunkWidth, baseY, height, angle, diff, progress, initialEase);

  decorateChunk(scene, state, groundPiece, startX, chunkWidth, baseY, height, angle, initialEase);

  state.nextChunkX = startX + chunkWidth;
  state.chunkIndex += 1;
  const exitSurfaceY = baseY - height / 2 + Math.tan(angle) * (chunkWidth / 2);
  state.lastSurfaceY = Math.min(exitSurfaceY, maxSurfaceY);
  expandWorldBounds(scene, state, cam);
}

function addKickerChunk(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  cam: Phaser.Cameras.Scene2D.Camera | undefined,
  startX: number,
  chunkWidth: number,
  diff: number,
  progress: number,
): void {
  const rampUp = Math.random() < 0.55;
  const height = 84 + Phaser.Math.Between(-6, 10) + Math.floor(diff * 8);
  const prevSurfaceY = state.lastSurfaceY ?? state.groundY;
  const targetBaseY = prevSurfaceY + height / 2 + Phaser.Math.Between(-4, 6) + (rampUp ? 6 : -4);
  const maxSurfaceY = (scene.scale?.height ?? 540) - 60;
  const baseY = clampSurfaceY(targetBaseY, height, maxSurfaceY);
  const angleBase = rampUp ? 0.05 : -0.04;
  const angle = angleBase + Phaser.Math.FloatBetween(-0.008, 0.01) + diff * 0.006;
  const color = state.groundColors[(state.chunkIndex + 2) % state.groundColors.length];
  const centerX = startX + chunkWidth / 2;

  const piece = addGround(scene, state, centerX, baseY, chunkWidth, height, angle, color, false);

  const hazardChance = Phaser.Math.Clamp(0.18 + diff * 0.06 + progress * 0.08, 0, 0.72);
  if (rampUp && Math.random() < hazardChance) {
    const hazardWidth = Phaser.Math.Between(110, 200) + Math.floor(diff * 16);
    const hazardHeight = 36;
    const hazardCenter = startX + Phaser.Math.Between(Math.floor(chunkWidth * 0.45), Math.floor(chunkWidth * 0.9));
    addGround(scene, state, hazardCenter, baseY - 6, hazardWidth, hazardHeight, 0, 0xbe123c, true);
  }

  maybeAddSoftSand(scene, state, startX, chunkWidth, baseY, height, angle, diff, progress, false);

  decorateChunk(scene, state, piece, startX, chunkWidth, baseY, height, angle, false);

  state.nextChunkX = startX + chunkWidth;
  state.chunkIndex += 1;
  const exitSurfaceY = baseY - height / 2 + Math.tan(angle) * (chunkWidth / 2);
  state.lastSurfaceY = Math.min(exitSurfaceY, maxSurfaceY);
  expandWorldBounds(scene, state, cam);
}

function addGapChunk(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  cam: Phaser.Cameras.Scene2D.Camera | undefined,
  startX: number,
  chunkWidth: number,
  diff: number,
  progress: number,
): void {
  const leftWidth = Phaser.Math.Between(200, 320) + Math.floor(diff * 16);
  const rawGap = Phaser.Math.Between(70, 120) + Math.floor(diff * 8);
  const maxGap = Math.max(80, chunkWidth - leftWidth - 260);
  const gapWidth = Phaser.Math.Clamp(rawGap, 70, maxGap);
  const rightWidth = Math.max(220, chunkWidth - leftWidth - gapWidth);
  const height = 78 + Math.floor(diff * 6);
  const prevSurfaceY = state.lastSurfaceY ?? state.groundY;
  const targetBaseY = prevSurfaceY + height / 2 + Phaser.Math.Between(-6, 6);
  const maxSurfaceY = (scene.scale?.height ?? 540) - 60;
  const baseY = clampSurfaceY(targetBaseY, height, maxSurfaceY);
  const angleLeft = Phaser.Math.FloatBetween(-0.01, 0.012) + diff * 0.003;
  const angleRight = Phaser.Math.FloatBetween(-0.01, 0.012) - diff * 0.002;
  const color = state.groundColors[(state.chunkIndex + 3) % state.groundColors.length];

  const leftCenter = startX + leftWidth / 2;
  const rightCenter = startX + leftWidth + gapWidth + rightWidth / 2;

  const leftPiece = addGround(scene, state, leftCenter, baseY, leftWidth, height, angleLeft, color, false);
  const rightPiece = addGround(scene, state, rightCenter, baseY, rightWidth, height, angleRight, color, false);

  const hazardHeight = 44;
  const hazardY = baseY + 10;
  const hazardCenter = startX + leftWidth + gapWidth / 2;
  const hazard = addGround(scene, state, hazardCenter, hazardY, gapWidth, hazardHeight, 0, 0xbe123c, true);

  const markerLeft = scene.add.triangle(leftCenter + leftWidth / 2 - 16, baseY - height / 2 - 10, 0, 18, 12, 0, 24, 18, 0xf472b6, 0.95);
  const markerRight = scene.add.triangle(rightCenter - rightWidth / 2 + 16, baseY - height / 2 - 10, 0, 18, 12, 0, 24, 18, 0xf472b6, 0.95);
  markerLeft.setDepth(5);
  markerRight.setDepth(5);
  leftPiece.visuals.push(markerLeft);
  rightPiece.visuals.push(markerRight);

  const hazardWarn = scene.add.rectangle(hazardCenter, hazardY - hazardHeight / 2 - 8, gapWidth, 6, 0xfca5a5, 0.9).setDepth(5);
  hazard.visuals.push(hazardWarn);

  decorateChunk(scene, state, leftPiece, startX, leftWidth, baseY, height, angleLeft, false);
  decorateChunk(scene, state, rightPiece, startX + leftWidth + gapWidth, rightWidth, baseY, height, angleRight, false);

  state.nextChunkX = startX + leftWidth + gapWidth + rightWidth;
  state.chunkIndex += 1;
  const exitSurfaceY = baseY - height / 2 + Math.tan(angleRight) * (rightWidth / 2);
  state.lastSurfaceY = Math.min(exitSurfaceY, maxSurfaceY);
  expandWorldBounds(scene, state, cam);
}

function maybeAddSoftSand(
  scene: Phaser.Scene & { matter: Phaser.Physics.Matter.MatterPhysics },
  state: CourseState,
  startX: number,
  chunkWidth: number,
  baseY: number,
  height: number,
  angle: number,
  diff: number,
  progress: number,
  initialEase: boolean,
): void {
  const chance = initialEase ? 0.08 : Phaser.Math.Clamp(0.12 + diff * 0.08 + progress * 0.12, 0, 0.55);
  if (Math.random() > chance) return;

  const sandWidth = Phaser.Math.Clamp(Phaser.Math.Between(110, 180) + Math.floor(diff * 16), 90, chunkWidth * 0.65);
  const margin = 60;
  if (sandWidth > chunkWidth - margin * 2) return;
  const sandCenter = startX + Phaser.Math.Between(margin, Math.floor(chunkWidth - margin - sandWidth)) + sandWidth / 2;
  const sandHeight = 28;
  const sandY = baseY - height / 2 + sandHeight / 2 + 2;
  const sandColor = 0xd7b57a;
  const sandTop = 0xf5d399;

  addGround(scene, state, sandCenter, sandY, sandWidth, sandHeight, angle * 0.85, sandColor, false, 1.8, sandTop);
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

  addDecals(scene, visuals, startX, width, surfaceY, angle, initialEase);
}

function addDecals(
  scene: Phaser.Scene,
  visuals: Phaser.GameObjects.GameObject[],
  startX: number,
  width: number,
  surfaceY: number,
  angle: number,
  initialEase: boolean,
): void {
  const chance = initialEase ? 0.35 : 0.6;
  if (Math.random() > chance) return;

  const count = Phaser.Math.Between(2, initialEase ? 4 : 7);
  const depth = 5;
  for (let i = 0; i < count; i += 1) {
    const localX = Phaser.Math.FloatBetween(30, Math.max(40, width - 30));
    const x = startX + localX;
    const kind = Math.random();
    if (kind < 0.55) {
      const rock = scene.add.ellipse(x, surfaceY - Phaser.Math.Between(2, 6), Phaser.Math.Between(8, 16), Phaser.Math.Between(6, 12), 0x1f2937, 0.9).setDepth(depth);
      rock.setRotation(angle + Phaser.Math.FloatBetween(-0.08, 0.08));
      visuals.push(rock);
    } else {
      const tuft = scene.add.triangle(
        x,
        surfaceY - Phaser.Math.Between(4, 10),
        -6,
        8,
        6,
        8,
        0,
        -10,
        0x65a30d,
        0.92,
      ).setDepth(depth + 1);
      tuft.setRotation(angle + Phaser.Math.FloatBetween(-0.12, 0.12));
      visuals.push(tuft);
    }
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
