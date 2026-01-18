import {
  Engine,
  Scene,
  Color4,
  Color3,
  Vector3,
  ArcRotateCamera,
  HemisphericLight,
  SceneLoader,
  AbstractMesh,
  AnimationGroup,
  PBRMaterial,
  RenderTargetTexture,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import {
  AdvancedDynamicTexture,
  TextBlock,
  Button,
  StackPanel,
  Rectangle,
  Grid,
  Control,
  Image,
} from "@babylonjs/gui";
import { UNIT_INFO, Loadout, UnitSelection, SupportCustomization, UnitType } from "../types";

// Color palette options
const SKIN_TONES = [
  "#FFDFC4",  // Light
  "#E8C0A0",
  "#D0A080",
  "#B08060",
  "#906040",
  "#704828",
  "#503418",
  "#352210",
  "#1E1208",
  "#0A0604",  // Near black
];
const HAIR_COLORS = [
  "#0A0A0A",  // Black
  "#4A3728",  // Brown
  "#E5C8A8",  // Blond
  "#B55239",  // Reddish-orange
  "#C0C0C0",  // Silver
  "#FF2222",  // Bright red
  "#FF66AA",  // Bright pink
  "#9933FF",  // Purple
  "#22CC44",  // Green
  "#2288FF",  // Blue
];
const EYE_COLORS = [
  "#2288FF",  // Blue
  "#22AA44",  // Green
  "#634E34",  // Brown
  "#DD2222",  // Red
  "#9933FF",  // Purple
  "#FFFFFF",  // White
  "#0A0A0A",  // Black
  "#FF8800",  // Orange
];

export function createLoadoutScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  onStartBattle: (loadout: Loadout) => void
): Scene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.08, 0.08, 0.12, 1);

  // Loadout music
  const music = new Audio("/audio/wowchapter1.m4a");
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

  // Single camera - positioned to see models in background
  const camera = new ArcRotateCamera("cam", Math.PI/2, Math.PI/2.2, 6, new Vector3(0, 0.8, 0), scene);
  scene.activeCamera = camera;

  // Lights
  const light = new HemisphericLight("light", new Vector3(0, 1, 0.5), scene);
  light.intensity = 1.2;

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Main container (2 columns: Player 1, Player 2)
  const mainGrid = new Grid();
  mainGrid.width = "95%";
  mainGrid.height = "82%";
  mainGrid.top = "-6%";
  mainGrid.addColumnDefinition(0.5);
  mainGrid.addColumnDefinition(0.5);
  mainGrid.addRowDefinition(1);
  gui.addControl(mainGrid);

  // Track selections
  const selections: Loadout = {
    player: [],
    enemy: []
  };

  // 3D Preview system using RTT
  interface MedicPreview {
    meshes: AbstractMesh[];
    animationGroups: AnimationGroup[];
    rtt: RenderTargetTexture;
    previewCamera: ArcRotateCamera;
    canvas: HTMLCanvasElement;
  }

  const previews: { left?: MedicPreview; right?: MedicPreview } = {};

  // Zoom presets: [radius, targetY]
  const ZOOM_PRESETS = [
    { radius: 3, targetY: 0.7, name: "Full Body" },
    { radius: 1.7, targetY: 1.0, name: "Torso & Head" }
  ];

  // Helper to convert hex color to Color3
  function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
  }

  function updatePreview(preview: MedicPreview | undefined, c: SupportCustomization): void {
    if (!preview) return;

    // Update head visibility (Head_001 through Head_004)
    for (let i = 0; i < 4; i++) {
      const headName = `Head_00${i + 1}`;
      const headMeshes = preview.meshes.filter(m => m.name.includes(headName));
      headMeshes.forEach(mesh => mesh.setEnabled(i === c.head));
    }

    // Update weapon visibility and animation based on combat style
    const swordMeshes = preview.meshes.filter(m => m.name.toLowerCase().includes("sword"));
    const pistolMeshes = preview.meshes.filter(m => m.name.toLowerCase().includes("pistol"));

    const isMelee = c.combatStyle === "melee";
    swordMeshes.forEach(m => m.setEnabled(isMelee));
    pistolMeshes.forEach(m => m.setEnabled(!isMelee));

    // Switch animation based on combat style
    preview.animationGroups.forEach(ag => ag.stop());
    const idleAnim = isMelee
      ? preview.animationGroups.find(ag => ag.name === "Idle_Sword")
      : preview.animationGroups.find(ag => ag.name === "Idle_Gun");
    idleAnim?.start(true);

    // Update materials (skin, hair, eyes) using correct material names
    preview.meshes.forEach(mesh => {
      if (!mesh.material) return;
      const mat = mesh.material as PBRMaterial;
      const matName = mat.name;

      if (matName === "MainSkin") {
        mat.albedoColor = hexToColor3(SKIN_TONES[c.skinTone] || SKIN_TONES[0]);
      } else if (matName === "MainHair") {
        mat.albedoColor = hexToColor3(HAIR_COLORS[c.hairColor] || HAIR_COLORS[0]);
      } else if (matName === "MainEye") {
        mat.albedoColor = hexToColor3(EYE_COLORS[c.eyeColor] || EYE_COLORS[0]);
      }
    });

    // Handedness - flip X scale (model is reversed by default due to Babylon/Blender axis swap)
    // Right-handed = flip to correct, Left-handed = keep reversed
    const root = preview.meshes[0];
    if (root) {
      const baseScale = 0.9;
      root.scaling.x = c.handedness === "right" ? -baseScale : baseScale;
    }

    // Body type stored for future model switching (not implemented yet)
    // c.body === "male" or "female"
  }

  async function createMedicPreview(
    side: "left" | "right",
    previewRect: Rectangle,
    _customization: SupportCustomization
  ): Promise<MedicPreview> {
    // Position model far away so main camera doesn't see it
    const modelOffset = side === "left" ? -100 : 100;

    // Use square RTT - image will be sized to fill height and clip width
    const rttSize = 768;

    // Create square RTT
    const rtt = new RenderTargetTexture(`rtt_${side}`, rttSize, scene, false);
    rtt.clearColor = new Color4(0.3, 0.32, 0.38, 1);  // Lighter background to see dark elements
    scene.customRenderTargets.push(rtt);

    // === PREVIEW CAMERA SETTINGS ===
    const camAlpha = 4.1;                       // Horizontal angle
    const camBeta = Math.PI / 2.5;              // Vertical angle
    const camRadius = ZOOM_PRESETS[0].radius;   // Start at full body
    const camTargetY = ZOOM_PRESETS[0].targetY;
    // ================================

    const previewCamera = new ArcRotateCamera(
      `previewCam_${side}`,
      camAlpha,
      camBeta,
      camRadius,
      new Vector3(modelOffset, camTargetY, 0),
      scene
    );
    rtt.activeCamera = previewCamera;

    // Override camera's aspect ratio calculation to always return 1 (square)
    const originalGetAspectRatio = previewCamera.getEngine.bind(previewCamera);
    previewCamera.getEngine = () => {
      const eng = originalGetAspectRatio();
      return {
        ...eng,
        getAspectRatio: () => 1,  // Force square aspect ratio
      } as any;
    };

    // Load medic model
    const result = await SceneLoader.ImportMeshAsync("", "/models/", "medic_m.glb", scene);

    // Use layer mask to hide from main camera (0x0FFFFFFF), only show to preview
    const previewLayer = side === "left" ? 0x10000000 : 0x20000000;
    previewCamera.layerMask = previewLayer;

    // Position model at offset location
    const root = result.meshes[0];
    root.position = new Vector3(modelOffset, 0, 0);
    root.scaling = new Vector3(0.9, 0.9, 0.9);

    // Add meshes to RTT render list and set layer mask
    result.meshes.forEach(m => {
      m.layerMask = previewLayer;
      rtt.renderList?.push(m);
    });

    // Set team color on TeamMain material
    const teamColor = side === "left"
      ? new Color3(0.2, 0.4, 0.9)   // Blue for player 1
      : new Color3(0.9, 0.3, 0.2);  // Red for player 2

    result.meshes.forEach(mesh => {
      if (mesh.material && mesh.material.name === "TeamMain") {
        const mat = mesh.material as PBRMaterial;
        mat.albedoColor = teamColor;
      }
    });

    // Start idle animation
    const idleAnim = result.animationGroups.find(ag => ag.name === "Idle_Gun");
    result.animationGroups.forEach(ag => ag.stop());
    idleAnim?.start(true);

    // Create HTML canvas for displaying RTT in GUI
    const canvas = document.createElement("canvas");
    canvas.width = rttSize;
    canvas.height = rttSize;
    const ctx = canvas.getContext("2d")!;

    // Create GUI Image - fill height, clip width overflow
    const previewImage = new Image(`previewImg_${side}`, "");
    previewImage.stretch = Image.STRETCH_FILL;
    previewRect.addControl(previewImage);

    // Size image to match container height (square image, so width = height)
    const updateImageSize = () => {
      const h = previewRect.heightInPixels;
      if (h > 0) {
        previewImage.widthInPixels = h;
        previewImage.heightInPixels = h;
      }
    };
    scene.onBeforeRenderObservable.add(updateImageSize);

    // Update canvas from RTT after each render (throttled)
    let frameCount = 0;
    rtt.onAfterRenderObservable.add(() => {
      frameCount++;
      if (frameCount % 3 !== 0) return; // Update every 3rd frame (~20fps) for smoother interaction

      rtt.readPixels()?.then((buffer) => {
        if (!buffer) return;
        const pixels = new Uint8Array(buffer.buffer);
        const imageData = ctx.createImageData(rttSize, rttSize);

        // RTT pixels are RGBA but may need flipping
        for (let y = 0; y < rttSize; y++) {
          for (let x = 0; x < rttSize; x++) {
            const srcIdx = ((rttSize - 1 - y) * rttSize + x) * 4; // Flip Y
            const dstIdx = (y * rttSize + x) * 4;
            imageData.data[dstIdx] = pixels[srcIdx];
            imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
            imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
            imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
          }
        }
        ctx.putImageData(imageData, 0, 0);

        // Convert canvas to data URL and set as image source
        previewImage.source = canvas.toDataURL();
      });
    });

    const preview: MedicPreview = {
      meshes: result.meshes,
      animationGroups: result.animationGroups,
      rtt,
      previewCamera,
      canvas,
    };

    return preview;
  }

  // Create player panels
  const player1Panel = createPlayerPanel("Player 1", "#4488ff", selections.player, "left");
  const player2Panel = createPlayerPanel("Player 2", "#ff8844", selections.enemy, "right");

  mainGrid.addControl(player1Panel, 0, 0);
  mainGrid.addControl(player2Panel, 0, 1);

  // Info panel
  const infoPanel = new Rectangle();
  infoPanel.width = "80%";
  infoPanel.height = "50px";
  infoPanel.top = "40%";
  infoPanel.background = "#222233";
  infoPanel.cornerRadius = 5;
  infoPanel.thickness = 0;
  gui.addControl(infoPanel);

  const infoText = new TextBlock();
  infoText.text = "Hover over a unit type to see stats";
  infoText.color = "#888888";
  infoText.fontSize = 14;
  infoPanel.addControl(infoText);

  // Start button
  const startBtn = Button.CreateSimpleButton("startBattle", "START BATTLE");
  startBtn.width = "200px";
  startBtn.height = "50px";
  startBtn.top = "46%";
  startBtn.color = "white";
  startBtn.background = "#444444";
  startBtn.cornerRadius = 5;
  startBtn.isEnabled = false;
  startBtn.alpha = 0.5;
  startBtn.onPointerClickObservable.add(() => {
    if (selections.player.length === 3 && selections.enemy.length === 3) {
      onStartBattle(selections);
    }
  });
  gui.addControl(startBtn);

  function updateStartButton(): void {
    const ready = selections.player.length === 3 && selections.enemy.length === 3;
    startBtn.isEnabled = ready;
    startBtn.alpha = ready ? 1 : 0.5;
    startBtn.background = ready ? "#448844" : "#444444";
  }

  function createPlayerPanel(
    playerName: string,
    color: string,
    selectionArray: UnitSelection[],
    side: "left" | "right"
  ): Rectangle {
    const panel = new Rectangle();
    panel.width = "98%";
    panel.height = "100%";
    panel.background = "#1a1a2e";
    panel.cornerRadius = 10;
    panel.thickness = 2;
    panel.color = color;

    // Use Grid for main layout to control row heights
    const container = new Grid();
    container.width = "95%";
    container.height = "100%";
    // Row 0: Player name (35px)
    // Row 1: Selection display (25px)
    // Row 2: Class buttons (45px)
    // Row 3: Customization panel (takes remaining space)
    // Row 4: Clear button (35px)
    container.addRowDefinition(35, true);   // Player name - fixed px
    container.addRowDefinition(25, true);   // Selection - fixed px
    container.addRowDefinition(45, true);   // Buttons - fixed px
    container.addRowDefinition(1);          // Custom panel - fill remaining
    container.addRowDefinition(35, true);   // Clear - fixed px
    container.addColumnDefinition(1);
    panel.addControl(container);

    // Player name - centered (row 0)
    const nameText = new TextBlock();
    nameText.text = playerName;
    nameText.color = color;
    nameText.fontSize = 22;
    nameText.fontWeight = "bold";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(nameText, 0, 0);

    // Selection display - centered, color coded (row 1)
    const selectionDisplay = new TextBlock();
    selectionDisplay.text = "Selected: (choose 3)";
    selectionDisplay.color = "#ff6666";
    selectionDisplay.fontSize = 13;
    selectionDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(selectionDisplay, 1, 0);

    const updateSelectionDisplay = (): void => {
      if (selectionArray.length === 0) {
        selectionDisplay.text = "Selected: (choose 3)";
        selectionDisplay.color = "#ff6666";
      } else {
        const names = selectionArray.map(u => UNIT_INFO[u.type].name);
        selectionDisplay.text = `Selected: ${names.join(", ")}`;
        selectionDisplay.color = selectionArray.length === 3 ? "#44ff44" : "#ff6666";
      }
    };

    // Class buttons row - spread across using Grid (row 2)
    const classButtonRow = new Grid();
    classButtonRow.width = "100%";
    classButtonRow.addColumnDefinition(1/3);
    classButtonRow.addColumnDefinition(1/3);
    classButtonRow.addColumnDefinition(1/3);
    classButtonRow.addRowDefinition(1);
    container.addControl(classButtonRow, 2, 0);

    // Track which class is currently selected for customization
    let selectedClass: UnitType | null = null;

    // Current customization state
    const currentCustomization: SupportCustomization = {
      body: "male",
      combatStyle: "ranged",
      handedness: "right",
      head: 0,
      hairColor: 0,
      eyeColor: 2,  // Brown default
      skinTone: 4,  // Medium skin tone default
    };

    // Customization panel (hidden by default) - row 3, fills remaining space
    const customPanel = new Rectangle();
    customPanel.width = "100%";
    customPanel.height = "100%";
    customPanel.background = "#2a2a4e";
    customPanel.cornerRadius = 5;
    customPanel.thickness = 1;
    customPanel.color = "#555588";
    customPanel.isVisible = false;
    container.addControl(customPanel, 3, 0);

    // Use Grid for customization panel layout
    const customContainer = new Grid();
    customContainer.width = "98%";
    customContainer.height = "100%";
    customContainer.addRowDefinition(0.12);  // Title - 12%
    customContainer.addRowDefinition(0.72);  // Options + Preview - 72%
    customContainer.addRowDefinition(0.16);  // Add button - 16%
    customContainer.addColumnDefinition(1);
    customPanel.addControl(customContainer);

    // Class title in customization panel (row 0)
    const classTitle = new TextBlock();
    classTitle.text = "";
    classTitle.color = "#88ff88";
    classTitle.fontSize = 16;
    classTitle.fontWeight = "bold";
    classTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    customContainer.addControl(classTitle, 0, 0);

    // Two-column grid: Options+Copy | Preview (row 1)
    const customGrid = new Grid();
    customGrid.width = "100%";
    customGrid.height = "100%";
    customGrid.verticalAlignment = Control.VERTICAL_ALIGNMENT_STRETCH;
    customGrid.addColumnDefinition(0.7);   // Options + Copy
    customGrid.addColumnDefinition(0.3);   // Preview
    customGrid.addRowDefinition(1);
    customContainer.addControl(customGrid, 1, 0);

    // Left column: Controls (2 columns) + Copy text below
    const optionsCol = new Grid();
    optionsCol.width = "100%";
    optionsCol.height = "100%";
    optionsCol.addRowDefinition(0.6);  // Controls area
    optionsCol.addRowDefinition(0.4);  // Copy text area
    optionsCol.addColumnDefinition(1);
    customGrid.addControl(optionsCol, 0, 0);

    // Two-column grid for controls
    const controlsGrid = new Grid();
    controlsGrid.width = "100%";
    controlsGrid.height = "100%";
    controlsGrid.addColumnDefinition(0.5);
    controlsGrid.addColumnDefinition(0.5);
    controlsGrid.addRowDefinition(0.25);
    controlsGrid.addRowDefinition(0.25);
    controlsGrid.addRowDefinition(0.25);
    controlsGrid.addRowDefinition(0.25);
    optionsCol.addControl(controlsGrid, 0, 0);

    // Left column controls
    const bodyChooser = createOptionChooser("Body", ["Male", "Female"], 0, (idx) => {
      currentCustomization.body = idx === 0 ? "male" : "female";
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(bodyChooser, 0, 0);

    const headChooser = createOptionChooser("Head", ["1", "2", "3", "4"], 0, (idx) => {
      currentCustomization.head = idx;
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(headChooser, 1, 0);

    const styleChooser = createOptionChooser("Style", ["Ranged", "Melee"], 0, (idx) => {
      currentCustomization.combatStyle = idx === 0 ? "ranged" : "melee";
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(styleChooser, 2, 0);

    const handChooser = createOptionChooser("Hand", ["Right", "Left"], 0, (idx) => {
      currentCustomization.handedness = idx === 0 ? "right" : "left";
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(handChooser, 3, 0);

    // Right column controls
    const hairChooser = createColorChooser("Hair", HAIR_COLORS, 0, (idx) => {
      currentCustomization.hairColor = idx;
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(hairChooser, 0, 1);

    const eyesChooser = createColorChooser("Eyes", EYE_COLORS, 2, (idx) => {
      currentCustomization.eyeColor = idx;
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(eyesChooser, 1, 1);

    const skinChooser = createColorChooser("Skin", SKIN_TONES, 4, (idx) => {
      currentCustomization.skinTone = idx;
      updatePreview(previews[side], currentCustomization);
    });
    controlsGrid.addControl(skinChooser, 2, 1);

    // Copy text below controls
    const descriptionText = new TextBlock();
    descriptionText.text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";
    descriptionText.color = "#999999";
    descriptionText.fontSize = 11;
    descriptionText.textWrapping = true;
    descriptionText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descriptionText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    descriptionText.paddingTop = "10px";
    descriptionText.paddingLeft = "5px";
    descriptionText.paddingRight = "5px";
    optionsCol.addControl(descriptionText, 1, 0);

    // Right column: Preview area - portrait, image maintains aspect ratio
    const previewArea = new Rectangle();
    previewArea.width = "95%";
    previewArea.height = "95%";
    previewArea.background = "#3a3a4a";
    previewArea.thickness = 1;
    previewArea.color = "#555577";
    previewArea.cornerRadius = 5;
    customGrid.addControl(previewArea, 0, 1);

    const loadingText = new TextBlock();
    loadingText.text = "Loading...";
    loadingText.color = "#666688";
    loadingText.fontSize = 12;
    previewArea.addControl(loadingText);

    // Mouse controls for preview - drag to rotate, wheel to zoom
    let isDraggingPreview = false;
    let lastPointerX = 0;

    previewArea.onPointerDownObservable.add(() => {
      isDraggingPreview = true;
      lastPointerX = scene.pointerX;
    });

    previewArea.onPointerUpObservable.add(() => {
      isDraggingPreview = false;
    });

    // Use scene-level pointer move for smoother tracking
    scene.onPointerObservable.add((pointerInfo) => {
      if (isDraggingPreview && previews[side] && pointerInfo.type === 4) { // POINTERMOVE = 4
        const deltaX = scene.pointerX - lastPointerX;
        previews[side]!.previewCamera.alpha -= deltaX * 0.01;
        lastPointerX = scene.pointerX;
      }
      if (pointerInfo.type === 2) { // POINTERUP = 2
        isDraggingPreview = false;
      }
    });

    // Zoom preset cycling with smooth animation
    let currentZoomIndex = 0;
    let targetRadius = ZOOM_PRESETS[0].radius;
    let targetTargetY = ZOOM_PRESETS[0].targetY;
    let isAnimating = false;

    // Animate camera towards target values
    scene.onBeforeRenderObservable.add(() => {
      if (previews[side] && isAnimating) {
        const cam = previews[side]!.previewCamera;
        const lerpSpeed = 0.08;

        cam.radius += (targetRadius - cam.radius) * lerpSpeed;
        cam.target.y += (targetTargetY - cam.target.y) * lerpSpeed;

        // Stop animating when close enough
        if (Math.abs(cam.radius - targetRadius) < 0.01 && Math.abs(cam.target.y - targetTargetY) < 0.01) {
          cam.radius = targetRadius;
          cam.target.y = targetTargetY;
          isAnimating = false;
        }
      }
    });

    // Wheel to cycle through zoom presets
    let wheelCooldown = false;
    previewArea.onWheelObservable.add((evt) => {
      if (previews[side] && !wheelCooldown) {
        // Debounce wheel events
        wheelCooldown = true;
        setTimeout(() => wheelCooldown = false, 200);

        // Scroll down (positive) = zoom out, scroll up (negative) = zoom in
        if (evt.y > 0 && currentZoomIndex > 0) {
          currentZoomIndex--;
        } else if (evt.y < 0 && currentZoomIndex < ZOOM_PRESETS.length - 1) {
          currentZoomIndex++;
        }

        const preset = ZOOM_PRESETS[currentZoomIndex];
        targetRadius = preset.radius;
        targetTargetY = preset.targetY;
        isAnimating = true;
      }
    });

    // Initialize 3D preview
    createMedicPreview(side, previewArea, currentCustomization)
      .then((preview) => {
        previews[side] = preview;
        loadingText.text = "";
        // Apply initial customization
        updatePreview(preview, currentCustomization);
      })
      .catch((err) => {
        console.error(`Failed to load ${side} preview:`, err);
        loadingText.text = "Error";
        loadingText.color = "#ff4444";
      });

    // Add button at bottom of customization panel (row 2)
    const addBtn = Button.CreateSimpleButton(`${playerName}_add`, "+ Add");
    addBtn.width = "95%";
    addBtn.height = "80%";
    addBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    addBtn.color = "white";
    addBtn.background = "#338833";
    addBtn.cornerRadius = 5;
    addBtn.fontSize = 14;
    addBtn.fontWeight = "bold";
    addBtn.onPointerClickObservable.add(() => {
      if (selectionArray.length < 3 && selectedClass) {
        selectionArray.push({
          type: selectedClass,
          customization: selectedClass === "support" ? { ...currentCustomization } : undefined
        });
        updateSelectionDisplay();
        updateStartButton();
        // Close customization panel after adding
        customPanel.isVisible = false;
        selectedClass = null;
      }
    });
    customContainer.addControl(addBtn, 2, 0);

    // Function to open customization for a class
    const openCustomization = (classType: UnitType): void => {
      selectedClass = classType;
      const info = UNIT_INFO[classType];
      classTitle.text = info.name.toUpperCase();
      // Update button text through textBlock property
      const btnText = addBtn.textBlock;
      if (btnText) btnText.text = `+ Add ${info.name}`;
      customPanel.isVisible = true;
    };

    // Create class buttons
    const classTypes: UnitType[] = ["tank", "damage", "support"];
    const classButtons: Button[] = [];

    classTypes.forEach((classType, index) => {
      const btn = Button.CreateSimpleButton(`${playerName}_${classType}`, UNIT_INFO[classType].name);
      btn.width = "95%";
      btn.height = "35px";
      btn.color = "white";
      btn.background = "#333355";
      btn.cornerRadius = 5;
      btn.fontSize = 13;
      btn.onPointerEnterObservable.add(() => {
        const info = UNIT_INFO[classType];
        infoText.text = `${info.name}: HP ${info.hp} | ATK ${info.attack} | Move ${info.moveRange} | Range ${info.attackRange}`;
        infoText.color = "white";
      });
      btn.onPointerOutObservable.add(() => {
        infoText.text = "Hover over a unit type to see stats";
        infoText.color = "#888888";
      });
      btn.onPointerClickObservable.add(() => {
        if (selectionArray.length < 3) {
          openCustomization(classType);
        }
      });
      classButtons.push(btn);
      classButtonRow.addControl(btn, 0, index);  // Add to specific column
    });

    // Clear button (row 4)
    const clearBtn = Button.CreateSimpleButton(`${playerName}_clear`, "Clear All");
    clearBtn.width = "100%";
    clearBtn.height = "100%";
    clearBtn.color = "#ff6666";
    clearBtn.background = "#442222";
    clearBtn.cornerRadius = 5;
    clearBtn.onPointerClickObservable.add(() => {
      selectionArray.length = 0;
      updateSelectionDisplay();
      updateStartButton();
      customPanel.isVisible = false;
      selectedClass = null;
    });
    container.addControl(clearBtn, 4, 0);

    return panel;
  }

  // Helper: option chooser
  function createOptionChooser(label: string, options: string[], defaultIdx: number, onChange: (idx: number) => void): StackPanel {
    const row = new StackPanel();
    row.height = "44px";
    row.paddingLeft = "3px";
    row.paddingRight = "3px";

    const labelText = new TextBlock();
    labelText.text = label;
    labelText.color = "#aaaaaa";
    labelText.fontSize = 11;
    labelText.height = "14px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(labelText);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.height = "24px";
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(btnRow);

    const buttons: Button[] = [];
    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`opt_${label}_${i}`, opt);
      btn.width = "50px";
      btn.height = "22px";
      btn.color = "white";
      btn.background = i === defaultIdx ? "#4488ff" : "#333355";
      btn.cornerRadius = 3;
      btn.fontSize = 10;
      btn.paddingLeft = "2px";
      btn.paddingRight = "2px";
      btn.onPointerClickObservable.add(() => {
        buttons.forEach((b, j) => b.background = j === i ? "#4488ff" : "#333355");
        onChange(i);
      });
      buttons.push(btn);
      btnRow.addControl(btn);
    });

    return row;
  }

  // Helper: color chooser
  function createColorChooser(label: string, colors: string[], defaultIdx: number, onChange: (idx: number) => void): StackPanel {
    const row = new StackPanel();
    row.height = "42px";
    row.paddingLeft = "3px";
    row.paddingRight = "3px";

    const labelText = new TextBlock();
    labelText.text = label;
    labelText.color = "#aaaaaa";
    labelText.fontSize = 11;
    labelText.height = "14px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(labelText);

    const swatchRow = new StackPanel();
    swatchRow.isVertical = false;
    swatchRow.height = "24px";
    swatchRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(swatchRow);

    const swatches: Rectangle[] = [];
    // Show max 8 colors to fit
    const displayColors = colors.slice(0, 8);
    displayColors.forEach((color, i) => {
      const swatch = new Rectangle();
      swatch.width = "14px";
      swatch.height = "14px";
      swatch.background = color;
      swatch.thickness = i === defaultIdx ? 2 : 1;
      swatch.color = i === defaultIdx ? "white" : "#333333";
      swatch.cornerRadius = 2;
      swatch.onPointerClickObservable.add(() => {
        swatches.forEach((s, j) => {
          s.thickness = j === i ? 2 : 1;
          s.color = j === i ? "white" : "#333333";
        });
        onChange(i);
      });
      swatches.push(swatch);
      swatchRow.addControl(swatch);
    });

    return row;
  }

  return scene;
}
