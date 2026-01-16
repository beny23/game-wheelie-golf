import Phaser from "phaser";
import { Cart, createCart, syncCartVisuals } from "./cart";
import { CourseState, createCourse, ensureCourseAhead } from "./course";

const matter = (Phaser.Physics.Matter as any).Matter;
const { Body, Vector } = matter;

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

type ParallaxProp = {
  items: Phaser.GameObjects.GameObject[];
  factor: number;
  baseX: number;
  span: number;
  drift: number;
  bobAmplitude?: number;
  bobSpeed?: number;
  bobPhase?: number;
};

export class WheelieScene extends Phaser.Scene {
  private throttle: ThrottleState = { active: false, lastChange: 0 };

  private stall: StallMeter = { value: 0, max: 100, fillRate: 25, drainRate: 40 };

  private cart?: Cart;

  private course?: CourseState;

  private frontTouchIgnoreUntil = 0;

  private flipIgnoreUntil = 0;

  private frontContactStart = 0;

  private readonly frontContactThresholdMs = 120;

  private cam?: Phaser.Cameras.Scene2D.Camera;

  private speedText?: Phaser.GameObjects.Text;


  private angleText?: Phaser.GameObjects.Text;

  private readonly maxSpeed = 420; // px/s cap for chassis

  private statusText?: Phaser.GameObjects.Text;

  private distanceText?: Phaser.GameObjects.Text;

  private bestText?: Phaser.GameObjects.Text;

  private dailyText?: Phaser.GameObjects.Text;

  private sessionText?: Phaser.GameObjects.Text;

  private skyLayer?: Phaser.GameObjects.Rectangle;

  private hillLayers: Phaser.GameObjects.Rectangle[] = [];

  private hazeBands: Phaser.GameObjects.Rectangle[] = [];

  private clouds: Phaser.GameObjects.Ellipse[] = [];

  private parallaxProps: ParallaxProp[] = [];

  private rearGrounded = false;

  private lastTrailTime = 0;

  private lastDustTime = 0;

  private lastSparkTime = 0;

  private milestoneInterval = 250;

  private nextMilestone = 250;

  private sessionBest = 0;

  private dailyBest = 0;

  private ghostMarker?: Phaser.GameObjects.Arc;

  private readonly dailyBestStorageKey = "wheelie-daily-best";

  private gameOver = false;

  private groundCategory?: number;

  private group?: number;

  private startX = 0;

  private bestDistance = 0;

  private readonly bestStorageKey = "wheelie-best-distance";

  create(): void {
    this.groundCategory = this.matter.world.nextCategory();
    this.group = Body.nextGroup(true);

    this.bestDistance = this.loadBestDistance();
    this.dailyBest = this.loadDailyBest();
    this.sessionBest = 0;

    this.setupInput();
    this.createBackground();
    this.createCourse();
    this.createCart();
    this.createHud();
      this.createGhostMarker();
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    const dt = delta / 1000;

    this.ensureCourseAhead();
    this.applyThrottle(dt);
    this.clampSpeed();
    this.updateStall(dt);
    this.checkFrontContact();
    this.stabilizePitch(dt);
    this.syncVisuals();
    this.updateParallaxElements(dt);
  }

  private setupInput(): void {
    this.input.keyboard?.addCapture("SPACE");

    this.input.keyboard?.on("keydown-SPACE", () => this.setThrottle(true));
    this.input.keyboard?.on("keyup-SPACE", () => this.setThrottle(false));

    this.input.on("pointerdown", () => this.setThrottle(true));
    this.input.on("pointerup", () => this.setThrottle(false));
  }

  private setThrottle(active: boolean): void {
    this.throttle = { active, lastChange: this.time.now };
  }

  private createBackground(): void {
    this.skyLayer = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2, 0x0b1224)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20);

    const hillConfigs = [
      { y: this.scale.height * 0.62, h: 220, color: 0x0f172a, factor: 0.28, depth: -12 },
      { y: this.scale.height * 0.68, h: 180, color: 0x13203a, factor: 0.36, depth: -11 },
      { y: this.scale.height * 0.74, h: 140, color: 0x1a2c4a, factor: 0.45, depth: -10 },
    ];

    this.hillLayers = hillConfigs.map((cfg) => {
      return this.add.rectangle(0, cfg.y, this.scale.width * 3.5, cfg.h, cfg.color, 1)
        .setOrigin(0, 0)
        .setScrollFactor(cfg.factor)
        .setDepth(cfg.depth);
    });

    this.hazeBands = [];
    for (let i = 0; i < 4; i += 1) {
      const band = this.add.rectangle(0, 60 + i * 70, this.scale.width * 3.4, 14, 0x38bdf8, 0.14)
        .setOrigin(0, 0)
        .setScrollFactor(0.22 + i * 0.06)
        .setDepth(-9 + i);
      this.hazeBands.push(band);
    }

    this.spawnClouds();
    this.spawnParallaxProps();
  }

  private createCourse(): void {
    if (!this.groundCategory) this.groundCategory = this.matter.world.nextCategory();
    this.cam = this.cameras.main;
    this.course = createCourse(this, this.groundCategory, this.cam);
  }

  private ensureCourseAhead(): void {
    if (!this.course || !this.cart?.chassis) return;
    ensureCourseAhead(this, this.course, this.cart.chassis.position.x, this.cam);
  }

  private createCart(): void {
    const startX = 200;
    const startY = 360;

    const group = this.group ?? Body.nextGroup(true);
    this.group = group;
    this.cart = createCart(this, group, startX, startY);
    this.startX = startX;

    this.frontTouchIgnoreUntil = this.time.now + 1200;
    this.flipIgnoreUntil = this.time.now + 1200;

    this.cam = this.cameras.main;
    this.cam.setZoom(1);
    this.cam.startFollow(this.cart.followTarget, true, 0.18, 0.18);
    if (this.course) {
      this.cam.setBounds(0, 0, this.course.worldWidth, 540);
    }

    this.registerCollisionHandlers();
  }

  private syncVisuals(): void {
    if (this.cart) {
      syncCartVisuals(this.cart);
    }

    if (this.cart?.chassis && this.speedText) {
      const v = this.cart.chassis.velocity;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y) * 60; // px/s approx
      this.speedText.setText(`Speed: ${speed.toFixed(0)}`);
      this.maybeSpawnWheelTrail(speed);
    }

    if (this.cart?.chassis && this.distanceText) {
      const dx = Math.max(0, this.cart.chassis.position.x - this.startX);
      const meters = dx / 100;
      this.distanceText.setText(`Distance: ${meters.toFixed(1)} m`);
      this.updateBestDistance(meters);
      this.updateBackdrop(meters);
      this.checkMilestones(meters);
      this.updateGhostPosition();
    }

    if (this.cart?.chassis && this.angleText) {
      const deg = Phaser.Math.RadToDeg(this.cart.chassis.angle % (Math.PI * 2));
      const normalized = ((deg % 360) + 360) % 360; // 0-360
      this.angleText.setText(`Angle: ${normalized.toFixed(1)}°`);
    }
  }

  private maybeSpawnWheelTrail(speed: number): void {
    if (!this.cart?.rearWheel) return;
    if (!this.rearGrounded) return;
    if (speed < 240) return;
    if (this.time.now - this.lastTrailTime < 90) return;
    this.lastTrailTime = this.time.now;

    const w = this.cart.rearWheel.position;
    const trail = this.add.rectangle(w.x - 6, w.y + 22, 22, 6, 0x0ea5e9, 0.22).setDepth(3);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scaleX: 0.6,
      scaleY: 0.5,
      duration: 260,
      onComplete: () => trail.destroy(),
    });
  }

  private spawnDustIfHardLanding(pos: Phaser.Types.Math.Vector2Like, verticalVelocity: number): void {
    const impact = Math.abs(verticalVelocity);
    if (impact < 2.6) return;
    if (this.time.now - this.lastDustTime < 140) return;
    this.lastDustTime = this.time.now;

    const count = Phaser.Math.Clamp(3 + Math.floor(impact * 0.6), 3, 7);
    for (let i = 0; i < count; i += 1) {
      const dx = Phaser.Math.FloatBetween(-10, 10);
      const dy = Phaser.Math.FloatBetween(-12, -4);
      const puff = this.add.circle(pos.x + dx, pos.y + 6, Phaser.Math.Between(6, 10), 0xe5e7eb, 0.4).setDepth(2);
      const sway = Phaser.Math.FloatBetween(-12, 12);
      this.tweens.add({
        targets: puff,
        x: puff.x + sway,
        y: puff.y + dy,
        alpha: 0,
        scale: 1.4,
        duration: Phaser.Math.Between(260, 420),
        onComplete: () => puff.destroy(),
      });
    }
  }

  private spawnSparksIfScrape(): void {
    if (!this.cart?.chassis) return;
    if (this.time.now - this.lastSparkTime < 200) return;
    const av = Math.abs(this.cart.chassis.angularVelocity);
    const vy = this.cart.chassis.velocity.y;
    if (av < 0.9 || vy < 0.5) return;
    this.lastSparkTime = this.time.now;

    const baseX = this.cart.chassis.position.x - 52;
    const baseY = this.cart.chassis.position.y + 18;
    const sparks = Phaser.Math.Between(4, 6);
    for (let i = 0; i < sparks; i += 1) {
      const dirX = Phaser.Math.FloatBetween(-1.2, 0.4);
      const dirY = Phaser.Math.FloatBetween(-1.4, -0.2);
      const spark = this.add.triangle(baseX, baseY, 0, 0, 8, 3, 0, 6, 0xfcd34d, 0.9).setDepth(6);
      this.tweens.add({
        targets: spark,
        x: spark.x + dirX * 32,
        y: spark.y + dirY * 28,
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-0.8, 0.8),
        duration: Phaser.Math.Between(180, 260),
        onComplete: () => spark.destroy(),
      });
    }
  }

  private parallaxWorldX(screenX: number, factor: number): number {
    const camX = this.cameras.main?.scrollX ?? 0;
    return camX * factor + screenX;
  }

  private screenXFromWorldX(worldX: number, factor: number): number {
    const camX = this.cameras.main?.scrollX ?? 0;
    return worldX - camX * factor;
  }

  private updateParallaxElements(dt: number): void {
    const cam = this.cameras.main;
    if (!cam) return;
    const width = this.scale.width;

    // Clouds: position from baseX and wrap baseX when out of band.
    const cloudSpan = width * 1.6;
    for (const cloud of this.clouds) {
      const factor = cloud.scrollFactorX ?? 0.14;
      let baseX = (cloud.getData("baseX") as number) ?? 0;
      baseX -= 10 * dt; // slow left drift
      if (baseX < -width * 0.4) baseX += cloudSpan;
      if (baseX > width * 1.2) baseX -= cloudSpan;
      cloud.setData("baseX", baseX);
      cloud.x = this.parallaxWorldX(baseX, factor);
    }

    // Horizon and sky props with drift and optional bob.
    for (const prop of this.parallaxProps) {
      prop.baseX += prop.drift * dt;
      if (prop.baseX < -width * 0.6) prop.baseX += prop.span;
      if (prop.baseX > width * 1.4) prop.baseX -= prop.span;

      const targetX = this.parallaxWorldX(prop.baseX, prop.factor);
      const current = (prop.items[0] as Phaser.GameObjects.Shape | undefined)?.x ?? targetX;
      const dx = targetX - current;

      const bob =
        prop.bobAmplitude && prop.bobSpeed
          ? Math.sin((this.time.now / 1000) * prop.bobSpeed + (prop.bobPhase ?? 0)) * prop.bobAmplitude
          : 0;

      prop.items.forEach((item) => {
        const shape = item as Phaser.GameObjects.Shape;
        shape.x += dx;
        const baseY = shape.getData("baseY") as number | undefined;
        if (baseY !== undefined) {
          shape.y = baseY + bob;
        }
      });
    }
  }

  private registerCollisionHandlers(): void {
    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      if (!this.cart?.frontWheel || this.gameOver) return;
      if (this.time.now < this.frontTouchIgnoreUntil) return;

      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesFront = bodies.some((b) => b.id === this.cart?.frontWheel?.id);
        if (!involvesFront) continue;

        const other = bodies.find((b) => b.id !== this.cart?.frontWheel?.id);
        if (!other) continue;

        const isGround = other.label === "ground";
        const isHazard = other.label === "hazard" || this.course?.hazardBodies.has(other.id);
        if (isHazard) {
          this.triggerFail("Front wheel touched down — boom!");
          return;
        }

        if (isGround) {
          this.frontContactStart = this.time.now;
        }
      }
    });

    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      if (!this.cart?.rearWheel || this.gameOver) return;

      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesRear = bodies.some((b) => b.id === this.cart?.rearWheel?.id);
        if (!involvesRear) continue;

        const other = bodies.find((b) => b.id !== this.cart?.rearWheel?.id);
        if (!other) continue;

        const isGround = other.label === "ground";
        const isHazard = other.label === "hazard" || this.course?.hazardBodies.has(other.id);

        if (isHazard) {
          this.triggerFail("Hit hazard — boom!");
          return;
        }

        if (isGround) {
          this.rearGrounded = true;
          this.spawnDustIfHardLanding(this.cart.rearWheel.position, this.cart.rearWheel.velocity.y);
        }
      }
    });

    this.matter.world.on("collisionend", (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => {
      if (!this.cart?.rearWheel || this.gameOver) return;
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesRear = bodies.some((b) => b.id === this.cart?.rearWheel?.id);
        if (!involvesRear) continue;
        this.rearGrounded = false;
      }
    });

    this.matter.world.on("collisionend", (event: Phaser.Physics.Matter.Events.CollisionEndEvent) => {
      if (!this.cart?.frontWheel || this.gameOver) return;
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesFront = bodies.some((b) => b.id === this.cart?.frontWheel?.id);
        if (!involvesFront) continue;
        this.frontContactStart = 0;
      }
    });

    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      if (!this.cart?.chassis || this.gameOver) return;
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const involvesChassis = bodies.some((b) => b.id === this.cart?.chassis?.id);
        if (!involvesChassis) continue;

        const other = bodies.find((b) => b.id !== this.cart?.chassis?.id);
        if (!other) continue;

        const isHazard = other.label === "hazard" || this.course?.hazardBodies.has(other.id);
        const isGround = other.label === "ground";

        if (isHazard) {
          this.triggerFail("Hit hazard — boom!");
          return;
        }

        if (isGround) {
          this.spawnSparksIfScrape();
          const deg = this.normalizeAngleDeg(this.cart.chassis.angle);
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
    if (!this.cart?.rearWheel || !this.cart?.chassis) return;

    const torque = this.throttle.active ? 0.0039 : 0;

    if (torque > 0) {
      Body.applyForce(
        this.cart.rearWheel,
        this.cart.rearWheel.position,
        Vector.create(torque * 9.5, -torque * 0.78),
      );

      Body.applyForce(
        this.cart.chassis,
        this.cart.chassis.position,
        Vector.create(torque * 7.0, -torque * 0.2),
      );

      Body.applyForce(
        this.cart.chassis,
        { x: this.cart.chassis.position.x - 50, y: this.cart.chassis.position.y + 10 },
        Vector.create(0, -torque * 0.85),
      );

      Body.setAngularVelocity(
        this.cart.rearWheel,
        Phaser.Math.Clamp(this.cart.rearWheel.angularVelocity + 0.05, -8.5, 10.5),
      );
    }
  }

  private updateStall(dt: number): void {
    const change = this.throttle.active ? -this.stall.drainRate : this.stall.fillRate;
    this.stall.value = Phaser.Math.Clamp(this.stall.value + change * dt, 0, this.stall.max);

    if (this.stall.value >= this.stall.max) {
      this.triggerFail("Stalled out — exploded!");
    }
  }

  private checkFrontContact(): void {
    if (!this.frontContactStart || this.gameOver) return;
    const elapsed = this.time.now - this.frontContactStart;
    if (elapsed >= this.frontContactThresholdMs) {
      this.triggerFail("Front wheel touched down — boom!");
    }
  }

  private stabilizePitch(dt: number): void {
    if (!this.cart?.chassis) return;
    const damped = this.cart.chassis.angularVelocity * 0.97;
    const correction = -this.cart.chassis.angle * 0.12;
    const target = damped + correction * dt * 2.5;
    const clamped = Phaser.Math.Clamp(target, -1.2, 1.2);
    Body.setAngularVelocity(this.cart.chassis, clamped);
  }

  private clampSpeed(): void {
    if (!this.cart?.chassis) return;
    const v = this.cart.chassis.velocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y) * 60;
    if (speed > this.maxSpeed) {
      const scale = this.maxSpeed / speed;
      Body.setVelocity(this.cart.chassis, { x: v.x * scale, y: v.y * scale });
    }
  }

  private createHud(): void {
    const card1 = this.add.rectangle(12, 10, 190, 64, 0x0b1224, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(1, 0x38bdf8, 0.35);

    const card2 = this.add.rectangle(12, 84, 210, 74, 0x0b1224, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(1, 0xfef3c7, 0.35);

    const iconSpeed = this.add.triangle(24, 28, 0, 0, 12, 6, 0, 12, 0x38bdf8, 0.95).setScrollFactor(0);
    iconSpeed.setRotation(Phaser.Math.DegToRad(90));
    this.statusText = this.add.text(40, 16, "Hold space/click/touch to throttle", {
      fontSize: "16px",
      color: "#e2e8f0",
    }).setScrollFactor(0);

    this.speedText = this.add.text(40, 34, "Speed: 0", {
      fontSize: "16px",
      color: "#a5f3fc",
    }).setScrollFactor(0);

    const iconDistance = this.add.rectangle(24, 60, 10, 14, 0xfef08a, 0.95).setScrollFactor(0);
    this.distanceText = this.add.text(40, 54, "Distance: 0 m", {
      fontSize: "16px",
      color: "#fef08a",
    }).setScrollFactor(0);

    const iconBest = this.add.star(24, 98, 5, 5, 10, 0xfde68a, 0.9).setScrollFactor(0);
    this.bestText = this.add.text(40, 90, `Best: ${this.bestDistance.toFixed(1)} m`, {
      fontSize: "14px",
      color: "#fde68a",
    }).setScrollFactor(0);

    const iconDaily = this.add.circle(24, 114, 6, 0xf59e0b, 0.9).setScrollFactor(0);
    this.dailyText = this.add.text(40, 108, `Today: ${this.dailyBest.toFixed(1)} m`, {
      fontSize: "14px",
      color: "#fcd34d",
    }).setScrollFactor(0);

    const iconSession = this.add.rectangle(24, 132, 10, 10, 0x38bdf8, 0.9).setScrollFactor(0);
    this.sessionText = this.add.text(40, 126, `Session: ${this.sessionBest.toFixed(1)} m`, {
      fontSize: "14px",
      color: "#bae6fd",
    }).setScrollFactor(0);

    this.angleText = this.add.text(40, 144, "Angle: 0°", {
      fontSize: "14px",
      color: "#bbf7d0",
    }).setScrollFactor(0);

    [card1, card2, iconSpeed, iconDistance, iconBest, iconDaily, iconSession].forEach((obj) => obj.setDepth(20));
    [this.statusText, this.speedText, this.distanceText, this.bestText, this.dailyText, this.sessionText, this.angleText].forEach((obj) => obj?.setDepth(21));
  }

  private updateBackdrop(distanceMeters: number): void {
    const t = Phaser.Math.Clamp(distanceMeters / 800, 0, 1);
    const steps = 100;
    const skyColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(0x0b1224),
      Phaser.Display.Color.IntegerToColor(0x1a1230),
      steps,
      t * steps,
    );
    const skyHex = Phaser.Display.Color.GetColor(skyColor.r, skyColor.g, skyColor.b);
    this.skyLayer?.setFillStyle(skyHex, 1);

    const hillStart = [0x0f172a, 0x13203a, 0x1a2c4a];
    const hillEnd = [0x1a1d3a, 0x20284a, 0x28375c];
    this.hillLayers.forEach((hill, idx) => {
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(hillStart[idx] ?? hillStart[0]),
        Phaser.Display.Color.IntegerToColor(hillEnd[idx] ?? hillEnd[0]),
        steps,
        t * steps,
      );
      hill.setFillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
    });

    this.hazeBands.forEach((band, i) => {
      const opacity = 0.12 + i * 0.02 + t * 0.06;
      band.setFillStyle(0x38bdf8, opacity);
    });
  }

  private spawnClouds(): void {
    const colors = [0xe2e8f0, 0xcbd5e1, 0xbdd7f2];
    this.clouds = [];
    for (let i = 0; i < 6; i += 1) {
      const w = Phaser.Math.Between(80, 140);
      const h = Phaser.Math.Between(28, 44);
      const screenX = Phaser.Math.Between(Math.floor(-this.scale.width * 0.2), Math.floor(this.scale.width * 1.2));
      const x = this.parallaxWorldX(screenX, 0.14);
      const y = Phaser.Math.Between(40, 180);
      const color = colors[i % colors.length];
      const cloud = this.add.ellipse(x, y, w, h, color, 0.24).setScrollFactor(0.14).setDepth(-17);
      cloud.setData("baseX", screenX);
      this.clouds.push(cloud);
    }
  }

  private spawnParallaxProps(): void {
    this.parallaxProps = [];

    const width = this.scale.width;
    const horizonY = this.scale.height * 0.78;
    const positions = Array.from({ length: 7 }, (_v, i) => -140 + i * width * 0.42 + Phaser.Math.Between(-80, 80));

    const addProp = (
      items: Phaser.GameObjects.GameObject[],
      factor: number,
      baseX: number,
      span: number,
      drift: number,
      bobAmplitude?: number,
      bobSpeed?: number,
    ): void => {
      items.forEach((item) => {
        const shape = item as Phaser.GameObjects.Shape;
        shape.setScrollFactor(factor);
        shape.setData("baseY", shape.y);
      });

      this.parallaxProps.push({
        items,
        factor,
        baseX,
        span,
        drift,
        bobAmplitude,
        bobSpeed,
        bobPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
    };

    const spawnWindmill = (screenX: number, idx: number): void => {
      const factor = 0.32;
      const x = this.parallaxWorldX(screenX, factor);
      const mast = this.add.rectangle(x, horizonY, 10, 140, 0x0f172a, 0.55).setDepth(-8);
      const hub = this.add.circle(x, horizonY - 60, 8, 0x475569, 0.6).setDepth(-7);
      const blade = this.add.rectangle(x, horizonY - 60, 6, 90, 0xcbd5e1, 0.55).setDepth(-7);
      this.tweens.add({ targets: blade, angle: 360, duration: 4200 + idx * 260, repeat: -1 });
      addProp([mast, hub, blade], factor, screenX, width * 1.8, -14);
    };

    const spawnRadioTower = (screenX: number): void => {
      const factor = 0.3;
      const x = this.parallaxWorldX(screenX, factor);
      const tower = this.add.rectangle(x, horizonY - 6, 12, 160, 0x13203a, 0.65).setDepth(-8);
      const cross1 = this.add.rectangle(x, horizonY - 40, 80, 4, 0x1f2937, 0.4).setDepth(-8);
      const cross2 = this.add.rectangle(x, horizonY - 80, 70, 4, 0x1f2937, 0.4).setDepth(-8);
      const beacon = this.add.circle(x, horizonY - 86, 6, 0xf472b6, 0.8).setDepth(-7);
      this.tweens.add({ targets: beacon, alpha: 0.2, duration: 900, yoyo: true, repeat: -1 });
      addProp([tower, cross1, cross2, beacon], factor, screenX, width * 1.7, -12);
    };

    const spawnWaterTower = (screenX: number): void => {
      const factor = 0.31;
      const x = this.parallaxWorldX(screenX, factor);
      const legs = [
        this.add.rectangle(x - 18, horizonY + 6, 6, 120, 0x0f172a, 0.55),
        this.add.rectangle(x + 18, horizonY + 6, 6, 120, 0x0f172a, 0.55),
      ];
      const tank = this.add.circle(x, horizonY - 32, 32, 0x1f2937, 0.7).setDepth(-7);
      const band = this.add.rectangle(x, horizonY - 32, 64, 10, 0x38bdf8, 0.5).setDepth(-7);
      addProp([...legs, tank, band], factor, screenX, width * 1.6, -11);
    };

    const spawnConstructionCrane = (screenX: number): void => {
      const factor = 0.34;
      const x = this.parallaxWorldX(screenX, factor);
      const mast = this.add.rectangle(x, horizonY, 14, 170, 0x1a2c4a, 0.65).setDepth(-8);
      const boom = this.add.rectangle(x + 70, horizonY - 90, 160, 12, 0xfbbf24, 0.55).setDepth(-8);
      const counter = this.add.rectangle(x - 28, horizonY - 90, 46, 28, 0xf59e0b, 0.7).setDepth(-7);
      const cable = this.add.rectangle(x + 122, horizonY - 44, 4, 90, 0x94a3b8, 0.5).setDepth(-7);
      const hook = this.add.rectangle(x + 122, horizonY + 6, 14, 16, 0x0f172a, 0.8).setDepth(-7);
      addProp([mast, boom, counter, cable, hook], factor, screenX, width * 1.8, -10);
    };

    const spawnBlimp = (screenX: number): void => {
      const factor = 0.2;
      const y = Phaser.Math.Between(110, 180);
      const x = this.parallaxWorldX(screenX, factor);
      const body = this.add.ellipse(x, y, 180, 64, 0xcbd5e1, 0.4).setDepth(-16);
      const stripe = this.add.rectangle(x, y, 120, 12, 0x38bdf8, 0.55).setDepth(-15);
      const tail = this.add.triangle(x - 82, y, x - 110, y - 14, x - 110, y + 14, x - 82, y, 0x94a3b8, 0.6).setDepth(-15);
      const cabin = this.add.rectangle(x + 30, y + 18, 36, 12, 0x0f172a, 0.7).setDepth(-14);
      addProp([body, stripe, tail, cabin], factor, screenX, width * 1.6, -8, 5, 1.4);
    };

    const spawnHotAirBalloon = (screenX: number): void => {
      const factor = 0.18;
      const y = Phaser.Math.Between(90, 160);
      const x = this.parallaxWorldX(screenX, factor);
      const fill = Phaser.Math.RND.pick([0xf472b6, 0x38bdf8, 0xfbbf24]);
      const envelope = this.add.ellipse(x, y, 90, 110, fill, 0.55).setDepth(-17);
      const band = this.add.rectangle(x, y + 10, 80, 14, 0xf1f5f9, 0.5).setDepth(-16);
      const lines = this.add.rectangle(x, y + 60, 2, 42, 0x0f172a, 0.5).setDepth(-15);
      const basket = this.add.rectangle(x, y + 84, 36, 16, 0x1f2937, 0.8).setDepth(-15);
      addProp([envelope, band, lines, basket], factor, screenX, width * 1.5, -7, 6, 1.8);
    };

    positions.forEach((screenX, idx) => {
      const choice = Phaser.Math.RND.pick([
        "windmill",
        "radio",
        "water",
        "crane",
        "blimp",
        "balloon",
      ]);

      switch (choice) {
        case "windmill":
          spawnWindmill(screenX, idx);
          break;
        case "radio":
          spawnRadioTower(screenX);
          break;
        case "water":
          spawnWaterTower(screenX);
          break;
        case "crane":
          spawnConstructionCrane(screenX);
          break;
        case "blimp":
          spawnBlimp(screenX);
          break;
        case "balloon":
        default:
          spawnHotAirBalloon(screenX);
          break;
      }
    });
  }

  private checkMilestones(distanceMeters: number): void {
    if (distanceMeters < this.nextMilestone) return;
    const milestoneHit = this.nextMilestone;
    this.nextMilestone += this.milestoneInterval;
    this.celebrateMilestone(milestoneHit);
  }

  private celebrateMilestone(milestone: number): void {
    this.stall.value = Math.max(0, this.stall.value - 20);
    if (this.cart?.chassis) {
      Body.applyForce(this.cart.chassis, this.cart.chassis.position, Vector.create(0.004, -0.0012));
    }

    const cx = this.cameras.main.midPoint.x;
    const cy = this.cameras.main.midPoint.y - 120;
    const banner = this.add.text(cx, cy, `Milestone ${milestone} m\n+stall relief`, {
      fontSize: "18px",
      color: "#fef08a",
      align: "center",
      backgroundColor: "#0b1224",
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30);

    this.tweens.add({
      targets: banner,
      alpha: 0,
      y: cy - 24,
      duration: 900,
      onComplete: () => banner.destroy(),
    });
  }

  private createGhostMarker(): void {
    this.ghostMarker = this.add.circle(0, 0, 10, 0x38bdf8, 0.28).setDepth(9);
    this.ghostMarker.setStrokeStyle(1, 0x38bdf8, 0.6);
    this.updateGhostPosition();
  }

  private updateGhostPosition(): void {
    if (!this.ghostMarker) return;
    const targetBest = Math.max(this.bestDistance, this.dailyBest, this.sessionBest);
    const x = this.startX + targetBest * 100;
    this.ghostMarker.setPosition(x, this.startYForGhost());
  }

  private startYForGhost(): number {
    return this.cart?.chassis ? this.cart.chassis.position.y : 360;
  }

  private updateBestDistance(distance: number): void {
    if (distance > this.bestDistance) {
      this.bestDistance = distance;
      this.bestText?.setText(`Best: ${distance.toFixed(1)} m`);
      this.saveBestDistance(distance);
    }

    if (distance > this.dailyBest) {
      this.dailyBest = distance;
      this.saveDailyBest(distance);
      this.dailyText?.setText(`Today: ${distance.toFixed(1)} m`);
    }

    if (distance > this.sessionBest) {
      this.sessionBest = distance;
      this.sessionText?.setText(`Session: ${distance.toFixed(1)} m`);
    }
  }

  private loadBestDistance(): number {
    try {
      const raw = localStorage.getItem(this.bestStorageKey);
      if (!raw) return 0;
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (err) {
      console.warn("Failed to load best distance", err);
      return 0;
    }
  }

  private loadDailyBest(): number {
    try {
      const raw = localStorage.getItem(this.dailyBestStorageKey);
      if (!raw) return 0;
      const [datePart, valPart] = raw.split(":");
      const today = this.todayKey();
      if (datePart !== today) return 0;
      const parsed = parseFloat(valPart ?? raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (err) {
      console.warn("Failed to load daily best", err);
      return 0;
    }
  }

  private saveBestDistance(distance: number): void {
    try {
      localStorage.setItem(this.bestStorageKey, distance.toFixed(1));
    } catch (err) {
      console.warn("Failed to save best distance", err);
    }
  }

  private saveDailyBest(distance: number): void {
    try {
      const payload = `${this.todayKey()}:${distance.toFixed(1)}`;
      localStorage.setItem(this.dailyBestStorageKey, payload);
    } catch (err) {
      console.warn("Failed to save daily best", err);
    }
  }

  private todayKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  private triggerFail(reason: string): void {
    if (this.gameOver) return;
    this.gameOver = true;
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
