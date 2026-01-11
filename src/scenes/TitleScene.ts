import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel } from "@babylonjs/gui";
import type { SceneName } from "../main";

export function createTitleScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);

  // Background music using native Audio (more reliable cross-platform)
  const music = new Audio("/audio/rise-above.m4a");
  music.loop = true;
  music.volume = 0.5;
  music.play();

  // Clean up when scene is disposed
  scene.onDisposeObservable.add(() => {
    music.pause();
    music.src = "";
  });

  // Camera - isometric-ish view of a sample grid
  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 4,
    Math.PI / 3,
    15,
    Vector3.Zero(),
    scene
  );
  camera.attachControl(true);

  // Light
  new HemisphericLight("light", new Vector3(0, 1, 0), scene);

  // Create a small sample grid to show off the 3D capability
  const gridSize = 5;
  const tileSize = 1;
  const tileMaterial = new StandardMaterial("tileMat", scene);
  tileMaterial.diffuseColor = new Color3(0.2, 0.4, 0.6);

  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const tile = MeshBuilder.CreateBox(
        `tile_${x}_${z}`,
        { width: tileSize * 0.9, height: 0.1, depth: tileSize * 0.9 },
        scene
      );
      tile.position = new Vector3(
        x * tileSize - (gridSize * tileSize) / 2 + tileSize / 2,
        0,
        z * tileSize - (gridSize * tileSize) / 2 + tileSize / 2
      );
      tile.material = tileMaterial;
    }
  }

  // GUI overlay
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  const panel = new StackPanel();
  panel.width = "400px";
  panel.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = StackPanel.VERTICAL_ALIGNMENT_CENTER;
  gui.addControl(panel);

  const title = new TextBlock();
  title.text = "TACTICAL RPG";
  title.color = "white";
  title.fontSize = 48;
  title.height = "80px";
  title.resizeToFit = true;
  panel.addControl(title);

  const subtitle = new TextBlock();
  subtitle.text = "Prototype";
  subtitle.color = "#888888";
  subtitle.fontSize = 24;
  subtitle.height = "40px";
  panel.addControl(subtitle);

  const playButton = Button.CreateSimpleButton("playBtn", "PLAY");
  playButton.width = "200px";
  playButton.height = "50px";
  playButton.color = "white";
  playButton.background = "#444444";
  playButton.cornerRadius = 5;
  playButton.onPointerClickObservable.add(() => {
    navigateTo("battle");
  });
  panel.addControl(playButton);

  return scene;
}
