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

export class WheelieScene extends Phaser.Scene {
  private throttle: ThrottleState = { active: false, lastChange: 0 };

  private stall: StallMeter = { value: 0, max: 100, fillRate: 25, drainRate: 40 };

  private cart?: Cart;

  private course?: CourseState;

  private frontTouchIgnoreUntil = 0;

  private flipIgnoreUntil = 0;

  private frontContactStart = 0;

  private readonly frontContactThresholdMs = 250;

  private cam?: Phaser.Cameras.Scene2D.Camera;

  private speedText?: Phaser.GameObjects.Text;

  private failReasonText?: Phaser.GameObjects.Text;

  private lastFailReason = "";

  private angleText?: Phaser.GameObjects.Text;

  private readonly maxSpeed = 420; // px/s cap for chassis

  private statusText?: Phaser.GameObjects.Text;

  private stallText?: Phaser.GameObjects.Text;

  private gameOver = false;

  private groundCategory?: number;

  private group?: number;

  create(): void {
    this.groundCategory = this.matter.world.nextCategory();
    this.group = Body.nextGroup(true);

    this.setupInput();
    this.createBackground();
    this.createCourse();
    this.createCart();
    this.createHud();
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
    const sky = this.add.rectangle(0, 0, this.scale.width * 2, this.scale.height * 2, 0x0b1224)
      .setOrigin(0, 0)
      .setScrollFactor(0);
    sky.setFillStyle(0x0b1224, 1);

    const hills = this.add.rectangle(0, this.scale.height * 0.55, this.scale.width * 3, 180, 0x0f172a, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0.35);
    hills.setDepth(-8);

    for (let i = 0; i < 4; i += 1) {
      const band = this.add.rectangle(0, 80 + i * 60, this.scale.width * 3, 10, 0x0ea5e9, 0.12)
        .setOrigin(0, 0)
        .setScrollFactor(0.25 + i * 0.05);
      band.setDepth(-10 + i);
    }
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
    }

    if (this.cart?.chassis && this.angleText) {
      const deg = Phaser.Math.RadToDeg(this.cart.chassis.angle % (Math.PI * 2));
      const normalized = ((deg % 360) + 360) % 360; // 0-360
      this.angleText.setText(`Angle: ${normalized.toFixed(1)}°`);
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

    this.stallText?.setText(`Stall: ${this.stall.value.toFixed(0)} / ${this.stall.max}`);

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
