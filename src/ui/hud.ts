import Phaser from "phaser";

export type HudTexts = {
  statusText: Phaser.GameObjects.Text;
  speedText: Phaser.GameObjects.Text;
  distanceText: Phaser.GameObjects.Text;
  bestText: Phaser.GameObjects.Text;
  dailyText: Phaser.GameObjects.Text;
  sessionText: Phaser.GameObjects.Text;
  angleText: Phaser.GameObjects.Text;
};

export function createHud(
  scene: Phaser.Scene,
  bestDistance: number,
  dailyBest: number,
  sessionBest: number,
): HudTexts {
  const card1 = scene.add.rectangle(12, 10, 190, 64, 0x0b1224, 0.6)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setStrokeStyle(1, 0x38bdf8, 0.35);

  const card2 = scene.add.rectangle(12, 84, 210, 74, 0x0b1224, 0.6)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setStrokeStyle(1, 0xfef3c7, 0.35);

  const iconSpeed = scene.add.triangle(24, 28, 0, 0, 12, 6, 0, 12, 0x38bdf8, 0.95).setScrollFactor(0);
  iconSpeed.setRotation(Phaser.Math.DegToRad(90));
  const statusText = scene.add.text(40, 16, "Hold space/click/touch to throttle", {
    fontSize: "16px",
    color: "#e2e8f0",
  }).setScrollFactor(0);

  const speedText = scene.add.text(40, 34, "Speed: 0", {
    fontSize: "16px",
    color: "#a5f3fc",
  }).setScrollFactor(0);

  const iconDistance = scene.add.rectangle(24, 60, 10, 14, 0xfef08a, 0.95).setScrollFactor(0);
  const distanceText = scene.add.text(40, 54, "Distance: 0 m", {
    fontSize: "16px",
    color: "#fef08a",
  }).setScrollFactor(0);

  const iconBest = scene.add.star(24, 98, 5, 5, 10, 0xfde68a, 0.9).setScrollFactor(0);
  const bestText = scene.add.text(40, 90, `Best: ${bestDistance.toFixed(1)} m`, {
    fontSize: "14px",
    color: "#fde68a",
  }).setScrollFactor(0);

  const iconDaily = scene.add.circle(24, 114, 6, 0xf59e0b, 0.9).setScrollFactor(0);
  const dailyText = scene.add.text(40, 108, `Today: ${dailyBest.toFixed(1)} m`, {
    fontSize: "14px",
    color: "#fcd34d",
  }).setScrollFactor(0);

  const iconSession = scene.add.rectangle(24, 132, 10, 10, 0x38bdf8, 0.9).setScrollFactor(0);
  const sessionText = scene.add.text(40, 126, `Session: ${sessionBest.toFixed(1)} m`, {
    fontSize: "14px",
    color: "#bae6fd",
  }).setScrollFactor(0);

  const angleText = scene.add.text(40, 144, "Angle: 0°", {
    fontSize: "14px",
    color: "#bbf7d0",
  }).setScrollFactor(0);

  [card1, card2, iconSpeed, iconDistance, iconBest, iconDaily, iconSession].forEach((obj) => obj.setDepth(20));
  [statusText, speedText, distanceText, bestText, dailyText, sessionText, angleText].forEach((obj) => obj.setDepth(21));

  return {
    statusText,
    speedText,
    distanceText,
    bestText,
    dailyText,
    sessionText,
    angleText,
  };
}
