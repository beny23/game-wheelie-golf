import Phaser from "phaser";

const matter = (Phaser.Physics.Matter as any).Matter;
const { Body, Bodies, Vector } = matter;

type ThrottleState = {
  active: boolean;
  lastChange: number;
};

type StallMeter = {
  value: number;
  max: number;
  fillRate: number;
  drainRate: number;
};

type GroundPiece = {
  body: MatterJS.BodyType;
  visuals: Phaser.GameObjects.Rectangle[];
  isHazard: boolean;
  endX: number;
};

export class WheelieScene extends Phaser.Scene {
  private throttle: ThrottleState = { active: false, lastChange: 0 };

  private stall: StallMeter = { value: 0, max: 100, fillRate: 25, drainRate: 40 };

  private chassis?: MatterJS.BodyType;

  private rearWheel?: MatterJS.BodyType;

  private frontWheel?: MatterJS.BodyType;

  private chassisRect?: Phaser.GameObjects.Rectangle;

  private rearWheelCircle?: Phaser.GameObjects.Arc;

  private frontWheelCircle?: Phaser.GameObjects.Arc;

  private frontTouchIgnoreUntil = 0;

  private flipIgnoreUntil = 0;

  private frontContactStart = 0;

  private readonly frontContactThresholdMs = 250;

  private cam?: Phaser.Cameras.Scene2D.Camera;

  private speedText?: Phaser.GameObjects.Text;

  private failReasonText?: Phaser.GameObjects.Text;

  private lastFailReason = "";

  private angleText?: Phaser.GameObjects.Text;

  private followTarget?: Phaser.GameObjects.Zone;

  private readonly maxSpeed = 420; // px/s cap for chassis

  private hazardBodies: Set<number> = new Set();

  private statusText?: Phaser.GameObjects.Text;

  private stallText?: Phaser.GameObjects.Text;

  private gameOver = false;

  private groundCategory?: number;

  private group?: number;

  private groundPieces: GroundPiece[] = [];

  private nextChunkX = 0;

  private chunkIndex = 0;

  private readonly groundY = 440;

  private readonly groundColors = [0x3f2d20, 0x35251a, 0x2a1c13];

  private worldWidth = 4000;

  create(): void {
    this.groundCategory = this.matter.world.nextCategory();
    this.group = Body.nextGroup(true);

    this.setupInput();
    this.createBackground();
    this.createCourse();
    this.createCart();
    this.createHud();
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.gameOver) return;

    this.ensureCourseAhead();
    this.applyThrottle(dt);
    this.clampSpeed();
    this.updateStall(dt);
    this.checkFlip();
    this.checkFrontContact();
    this.stabilizePitch(dt);
    this.syncVisuals();
  }

  private setupInput(): void {
    this.input.keyboard?.addCapture("SPACE");
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") e.preventDefault();
    });

    this.input.keyboard?.on("keydown-SPACE", () => this.setThrottle(true));
    this.input.keyboard?.on("keyup-SPACE", () => this.setThrottle(false));

    this.input.on("pointerdown", () => this.setThrottle(true));
    this.input.on("pointerup", () => this.setThrottle(false));
  }

  private setThrottle(active: boolean): void {
    this.throttle = { active, lastChange: this.time.now };
  }

  private createBackground(): void {
    // Sky gradient
    const sky = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2, 0x0b1224)
      .setOrigin(0, 0)
      .setScrollFactor(0);
    sky.setFillStyle(0x0b1224, 1);

    // Parallax distant hills
    const hills = this.add.rectangle(0, this.scale.height * 0.55, this.scale.width * 3, 180, 0x0f172a, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0.35);

    // Midground strips for motion parallax
    for (let i = 0; i < 4; i += 1) {
      const band = this.add.rectangle(0, 80 + i * 60, this.scale.width * 3, 10, 0x0ea5e9, 0.12)
        .setOrigin(0, 0)
        .setScrollFactor(0.25 + i * 0.05);
      band.setDepth(-10 + i);
    }
  }

  private createCourse(): void {
    this.groundPieces = [];
    this.hazardBodies.clear();
    this.nextChunkX = 0;
    this.chunkIndex = 0;

    this.addStartLine();

    while (this.nextChunkX < 3000) {
      this.addProceduralChunk(true);
    }

    this.expandWorldBounds();
  }

  private addGround(
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
    color: number,
    isHazard = false,
  ): GroundPiece {
    const body = this.matter.add.rectangle(x, y, width, height, {
      isStatic: true,
      angle,
      chamfer: { radius: 8 },
      collisionFilter: { category: this.groundCategory },
      label: isHazard ? "hazard" : "ground",
      friction: 0.9,
      frictionStatic: 0.9,
    });

    const base = this.add.rectangle(x, y, width, height, color, isHazard ? 0.95 : 1);
    base.setRotation(angle);

    const topColor = isHazard ? 0xbe123c : 0x65a30d;
    const strip = this.add.rectangle(x, y - height / 2 + 6, width, 12, topColor, isHazard ? 0.95 : 1);
    strip.setRotation(angle);
    strip.setDepth(base.depth + 1);

    if (isHazard) {
      this.hazardBodies.add(body.id);
    }

    const piece: GroundPiece = { body, visuals: [base, strip], isHazard, endX: x + width / 2 };
    this.groundPieces.push(piece);
    return piece;
  }

  private addStartLine(): void {
    const y = this.groundY;
    this.add.rectangle(120, y - 60, 16, 160, 0xf8fafc, 0.8).setDepth(2);
    this.add.rectangle(120, y - 60, 6, 160, 0x0ea5e9, 0.95).setDepth(3);
    this.add.text(96, y - 140, "START", { fontSize: "20px", color: "#e2e8f0" }).setDepth(3);
  }

  private addProceduralChunk(initialEase = false): void {
    const startX = this.nextChunkX;
    const difficulty = initialEase ? 0.6 : Math.min(1 + this.chunkIndex * 0.08, 3.5);
    const chunkWidth = 760 + Phaser.Math.Between(-60, 120) + Math.min(this.chunkIndex * 6, 260);
    const height = 78 + Phaser.Math.Between(-6, 10);
    const angleRange = (0.018 + 0.01 * difficulty) * (initialEase ? 0.6 : 1);
    const angle = Phaser.Math.FloatBetween(-angleRange, angleRange);
    const centerX = startX + chunkWidth / 2;
    const baseY = this.groundY + Phaser.Math.Between(-6, 8);
    const color = this.groundColors[(this.chunkIndex + 1) % this.groundColors.length];

    this.addGround(centerX, baseY, chunkWidth, height, angle, color, false);

    const hazardChance = initialEase ? 0 : Math.min(0.12 + this.chunkIndex * 0.012, 0.38);
    if (Math.random() < hazardChance && chunkWidth > 360) {
      const hazardWidth = Phaser.Math.Between(140, 240);
      const hazardHeight = 36;
      const hazardCenter = startX + Phaser.Math.Between(Math.floor(chunkWidth * 0.35), Math.floor(chunkWidth * 0.78));
      this.addGround(hazardCenter, baseY - 2, hazardWidth, hazardHeight, 0, 0xbe123c, true);
    }

    this.nextChunkX += chunkWidth;
    this.chunkIndex += 1;
    this.expandWorldBounds();
  }

  private ensureCourseAhead(): void {
    if (!this.chassis) return;

    const needAhead = 2000;
    while (this.nextChunkX < this.chassis.position.x + needAhead) {
      this.addProceduralChunk(false);
    }

    this.cleanupCourse();
  }

  private cleanupCourse(): void {
    if (!this.chassis) return;
    const cutoff = this.chassis.position.x - 1600;
    const remaining: GroundPiece[] = [];

    for (const piece of this.groundPieces) {
      if (piece.endX < cutoff) {
        this.matter.world.remove(piece.body);
        piece.visuals.forEach((v) => v.destroy());
        if (piece.isHazard) this.hazardBodies.delete(piece.body.id);
      } else {
        remaining.push(piece);
      }
    }

    this.groundPieces = remaining;
  }

  private expandWorldBounds(): void {
    const targetWidth = Math.max(this.nextChunkX + 1200, this.worldWidth);
    this.worldWidth = targetWidth;

    this.matter.world.setBounds(0, 0, targetWidth, 540, 32, true, true, false, true);
    if (this.cam) {
      this.cam.setBounds(0, 0, targetWidth, 540);
    }
  }

  private createCart(): void {
    const startX = 200;
    const startY = 360;

    this.chassis = Bodies.rectangle(startX, startY, 160, 36, {
      chamfer: { radius: 12 },
      mass: 5,
      frictionAir: 0.006,
      friction: 0.7,
      collisionFilter: { group: this.group },
      label: "chassis",
    }) as MatterJS.BodyType;

    this.rearWheel = Bodies.circle(startX - 50, startY + 26, 28, {
      friction: 0.9,
      restitution: 0,
      frictionAir: 0.011,
      collisionFilter: { group: this.group },
      label: "rear-wheel",
    }) as MatterJS.BodyType;

    this.frontWheel = Bodies.circle(startX + 55, startY + 22, 18, {
      friction: 0.22,
      restitution: 0,
      frictionAir: 0.009,
      collisionFilter: { group: this.group },
      label: "front-wheel",
    }) as MatterJS.BodyType;

    this.matter.world.add([this.chassis, this.rearWheel, this.frontWheel]);

    // Single links per wheel with moderated damping to keep a cart-like stance
    this.matter.add.constraint(this.chassis, this.rearWheel, 10, 1, {
      pointA: { x: -52, y: 14 },
      pointB: { x: 0, y: 0 },
      damping: 0.62,
      stiffness: 0.98,
    });

    this.matter.add.constraint(this.chassis, this.frontWheel, 10, 1, {
      pointA: { x: 62, y: 14 },
      pointB: { x: 0, y: 0 },
      damping: 0.66,
      stiffness: 0.98,
    });

    // Shift center of mass slightly rearward to help wheelies
    Body.setCentre(this.chassis, { x: -16, y: 0 }, true);

    // Lift nose up at start to avoid instant front contact
    Body.setAngle(this.chassis, -0.1);
    Body.setAngle(this.rearWheel, -0.1);
    Body.setAngle(this.frontWheel, -0.1);
    Body.translate(this.frontWheel, { x: 0, y: -16 });

    // Give a gentle forward push to break static friction
    Body.applyForce(this.rearWheel, this.rearWheel.position, Vector.create(0.03, -0.001));

    this.frontTouchIgnoreUntil = this.time.now + 1200;
    this.flipIgnoreUntil = this.time.now + 1200;

    // Simple visuals for cart
    this.chassisRect = this.add.rectangle(startX, startY, 160, 36, 0x38bdf8, 0.95);
    this.chassisRect.setDepth(5);

    this.rearWheelCircle = this.add.circle(startX - 50, startY + 28, 28, 0x0ea5e9, 0.95);
    this.rearWheelCircle.setDepth(6);

    this.frontWheelCircle = this.add.circle(startX + 55, startY + 24, 22, 0x7dd3fc, 0.95);
    this.frontWheelCircle.setDepth(6);

    // Camera follow
    this.cam = this.cameras.main;
    this.cam.setZoom(1);
    this.followTarget = this.add.zone(startX, startY, 10, 10);
    this.cam.startFollow(this.followTarget, true, 0.18, 0.18);

    this.expandWorldBounds();

    this.registerCollisionHandlers();
  }

  private syncVisuals(): void {
    if (this.chassis && this.chassisRect) {
      this.chassisRect.setPosition(this.chassis.position.x, this.chassis.position.y);
      this.chassisRect.setRotation(this.chassis.angle);
    }
    if (this.rearWheel && this.rearWheelCircle) {
      this.rearWheelCircle.setPosition(this.rearWheel.position.x, this.rearWheel.position.y);
      this.rearWheelCircle.setRotation(this.rearWheel.angle);
    }
    if (this.frontWheel && this.frontWheelCircle) {
      this.frontWheelCircle.setPosition(this.frontWheel.position.x, this.frontWheel.position.y);
      this.frontWheelCircle.setRotation(this.frontWheel.angle);
    }

    if (this.chassis && this.followTarget) {
      this.followTarget.setPosition(this.chassis.position.x, this.chassis.position.y);
    }

    if (this.chassis && this.speedText) {
      const v = this.chassis.velocity;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y) * 60; // px/s approx
      this.speedText.setText(`Speed: ${speed.toFixed(0)}`);
    }

    if (this.chassis && this.angleText) {
      const deg = Phaser.Math.RadToDeg(this.chassis.angle % (Math.PI * 2));
      const normalized = ((deg % 360) + 360) % 360; // 0-360
      this.angleText.setText(`Angle: ${normalized.toFixed(1)}°`);
    }
  }

  private registerCollisionHandlers(): void {
    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      if (!this.frontWheel || this.gameOver) return;
      if (this.time.now < this.frontTouchIgnoreUntil) return;

      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesFront = bodies.some((b) => b.id === this.frontWheel?.id);
        if (!involvesFront) continue;

        const other = bodies.find((b) => b.id !== this.frontWheel?.id);
        if (!other) continue;

        const isGround = other.label === "ground";
        const isHazard = other.label === "hazard" || this.hazardBodies.has(other.id);
        if (isHazard) {
          this.triggerFail("Front wheel touched down — boom!");
          return;
        }

        if (isGround) {
          this.frontContactStart = this.time.now;
        }
      }
    });

    this.matter.world.on("collisionend", (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => {
      if (!this.frontWheel || this.gameOver) return;
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesFront = bodies.some((b) => b.id === this.frontWheel?.id);
        if (!involvesFront) continue;
        this.frontContactStart = 0;
      }
    });

    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      if (!this.chassis || this.gameOver) return;
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesChassis = bodies.some((b) => b.id === this.chassis?.id);
        if (!involvesChassis) continue;

        const other = bodies.find((b) => b.id !== this.chassis?.id);
        if (!other) continue;

        const isHazard = other.label === "hazard" || this.hazardBodies.has(other.id);
        const isGround = other.label === "ground";

        if (isHazard) {
          this.triggerFail("Hit hazard — boom!");
          return;
        }

        if (isGround) {
          const deg = this.normalizeAngleDeg(this.chassis.angle);
          const upsideDown = deg > 150 && deg < 330;
          if (upsideDown) {
            this.triggerFail("Landed on roof — flipped!");
            return;
          }
        }
      }
    });
  }

  private applyThrottle(dt: number): void {
    if (!this.rearWheel || !this.chassis) return;

    const torque = this.throttle.active ? 0.0039 : 0;

    if (torque > 0) {
      Body.applyForce(
        this.rearWheel,
        this.rearWheel.position,
        Vector.create(torque * 9.5, -torque * 0.78),
      );

      Body.applyForce(
        this.chassis,
        this.chassis.position,
        Vector.create(torque * 7.0, -torque * 0.2),
      );

      // Apply a small upward force at the rear of the chassis to create lift/back-rotation
      Body.applyForce(
        this.chassis,
        { x: this.chassis.position.x - 50, y: this.chassis.position.y + 10 },
        Vector.create(0, -torque * 0.85),
      );

      Body.setAngularVelocity(this.rearWheel, Phaser.Math.Clamp(this.rearWheel.angularVelocity + 0.05, -8.5, 10.5));
    }
  }

  private updateStall(dt: number): void {
    const change = this.throttle.active ? -this.stall.drainRate : this.stall.fillRate;
    this.stall.value = Phaser.Math.Clamp(this.stall.value + change * dt, 0, this.stall.max);

    this.stallText?.setText(`Stall: ${this.stall.value.toFixed(0)} / ${this.stall.max}`);

    if (this.stall.value >= this.stall.max) {
      this.triggerFail("Stalled out — exploded!");
    }
  }

  private checkFlip(): void {
    // Flip is now detected via chassis collision with ground when upside-down, not by pure angle.
  }

  private checkFrontContact(): void {
    if (!this.frontContactStart || this.gameOver) return;
    const elapsed = this.time.now - this.frontContactStart;
    if (elapsed >= this.frontContactThresholdMs) {
      this.triggerFail("Front wheel touched down — boom!");
    }
  }

  private stabilizePitch(dt: number): void {
    if (!this.chassis) return;
    // Allow flips: lighter stabilization so sustained throttle can rotate the cart.
    const damped = this.chassis.angularVelocity * 0.97;
    const correction = -this.chassis.angle * 0.12;
    const target = damped + correction * dt * 2.5;
    const clamped = Phaser.Math.Clamp(target, -1.2, 1.2);
    Body.setAngularVelocity(this.chassis, clamped);
  }

  private clampSpeed(): void {
    if (!this.chassis) return;
    const v = this.chassis.velocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y) * 60;
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      Body.setVelocity(this.chassis, { x: v.x * scale, y: v.y * scale });
    }
  }

  private createHud(): void {
    this.statusText = this.add.text(16, 16, "Hold space/click/touch to throttle", {
      fontSize: "18px",
      color: "#e2e8f0",
    }).setScrollFactor(0);

    this.stallText = this.add.text(16, 42, "Stall: 0", {
      fontSize: "16px",
      color: "#cbd5f5",
    }).setScrollFactor(0);

    this.speedText = this.add.text(16, 64, "Speed: 0", {
      fontSize: "16px",
      color: "#a5f3fc",
    }).setScrollFactor(0);

    this.failReasonText = this.add.text(16, 86, "Last fail: -", {
      fontSize: "14px",
      color: "#fca5a5",
    }).setScrollFactor(0);

    this.angleText = this.add.text(16, 106, "Angle: 0°", {
      fontSize: "14px",
      color: "#bbf7d0",
    }).setScrollFactor(0);
  }

  private triggerFail(reason: string): void {
    if (this.gameOver) return;
    this.gameOver = true;

    this.lastFailReason = reason;
    this.failReasonText?.setText(`Last fail: ${reason}`);
    console.warn("Fail reason:", reason);

    this.addRectangleFlash();

    const cx = this.cameras.main.midPoint.x;
    const cy = this.cameras.main.midPoint.y - 60;
    this.add.text(cx, cy, `Failed: ${reason}\nPress space/click to retry`, {
      fontSize: "22px",
      color: "#f472b6",
      align: "center",
      backgroundColor: "#0b1224",
      padding: { x: 10, y: 8 },
    })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.time.delayedCall(200, () => {
      this.input.once("pointerdown", () => this.scene.restart());
      this.input.keyboard?.once("keydown-SPACE", () => this.scene.restart());
    });
  }

  private addRectangleFlash(): void {
    const cam = this.cameras.main;
    const flash = this.add.rectangle(cam.midPoint.x, cam.midPoint.y, cam.width, cam.height, 0xf43f5e, 0.25);
    flash.setScrollFactor(0);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
  }

  private normalizeAngleDeg(rad: number): number {
    const deg = Phaser.Math.RadToDeg(rad % (Math.PI * 2));
    return ((deg % 360) + 360) % 360;
  }
}
