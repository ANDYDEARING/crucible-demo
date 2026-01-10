import { Engine, Scene } from "@babylonjs/core";
import { createTitleScene } from "./scenes/TitleScene";
import { createBattleScene } from "./scenes/BattleScene";

export type SceneName = "title" | "loadout" | "battle";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

let currentScene: Scene;

// Scene navigation function - available globally for scenes to call
export function navigateTo(sceneName: SceneName): void {
  if (currentScene) {
    currentScene.dispose();
  }

  switch (sceneName) {
    case "title":
      currentScene = createTitleScene(engine, canvas, navigateTo);
      break;
    case "loadout":
      // TODO: implement loadout scene
      console.log("Loadout scene not yet implemented, going to battle");
      currentScene = createBattleScene(engine, canvas);
      break;
    case "battle":
      currentScene = createBattleScene(engine, canvas);
      break;
  }
}

// Start with title scene
navigateTo("title");

engine.runRenderLoop(() => {
  currentScene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
