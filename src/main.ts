import { Engine, Scene } from "@babylonjs/core";
import { createStartScene } from "./scenes/StartScene";
import { createTitleScene } from "./scenes/TitleScene";
import { createLoadoutScene } from "./scenes/LoadoutScene";
import { createBattleScene } from "./scenes/BattleScene";
import type { Loadout } from "./types";

export type SceneName = "start" | "title" | "loadout" | "battle";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

let currentScene: Scene;
let currentLoadout: Loadout | null = null;

export function navigateTo(sceneName: SceneName): void {
  if (currentScene) {
    currentScene.dispose();
  }

  switch (sceneName) {
    case "start":
      currentScene = createStartScene(engine, canvas, navigateTo);
      break;
    case "title":
      currentScene = createTitleScene(engine, canvas, navigateTo);
      break;
    case "loadout":
      currentScene = createLoadoutScene(engine, canvas, (loadout: Loadout) => {
        currentLoadout = loadout;
        navigateTo("battle");
      });
      break;
    case "battle":
      currentScene = createBattleScene(engine, canvas, currentLoadout);
      break;
  }
}

// Helper to switch back to loadout from battle
export function switchToLoadout(): void {
  navigateTo("loadout");
}

// Start with click-to-start screen
navigateTo("start");

engine.runRenderLoop(() => {
  currentScene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
