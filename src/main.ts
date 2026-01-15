import Phaser from "phaser";
import { WheelieScene } from "./wheelieScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: "#0f172a",
  parent: "app",
  physics: {
    default: "matter",
    matter: {
      gravity: { y: 1.25 },
      enableSleeping: false,
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [WheelieScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
