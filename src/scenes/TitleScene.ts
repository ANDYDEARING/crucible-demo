import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, StackPanel, Rectangle, Control } from "@babylonjs/gui";
import type { SceneName } from "../main";

// Ember particle for floating fire effect
interface Ember {
  element: Rectangle;
  x: number;
  y: number;
  speed: number;
  drift: number;
  driftSpeed: number;
  size: number;
  baseAlpha: number;
}

export function createTitleScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);
  // Deep black with subtle warm undertone
  scene.clearColor = new Color4(0.02, 0.01, 0.01, 1);

  // Background music
  const music = new Audio("/audio/rise_above_loop_v3.m4a");
  music.loop = true;
  music.volume = 0.5;
  music.addEventListener("timeupdate", () => {
    if (music.duration && music.currentTime >= music.duration - 0.5) {
      music.currentTime = 0;
    }
  });
  music.play();

  // Press S to skip to 10 seconds before end (to test loop)
  const skipHandler = (e: KeyboardEvent) => {
    if (e.key === "s" || e.key === "S") {
      if (music.duration) {
        music.currentTime = Math.max(0, music.duration - 10);
      }
    }
  };
  window.addEventListener("keydown", skipHandler);

  scene.onDisposeObservable.add(() => {
    music.pause();
    music.src = "";
    window.removeEventListener("keydown", skipHandler);
  });

  new FreeCamera("camera", Vector3.Zero(), scene);

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // === BACKGROUND: Rising heat glow from below ===

  // Base gradient - warm glow rising from bottom (full height, gradient handles fade)
  const baseGlow = new Rectangle();
  baseGlow.width = "100%";
  baseGlow.height = "100%";
  baseGlow.thickness = 0;
  baseGlow.background = "linear-gradient(to top, rgba(139, 35, 0, 0.35) 0%, rgba(80, 20, 0, 0.15) 30%, rgba(30, 8, 0, 0.05) 50%, transparent 70%)";
  gui.addControl(baseGlow);

  // Pulsing heat layers
  const heatLayers: Rectangle[] = [];
  const heatColors = [
    { r: 180, g: 50, b: 0 },   // Deep orange-red
    { r: 255, g: 80, b: 0 },   // Bright orange
    { r: 255, g: 120, b: 20 }, // Amber
  ];

  for (let i = 0; i < 3; i++) {
    const heat = new Rectangle();
    heat.width = "120%";
    heat.height = "50%";
    heat.thickness = 0;
    heat.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    gui.addControl(heat);
    heatLayers.push(heat);
  }

  // === FLOATING EMBERS ===
  // (added after title panel so they appear on top)
  const embers: Ember[] = [];

  // === ANIMATION LOOP ===
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += engine.getDeltaTime() / 1000;

    // Animate heat layers
    for (let i = 0; i < heatLayers.length; i++) {
      const layer = heatLayers[i];
      const color = heatColors[i];
      const pulse = 0.08 + 0.04 * Math.sin(time * (0.8 + i * 0.3) + i);
      const flicker = 1 + 0.1 * Math.sin(time * 3 + i * 2);

      const r = Math.floor(color.r * flicker);
      const g = Math.floor(color.g * flicker);
      const b = Math.floor(color.b * flicker);

      layer.background = `linear-gradient(to top, rgba(${r}, ${g}, ${b}, ${pulse}) 0%, transparent 100%)`;
    }

    // Animate embers
    for (const ember of embers) {
      ember.y -= ember.speed;
      ember.drift += ember.driftSpeed * 0.01;

      // Reset when off screen
      if (ember.y < -5) {
        ember.y = 100 + Math.random() * 10;
        ember.x = Math.random() * 100;
      }

      const xOffset = Math.sin(ember.drift) * 3;
      ember.element.left = `${ember.x + xOffset}%`;
      ember.element.top = `${ember.y}%`;

      // Brighter at bottom (high y), fading as they rise (low y)
      const heightFade = Math.max(0, Math.min(1, ember.y / 100));
      const flicker = 0.7 + 0.3 * Math.sin(time * 6 + ember.drift);
      const alpha = ember.baseAlpha * heightFade * flicker;

      // Brighter yellow-orange at bottom, cooling to deep orange/red as rises
      const r = 255;
      const g = Math.floor(100 + heightFade * 150); // More yellow at bottom
      const b = Math.floor(heightFade * 50);

      ember.element.background = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ember.element.shadowColor = `rgba(255, ${g}, 30, ${alpha})`;
      ember.element.shadowBlur = ember.size * 3;
    }

    // Subtle title glow pulse
    const glowIntensity = 0.6 + 0.2 * Math.sin(time * 0.5);
    titleLine1.shadowColor = `rgba(255, 100, 20, ${glowIntensity * 0.5})`;
    titleLine2.shadowColor = `rgba(255, 80, 0, ${glowIntensity * 0.7})`;
  });

  // === TITLE TEXT ===
  const panel = new StackPanel();
  panel.width = "100%";
  panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  panel.top = "-5%";
  gui.addControl(panel);

  // Main title - Bebas Neue for that industrial T2 feel
  const titleLine1 = new TextBlock();
  titleLine1.text = "T H E   S U N S E T   G A M B I T";
  titleLine1.color = "#e8c4a0"; // Warm off-white, like heated metal
  titleLine1.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  titleLine1.fontWeight = "400";
  titleLine1.fontSize = 36;
  titleLine1.height = "55px";
  titleLine1.shadowColor = "rgba(255, 100, 20, 0.5)";
  titleLine1.shadowBlur = 20;
  titleLine1.shadowOffsetY = 2;
  panel.addControl(titleLine1);

  // Subtitle - larger, more dramatic
  const titleLine2 = new TextBlock();
  titleLine2.text = "C R U C I B L E";
  titleLine2.color = "#ffb366"; // Warmer, more orange - like glowing metal
  titleLine2.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  titleLine2.fontWeight = "400";
  titleLine2.fontSize = 96;
  titleLine2.height = "120px";
  titleLine2.shadowColor = "rgba(255, 80, 0, 0.7)";
  titleLine2.shadowBlur = 30;
  titleLine2.shadowOffsetY = 4;
  panel.addControl(titleLine2);

  // Thin decorative line
  const divider = new Rectangle();
  divider.width = "300px";
  divider.height = "2px";
  divider.thickness = 0;
  divider.background = "rgba(255, 150, 80, 0.4)";
  panel.addControl(divider);

  // Spacer
  const spacer = new TextBlock();
  spacer.height = "60px";
  spacer.text = "";
  panel.addControl(spacer);

  // === PLAY BUTTON - minimal, understated ===
  const playButton = new Rectangle();
  playButton.width = "180px";
  playButton.height = "45px";
  playButton.background = "rgba(40, 20, 15, 0.6)";
  playButton.cornerRadius = 2;
  playButton.thickness = 1;
  playButton.color = "#b89070";
  playButton.hoverCursor = "pointer";

  const buttonText = new TextBlock();
  buttonText.text = "B E G I N";
  buttonText.color = "#b89070";
  buttonText.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  buttonText.fontSize = 22;
  playButton.addControl(buttonText);

  // Re-render text after fonts load to fix centering
  document.fonts.load("22px 'Bebas Neue'").then(() => {
    // Small delay to ensure GUI has processed the font
    setTimeout(() => {
      buttonText.text = "B E G I N ";
      setTimeout(() => {
        buttonText.text = "B E G I N";
      }, 50);
    }, 100);
  });

  // Hover effects
  playButton.onPointerEnterObservable.add(() => {
    playButton.background = "rgba(100, 50, 25, 0.8)";
    buttonText.color = "#ffd0a0";
    playButton.shadowColor = "rgba(255, 120, 50, 0.6)";
    playButton.shadowBlur = 15;
  });
  playButton.onPointerOutObservable.add(() => {
    playButton.background = "rgba(40, 20, 15, 0.6)";
    buttonText.color = "#b89070";
    playButton.shadowColor = "transparent";
    playButton.shadowBlur = 0;
  });

  playButton.onPointerClickObservable.add(() => {
    navigateTo("loadout");
  });
  panel.addControl(playButton);

  // === CREATE EMBERS (after panel so they render on top) ===
  const numEmbers = 30;
  for (let i = 0; i < numEmbers; i++) {
    const ember = new Rectangle();
    const size = 3 + Math.random() * 5;
    ember.width = `${size}px`;
    ember.height = `${size}px`;
    ember.thickness = 0;
    ember.cornerRadius = size / 2;
    ember.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    ember.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    ember.isHitTestVisible = false; // Don't block clicks
    gui.addControl(ember);

    embers.push({
      element: ember,
      x: Math.random() * 100,
      y: 50 + Math.random() * 55, // Start spread across bottom half
      speed: 0.15 + Math.random() * 0.25, // Faster speed so they're visible
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.5 + Math.random() * 1.5,
      size,
      baseAlpha: 0.5 + Math.random() * 0.5, // Higher base alpha
    });
  }

  return scene;
}
