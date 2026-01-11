import {
  Engine,
  Scene,
  Color4,
  FreeCamera,
  Vector3,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, Rectangle } from "@babylonjs/gui";
import type { SceneName } from "../main";

export function createStartScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.05, 0.1, 1);

  // Required camera for scene to render
  new FreeCamera("camera", Vector3.Zero(), scene);

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Full screen clickable area
  const clickArea = new Rectangle();
  clickArea.width = "100%";
  clickArea.height = "100%";
  clickArea.thickness = 0;
  clickArea.background = "#00000001"; // Near-transparent but clickable
  clickArea.isPointerBlocker = true;
  gui.addControl(clickArea);

  const prompt = new TextBlock();
  prompt.text = "Click to Begin";
  prompt.color = "white";
  prompt.fontFamily = "'Exo 2', sans-serif";
  prompt.fontSize = 48;
  prompt.isHitTestVisible = false;
  gui.addControl(prompt);

  // Pulse animation for the prompt
  let alpha = 0;
  scene.onBeforeRenderObservable.add(() => {
    alpha += 0.05;
    const opacity = 0.5 + 0.5 * Math.sin(alpha);
    prompt.alpha = opacity;
  });

  clickArea.onPointerClickObservable.add(() => {
    navigateTo("title");
  });

  return scene;
}
