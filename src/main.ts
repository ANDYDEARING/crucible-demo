import { Engine, Scene } from "@babylonjs/core";
import { createStartScene } from "./scenes/StartScene";
import { createTitleScene } from "./scenes/TitleScene";
import { createBattleScene } from "./scenes/BattleScene";

export type SceneName = "start" | "title" | "loadout" | "battle";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

let currentScene: Scene;

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
      console.log("Loadout scene not yet implemented, going to battle");
      currentScene = createBattleScene(engine, canvas);
      break;
    case "battle":
      currentScene = createBattleScene(engine, canvas);
      break;
  }
}

// Start with click-to-start screen
navigateTo("start");

engine.runRenderLoop(() => {
  currentScene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
