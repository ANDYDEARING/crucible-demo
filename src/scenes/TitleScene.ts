import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, Rectangle, Control } from "@babylonjs/gui";
import type { SceneName } from "../main";

export function createTitleScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);

  // Background music
  const music = new Audio("/audio/rise-above.m4a");
  music.loop = true;
  music.volume = 0.5;
  music.addEventListener("timeupdate", () => {
    if (music.duration && music.currentTime >= music.duration - 0.5) {
      music.currentTime = 0;
    }
  });
  music.play();

  scene.onDisposeObservable.add(() => {
    music.pause();
    music.src = "";
  });

  // Simple camera (no 3D elements needed)
  new FreeCamera("camera", Vector3.Zero(), scene);

  // GUI
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Animated gradient background using layered rectangles
  const glowLayers: Rectangle[] = [];
  const numLayers = 5;

  for (let i = 0; i < numLayers; i++) {
    const glow = new Rectangle();
    glow.width = "150%";
    glow.height = "150%";
    glow.thickness = 0;
    glow.background = `rgba(255, ${100 + i * 30}, 0, ${0.15 - i * 0.02})`;
    glow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    glow.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    gui.addControl(glow);
    glowLayers.push(glow);
  }

  // Animate the glow layers
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += 0.02;

    for (let i = 0; i < glowLayers.length; i++) {
      const layer = glowLayers[i];
      const offset = i * 0.5;
      const xWave = Math.sin(time + offset) * 5;
      const yWave = Math.cos(time * 0.7 + offset) * 5;
      layer.left = `${xWave}%`;
      layer.top = `${yWave}%`;

      // Pulse the opacity
      const alpha = 0.1 + 0.05 * Math.sin(time * 1.5 + i);
      const green = 100 + i * 30 + Math.sin(time + i) * 20;
      layer.background = `rgba(255, ${Math.floor(green)}, 0, ${alpha})`;
    }
  });

  // Title container
  const panel = new StackPanel();
  panel.width = "100%";
  panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  gui.addControl(panel);

  // Main title - 0.75 inches ≈ 72px at 96 DPI
  const titleLine1 = new TextBlock();
  titleLine1.text = "THE SUNSET GAMBIT";
  titleLine1.color = "white";
  titleLine1.fontFamily = "'Exo 2', sans-serif";
  titleLine1.fontWeight = "700";
  titleLine1.fontSize = 72;
  titleLine1.height = "90px";
  titleLine1.outlineWidth = 6;
  titleLine1.outlineColor = "black";
  panel.addControl(titleLine1);

  // Subtitle - slightly larger for emphasis
  const titleLine2 = new TextBlock();
  titleLine2.text = "CRUCIBLE";
  titleLine2.color = "white";
  titleLine2.fontFamily = "'Exo 2', sans-serif";
  titleLine2.fontWeight = "700";
  titleLine2.fontSize = 96;
  titleLine2.height = "120px";
  titleLine2.outlineWidth = 7;
  titleLine2.outlineColor = "black";
  panel.addControl(titleLine2);

  // Spacer
  const spacer = new Rectangle();
  spacer.height = "40px";
  spacer.thickness = 0;
  spacer.background = "transparent";
  panel.addControl(spacer);

  // Play button
  const playButton = Button.CreateSimpleButton("playBtn", "PLAY");
  playButton.width = "200px";
  playButton.height = "50px";
  playButton.color = "white";
  playButton.fontFamily = "'Exo 2', sans-serif";
  playButton.fontSize = 28;
  playButton.background = "rgba(80, 80, 80, 0.8)";
  playButton.cornerRadius = 5;
  playButton.thickness = 2;
  playButton.onPointerClickObservable.add(() => {
    navigateTo("loadout");
  });
  panel.addControl(playButton);

  return scene;
}
