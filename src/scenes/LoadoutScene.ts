import {
  Engine,
  Scene,
  Color4,
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
import { ALL_CLASSES, getClassData, Loadout, UnitSelection, UnitCustomization, UnitClass } from "../types";

// Import centralized config
import {
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  TEAM_COLORS,
  SCENE_BACKGROUNDS,
  UI_COLORS,
  DEFAULT_PLAYER1_COLOR_INDEX,
  DEFAULT_PLAYER2_COLOR_INDEX,
  PREVIEW_CAMERA_ALPHA,
  PREVIEW_CAMERA_BETA,
  PREVIEW_RTT_SIZE,
  PREVIEW_ZOOM_PRESETS,
  PREVIEW_ZOOM_LERP_SPEED,
  PREVIEW_MODEL_OFFSET,
  PREVIEW_MODEL_SCALE,
  MAX_DISPLAY_COLORS,
  UNITS_PER_TEAM,
} from "../config";
import { MUSIC, AUDIO_VOLUMES, LOOP_BUFFER_TIME, DEBUG_SKIP_OFFSET } from "../config";
import { hexToColor3, createMusicPlayer } from "../utils";

export function createLoadoutScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  onStartBattle: (loadout: Loadout) => void
): Scene {
  const scene = new Scene(engine);

  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.loadout;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

  // Loadout music - using centralized audio config
  const music = createMusicPlayer(MUSIC.loadout, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
  music.play();

  // Press S to skip to near end (to test loop behavior)
  const skipHandler = (e: KeyboardEvent) => {
    if (e.key === "s" || e.key === "S") {
      if (music.duration) {
        music.currentTime = Math.max(0, music.duration - DEBUG_SKIP_OFFSET);
      }
    }
  };
  window.addEventListener("keydown", skipHandler);
  scene.onDisposeObservable.add(() => {
    window.removeEventListener("keydown", skipHandler);
  });

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

  // Track selections - using centralized default color indices
  const selections: Loadout = {
    player1: [],
    player2: [],
    player1TeamColor: TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex,
    player2TeamColor: TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex,
  };

  // Track team color UI refresh callbacks
  const teamColorRefreshCallbacks: { left?: () => void; right?: () => void } = {};

  // 3D Preview system using RTT
  interface ModelData {
    meshes: AbstractMesh[];
    animationGroups: AnimationGroup[];
    root: AbstractMesh;
  }

  interface ClassModels {
    male: ModelData;
    female: ModelData;
  }

  interface UnitPreview {
    soldier: ClassModels;
    operator: ClassModels;
    medic: ClassModels;
    rtt: RenderTargetTexture;
    previewCamera: ArcRotateCamera;
    canvas: HTMLCanvasElement;
  }

  const previews: { left?: UnitPreview; right?: UnitPreview } = {};

  // Note: PREVIEW_ZOOM_PRESETS, hexToColor3 are now imported from config/utils

  function updatePreview(preview: UnitPreview | undefined, c: UnitCustomization, unitClass: UnitClass | null): void {
    if (!preview || !unitClass) return;

    // Get models for the selected class
    const classModels = preview[unitClass];

    // Hide all models from other classes
    for (const key of ALL_CLASSES) {
      if (key !== unitClass) {
        preview[key].male.root.setEnabled(false);
        preview[key].female.root.setEnabled(false);
        preview[key].male.animationGroups.forEach(ag => ag.stop());
        preview[key].female.animationGroups.forEach(ag => ag.stop());
      }
    }

    // Show/hide based on body type
    const isMale = c.body === "male";
    const activeModel = isMale ? classModels.male : classModels.female;
    const inactiveModel = isMale ? classModels.female : classModels.male;

    // Hide inactive model, show active
    inactiveModel.root.setEnabled(false);
    activeModel.root.setEnabled(true);

    // Stop inactive animations
    inactiveModel.animationGroups.forEach(ag => ag.stop());

    // Update head visibility (Head_001 through Head_004)
    for (let i = 0; i < 4; i++) {
      const headName = `Head_00${i + 1}`;
      const headMeshes = activeModel.meshes.filter(m => m.name.includes(headName));
      headMeshes.forEach(mesh => mesh.setEnabled(i === c.head));
    }

    // Update weapon visibility and animation based on combat style
    const swordMeshes = activeModel.meshes.filter(m => m.name.toLowerCase().includes("sword"));
    const pistolMeshes = activeModel.meshes.filter(m => m.name.toLowerCase().includes("pistol"));

    const isMelee = c.combatStyle === "melee";
    swordMeshes.forEach(m => m.setEnabled(isMelee));
    pistolMeshes.forEach(m => m.setEnabled(!isMelee));

    // Switch animation based on combat style
    activeModel.animationGroups.forEach(ag => ag.stop());
    const idleAnim = isMelee
      ? activeModel.animationGroups.find(ag => ag.name === "Idle_Sword")
      : activeModel.animationGroups.find(ag => ag.name === "Idle_Gun");
    idleAnim?.start(true);

    // Update materials (skin, hair, eyes) using correct material names
    activeModel.meshes.forEach(mesh => {
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
    activeModel.root.scaling.x = c.handedness === "right" ? -PREVIEW_MODEL_SCALE : PREVIEW_MODEL_SCALE;
  }

  async function createUnitPreview(
    side: "left" | "right",
    previewRect: Rectangle
  ): Promise<UnitPreview> {
    // Position model far away so main camera doesn't see it
    const modelOffset = side === "left" ? -PREVIEW_MODEL_OFFSET : PREVIEW_MODEL_OFFSET;

    // Use square RTT - image will be sized to fill height and clip width
    const rttSize = PREVIEW_RTT_SIZE;

    // Create square RTT
    const rtt = new RenderTargetTexture(`rtt_${side}`, rttSize, scene, false);
    // Use centralized RTT preview background color
    const rttBg = SCENE_BACKGROUNDS.rttPreview;
    rtt.clearColor = new Color4(rttBg.r, rttBg.g, rttBg.b, rttBg.a);
    scene.customRenderTargets.push(rtt);

    // Preview camera settings - using centralized constants
    const camAlpha = PREVIEW_CAMERA_ALPHA;
    const camBeta = PREVIEW_CAMERA_BETA;
    const camRadius = PREVIEW_ZOOM_PRESETS[0].radius;
    const camTargetY = PREVIEW_ZOOM_PRESETS[0].targetY;
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

    // Use layer mask to hide from main camera (0x0FFFFFFF), only show to preview
    const previewLayer = side === "left" ? 0x10000000 : 0x20000000;
    previewCamera.layerMask = previewLayer;

    // Team color - use selected color or default (using centralized indices)
    const teamColorHex = side === "left"
      ? (selections.player1TeamColor || TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex)
      : (selections.player2TeamColor || TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex);
    const teamColor = hexToColor3(teamColorHex);

    // Helper to set up a model
    const setupModel = (result: { meshes: AbstractMesh[]; animationGroups: AnimationGroup[] }): ModelData => {
      const root = result.meshes[0];
      root.position = new Vector3(modelOffset, 0, 0);
      root.scaling = new Vector3(PREVIEW_MODEL_SCALE, PREVIEW_MODEL_SCALE, PREVIEW_MODEL_SCALE);

      // Add meshes to RTT render list and set layer mask
      result.meshes.forEach(m => {
        m.layerMask = previewLayer;
        rtt.renderList?.push(m);
      });

      // Set team color
      result.meshes.forEach(mesh => {
        if (mesh.material && mesh.material.name === "TeamMain") {
          const mat = mesh.material as PBRMaterial;
          mat.albedoColor = teamColor;
        }
      });

      return {
        meshes: result.meshes,
        animationGroups: result.animationGroups,
        root,
      };
    };

    // Load all models (soldier, operator, and medic - male and female)
    const [
      soldierMaleResult, soldierFemaleResult,
      operatorMaleResult, operatorFemaleResult,
      medicMaleResult, medicFemaleResult
    ] = await Promise.all([
      SceneLoader.ImportMeshAsync("", "/models/", "soldier_m.glb", scene),
      SceneLoader.ImportMeshAsync("", "/models/", "soldier_f.glb", scene),
      SceneLoader.ImportMeshAsync("", "/models/", "operator_m.glb", scene),
      SceneLoader.ImportMeshAsync("", "/models/", "operator_f.glb", scene),
      SceneLoader.ImportMeshAsync("", "/models/", "medic_m.glb", scene),
      SceneLoader.ImportMeshAsync("", "/models/", "medic_f.glb", scene),
    ]);

    const soldierMale = setupModel(soldierMaleResult);
    const soldierFemale = setupModel(soldierFemaleResult);
    const operatorMale = setupModel(operatorMaleResult);
    const operatorFemale = setupModel(operatorFemaleResult);
    const medicMale = setupModel(medicMaleResult);
    const medicFemale = setupModel(medicFemaleResult);

    // Hide all models by default (will be shown when class is selected)
    soldierMale.root.setEnabled(false);
    soldierFemale.root.setEnabled(false);
    operatorMale.root.setEnabled(false);
    operatorFemale.root.setEnabled(false);
    medicMale.root.setEnabled(false);
    medicFemale.root.setEnabled(false);

    // Stop all animations
    [
      ...soldierMale.animationGroups, ...soldierFemale.animationGroups,
      ...operatorMale.animationGroups, ...operatorFemale.animationGroups,
      ...medicMale.animationGroups, ...medicFemale.animationGroups
    ].forEach(ag => ag.stop());

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
      // Throttle RTT updates for performance (using centralized constant)
      // Import RTT_UPDATE_FRAME_DIVISOR from config if needed
      if (frameCount % 3 !== 0) return;

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

    const preview: UnitPreview = {
      soldier: { male: soldierMale, female: soldierFemale },
      operator: { male: operatorMale, female: operatorFemale },
      medic: { male: medicMale, female: medicFemale },
      rtt,
      previewCamera,
      canvas,
    };

    return preview;
  }

  // Create player panels
  const player1Panel = createPlayerPanel("Player 1", "#4488ff", selections.player1, "left");
  const player2Panel = createPlayerPanel("Player 2", "#ff8844", selections.player2, "right");

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
    if (selections.player1.length === UNITS_PER_TEAM && selections.player2.length === UNITS_PER_TEAM) {
      onStartBattle(selections);
    }
  });
  gui.addControl(startBtn);

  function updateStartButton(): void {
    const ready = selections.player1.length === UNITS_PER_TEAM && selections.player2.length === UNITS_PER_TEAM;
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
    // Row 0: Player name (30px)
    // Row 1: Team color selector (32px)
    // Row 2: Selection display + Clear button (28px)
    // Row 3: Class buttons (45px)
    // Row 4: Customization panel (takes remaining space)
    container.addRowDefinition(30, true);   // Player name - fixed px
    container.addRowDefinition(32, true);   // Team color selector - fixed px
    container.addRowDefinition(28, true);   // Selection + Clear - fixed px
    container.addRowDefinition(45, true);   // Buttons - fixed px
    container.addRowDefinition(1);          // Custom panel - fill remaining
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

    // Row 1: Team color selector
    const colorRow = new StackPanel();
    colorRow.isVertical = false;
    colorRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    colorRow.height = "28px";
    container.addControl(colorRow, 1, 0);

    const colorLabel = new TextBlock();
    colorLabel.text = "Team:";
    colorLabel.color = "#aaaaaa";
    colorLabel.fontSize = 12;
    colorLabel.width = "45px";
    colorLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    colorLabel.paddingRight = "5px";
    colorRow.addControl(colorLabel);

    // Store color swatch references for updating disabled state
    const colorSwatches: Rectangle[] = [];
    const isPlayerSide = side === "left";

    // Function to get the other player's selected color
    const getOtherPlayerColor = (): string | undefined => {
      return isPlayerSide ? selections.player2TeamColor : selections.player1TeamColor;
    };

    // Function to update this player's team color
    const setTeamColor = (hexColor: string): void => {
      if (isPlayerSide) {
        selections.player1TeamColor = hexColor;
      } else {
        selections.player2TeamColor = hexColor;
      }
    };

    // Function to get this player's current color
    const getTeamColor = (): string | undefined => {
      return isPlayerSide ? selections.player1TeamColor : selections.player2TeamColor;
    };

    // Create color swatches
    TEAM_COLORS.forEach((teamColor) => {
      const swatch = new Rectangle();
      swatch.width = "24px";
      swatch.height = "24px";
      swatch.background = teamColor.hex;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      // Set initial selection state
      const isSelected = getTeamColor() === teamColor.hex;
      const isDisabled = getOtherPlayerColor() === teamColor.hex;
      swatch.thickness = isSelected ? 3 : 1;
      swatch.color = isSelected ? "white" : "#333333";
      swatch.alpha = isDisabled ? 0.3 : 1;

      swatch.onPointerClickObservable.add(() => {
        // Don't allow selecting if other player has this color
        if (getOtherPlayerColor() === teamColor.hex) return;

        // Update selection
        setTeamColor(teamColor.hex);

        // Update all swatches visual state
        refreshColorSwatches();

        // Update the panel border color to match
        panel.color = teamColor.hex;
        nameText.color = teamColor.hex;

        // Update 3D model team color
        updateTeamColorOnModels(teamColor.hex);

        // Notify other panel to refresh its swatches
        const otherSide = isPlayerSide ? "right" : "left";
        if (teamColorRefreshCallbacks[otherSide]) {
          teamColorRefreshCallbacks[otherSide]!();
        }
      });

      colorSwatches.push(swatch);
      colorRow.addControl(swatch);
    });

    // Function to refresh color swatch visual states
    const refreshColorSwatches = (): void => {
      TEAM_COLORS.forEach((teamColor, i) => {
        const swatch = colorSwatches[i];
        const isSelected = getTeamColor() === teamColor.hex;
        const isDisabled = getOtherPlayerColor() === teamColor.hex;
        swatch.thickness = isSelected ? 3 : 1;
        swatch.color = isSelected ? "white" : "#333333";
        swatch.alpha = isDisabled ? 0.3 : 1;
      });
    };

    // Register refresh callback so other panel can update this one
    teamColorRefreshCallbacks[side] = refreshColorSwatches;

    // Function to update team color on 3D models
    const updateTeamColorOnModels = (hexColor: string): void => {
      const preview = previews[side];
      if (!preview) return;

      const teamColor3 = hexToColor3(hexColor);
      const allModels = [
        preview.soldier.male, preview.soldier.female,
        preview.operator.male, preview.operator.female,
        preview.medic.male, preview.medic.female,
      ];

      allModels.forEach(model => {
        model.meshes.forEach(mesh => {
          if (mesh.material && mesh.material.name === "TeamMain") {
            const mat = mesh.material as PBRMaterial;
            mat.albedoColor = teamColor3;
          }
        });
      });
    };

    // Row 2: Selection display + Clear button + Randomize button
    const selectionRow = new Grid();
    selectionRow.width = "100%";
    selectionRow.addColumnDefinition(1);        // Selection text - fill
    selectionRow.addColumnDefinition(55, true); // Clear button - fixed width
    selectionRow.addColumnDefinition(70, true); // Randomize button - fixed width
    selectionRow.addRowDefinition(1);
    container.addControl(selectionRow, 2, 0);

    const selectionDisplay = new TextBlock();
    selectionDisplay.text = "Selected: (choose 3)";
    selectionDisplay.color = "#ff6666";
    selectionDisplay.fontSize = 13;
    selectionDisplay.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    selectionRow.addControl(selectionDisplay, 0, 0);

    // Clear button next to selection
    const clearBtn = Button.CreateSimpleButton(`${playerName}_clear`, "Clear");
    clearBtn.width = "100%";
    clearBtn.height = "22px";
    clearBtn.color = "#ff6666";
    clearBtn.background = "#442222";
    clearBtn.cornerRadius = 3;
    clearBtn.fontSize = 11;
    clearBtn.onPointerClickObservable.add(() => {
      selectionArray.length = 0;
      updateSelectionDisplay();
      updateStartButton();
      customPanel.isVisible = false;
      selectedClass = null;
    });
    selectionRow.addControl(clearBtn, 0, 1);

    // Randomize button - generates 3 random units
    const randomizeBtn = Button.CreateSimpleButton(`${playerName}_random`, "Random");
    randomizeBtn.width = "100%";
    randomizeBtn.height = "22px";
    randomizeBtn.color = "#66aaff";
    randomizeBtn.background = "#224466";
    randomizeBtn.cornerRadius = 3;
    randomizeBtn.fontSize = 11;
    randomizeBtn.onPointerClickObservable.add(() => {
      // Show loading state
      if (randomizeBtn.textBlock) {
        randomizeBtn.textBlock.text = "...";
      }
      randomizeBtn.background = "#335577";

      // Use setTimeout to allow UI to update before processing
      setTimeout(() => {
        // Clear existing selections
        selectionArray.length = 0;

        // Generate 3 random units
        for (let i = 0; i < UNITS_PER_TEAM; i++) {
          const randomClass = ALL_CLASSES[Math.floor(Math.random() * ALL_CLASSES.length)];
          const randomCustomization: UnitCustomization = {
            body: Math.random() > 0.5 ? "male" : "female",
            combatStyle: Math.random() > 0.5 ? "ranged" : "melee",
            handedness: Math.random() > 0.5 ? "right" : "left",
            head: Math.floor(Math.random() * 4),
            hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
            eyeColor: Math.floor(Math.random() * EYE_COLORS.length),
            skinTone: Math.floor(Math.random() * SKIN_TONES.length),
          };
          selectionArray.push({
            unitClass: randomClass,
            customization: randomCustomization,
          });
        }

        updateSelectionDisplay();
        updateStartButton();
        customPanel.isVisible = false;
        selectedClass = null;

        // Restore button
        if (randomizeBtn.textBlock) {
          randomizeBtn.textBlock.text = "Random";
        }
        randomizeBtn.background = "#224466";
      }, 50);
    });
    selectionRow.addControl(randomizeBtn, 0, 2);

    const updateSelectionDisplay = (): void => {
      if (selectionArray.length === 0) {
        selectionDisplay.text = "Selected: (choose 3)";
        selectionDisplay.color = "#ff6666";
      } else {
        const names = selectionArray.map(u => getClassData(u.unitClass).name);
        selectionDisplay.text = `Selected: ${names.join(", ")}`;
        selectionDisplay.color = selectionArray.length === UNITS_PER_TEAM ? UI_COLORS.textSuccess : UI_COLORS.textError;
      }
    };

    // Class buttons row - spread across using Grid (row 3)
    const classButtonRow = new Grid();
    classButtonRow.width = "100%";
    classButtonRow.addColumnDefinition(1/3);
    classButtonRow.addColumnDefinition(1/3);
    classButtonRow.addColumnDefinition(1/3);
    classButtonRow.addRowDefinition(1);
    container.addControl(classButtonRow, 3, 0);

    // Track which class is currently selected for customization
    let selectedClass: UnitClass | null = null;

    // Current customization state
    const currentCustomization: UnitCustomization = {
      body: "male",
      combatStyle: "ranged",
      handedness: "right",
      head: 0,
      hairColor: 0,
      eyeColor: 2,  // Brown default
      skinTone: 4,  // Medium skin tone default
    };

    // Customization panel (hidden by default) - row 4, fills remaining space
    const customPanel = new Rectangle();
    customPanel.width = "100%";
    customPanel.height = "100%";
    customPanel.background = "#2a2a4e";
    customPanel.cornerRadius = 5;
    customPanel.thickness = 1;
    customPanel.color = "#555588";
    customPanel.isVisible = false;
    container.addControl(customPanel, 4, 0);

    // Use Grid for customization panel layout
    const customContainer = new Grid();
    customContainer.width = "98%";
    customContainer.height = "100%";
    customContainer.addRowDefinition(0.10);  // Title - 10%
    customContainer.addRowDefinition(0.90);  // Options + Preview + Add button - 90%
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
      updatePreview(previews[side], currentCustomization, selectedClass);
      updateDescription();
    });
    controlsGrid.addControl(bodyChooser, 0, 0);

    const headChooser = createOptionChooser("Head", ["1", "2", "3", "4"], 0, (idx) => {
      currentCustomization.head = idx;
      updatePreview(previews[side], currentCustomization, selectedClass);
    });
    controlsGrid.addControl(headChooser, 1, 0);

    const styleChooser = createOptionChooser("Style", ["Ranged", "Melee"], 0, (idx) => {
      currentCustomization.combatStyle = idx === 0 ? "ranged" : "melee";
      updatePreview(previews[side], currentCustomization, selectedClass);
      updateDescription();
    });
    controlsGrid.addControl(styleChooser, 2, 0);

    const handChooser = createOptionChooser("Hand", ["Right", "Left"], 0, (idx) => {
      currentCustomization.handedness = idx === 0 ? "right" : "left";
      updatePreview(previews[side], currentCustomization, selectedClass);
    });
    controlsGrid.addControl(handChooser, 3, 0);

    // Right column controls
    const hairChooser = createColorChooser("Hair", HAIR_COLORS, 0, (idx) => {
      currentCustomization.hairColor = idx;
      updatePreview(previews[side], currentCustomization, selectedClass);
    });
    controlsGrid.addControl(hairChooser, 0, 1);

    const eyesChooser = createColorChooser("Eyes", EYE_COLORS, 2, (idx) => {
      currentCustomization.eyeColor = idx;
      updatePreview(previews[side], currentCustomization, selectedClass);
    });
    controlsGrid.addControl(eyesChooser, 1, 1);

    const skinChooser = createColorChooser("Skin", SKIN_TONES, 4, (idx) => {
      currentCustomization.skinTone = idx;
      updatePreview(previews[side], currentCustomization, selectedClass);
    });
    controlsGrid.addControl(skinChooser, 2, 1);

    // Copy text below controls - dynamic based on class, gender, and combat style
    const descriptionText = new TextBlock();
    descriptionText.text = "";
    descriptionText.color = "#cccccc";
    descriptionText.fontSize = 11;
    descriptionText.textWrapping = true;
    descriptionText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descriptionText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    descriptionText.paddingTop = "10px";
    descriptionText.paddingLeft = "5px";
    descriptionText.paddingRight = "5px";
    optionsCol.addControl(descriptionText, 1, 0);

    // Generate dynamic description based on class, body, and combat style
    function updateDescription(): void {
      if (!selectedClass) {
        descriptionText.text = "";
        return;
      }

      const isMale = currentCustomization.body === "male";
      const pronoun = isMale ? "he" : "she";
      const pronounObj = isMale ? "him" : "her";
      const isMelee = currentCustomization.combatStyle === "melee";

      let fluff = "";
      let ability = "";
      let weapon = "";

      if (selectedClass === "soldier") {
        fluff = `Soldiers are the backbone of settlement defense. Drawn from Earth's militaries and security forces, they volunteered to protect humanity's last hope. Where others see danger, ${pronoun} sees a perimeter to hold.`;
        ability = `[COVER]\nWhen activated, enemies that finish any action in a covered square are counter attacked, interrupting their remaining actions. Concealed enemies do not trigger Cover. Cover ends at the start of this unit's next turn, after a counter attack, or if this unit is hit.`;
      } else if (selectedClass === "operator") {
        fluff = `Operators work beyond the settlement walls where survival demands cunning over strength. Whether scouting hostile terrain or eliminating threats before they reach the settlement, ${pronoun} is the unseen blade that keeps the settlement safe.`;
        ability = `[CONCEAL]\nWhen activated, the next incoming hit is completely negated, and ${pronoun} won't trigger enemy Cover. Allows ${pronounObj} to survive otherwise fatal encounters or slip past defended positions.`;
      } else if (selectedClass === "medic") {
        fluff = `In a settlement where every life is precious, Medics are revered. Trained in both trauma care and combat medicine, ${pronoun} keeps the team fighting when the odds turn grim.`;
        ability = `[HEAL]\nSelect self or an ally to restore HP. The difference between victory and defeat often comes down to keeping the right person standing.`;
      }

      if (isMelee) {
        weapon = `[MELEE]\nDeals 2x damage. Attacks all 8 adjacent spaces within line of sight. Best for holding chokepoints.`;
      } else {
        weapon = `[RANGED]\nAttacks anywhere within line of sight, except the 8 adjacent spaces. Optimal for controlling the battlefield from a distance.`;
      }

      descriptionText.text = `${fluff}\n\n${ability}\n\n${weapon}`;
    }

    // Right column: Preview + Add button
    const rightCol = new Grid();
    rightCol.width = "100%";
    rightCol.height = "100%";
    rightCol.addRowDefinition(1);           // Preview - fill
    rightCol.addRowDefinition(45, true);    // Add button - fixed height
    rightCol.addColumnDefinition(1);
    customGrid.addControl(rightCol, 0, 1);

    // Preview area
    const previewArea = new Rectangle();
    previewArea.width = "95%";
    previewArea.height = "95%";
    previewArea.background = "#3a3a4a";
    previewArea.thickness = 1;
    previewArea.color = "#555577";
    previewArea.cornerRadius = 5;
    rightCol.addControl(previewArea, 0, 0);

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

    // Zoom preset cycling with smooth animation (explicit types to avoid literal type inference)
    let currentZoomIndex = 0;
    let targetRadius: number = PREVIEW_ZOOM_PRESETS[0].radius;
    let targetTargetY: number = PREVIEW_ZOOM_PRESETS[0].targetY;
    let isAnimating = false;

    // Animate camera towards target values
    scene.onBeforeRenderObservable.add(() => {
      if (previews[side] && isAnimating) {
        const cam = previews[side]!.previewCamera;
        const lerpSpeed = PREVIEW_ZOOM_LERP_SPEED;

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
        } else if (evt.y < 0 && currentZoomIndex < PREVIEW_ZOOM_PRESETS.length - 1) {
          currentZoomIndex++;
        }

        const preset = PREVIEW_ZOOM_PRESETS[currentZoomIndex];
        targetRadius = preset.radius;
        targetTargetY = preset.targetY;
        isAnimating = true;
      }
    });

    // Initialize 3D preview
    createUnitPreview(side, previewArea)
      .then((preview) => {
        previews[side] = preview;
        loadingText.text = "";
        // Models start hidden - will be shown when class is selected
        if (selectedClass) {
          updatePreview(preview, currentCustomization, selectedClass);
        }
      })
      .catch((err) => {
        console.error(`Failed to load ${side} preview:`, err);
        loadingText.text = "Error";
        loadingText.color = "#ff4444";
      });

    // Add button under preview
    const addBtn = Button.CreateSimpleButton(`${playerName}_add`, "+ Add");
    addBtn.width = "95%";
    addBtn.height = "38px";
    addBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    addBtn.color = "white";
    addBtn.background = "#338833";
    addBtn.cornerRadius = 5;
    addBtn.fontSize = 14;
    addBtn.fontWeight = "bold";
    addBtn.onPointerClickObservable.add(() => {
      if (selectionArray.length < UNITS_PER_TEAM && selectedClass) {
        selectionArray.push({
          unitClass: selectedClass,
          customization: { ...currentCustomization }
        });
        updateSelectionDisplay();
        updateStartButton();
        // Close customization panel after adding
        customPanel.isVisible = false;
        selectedClass = null;
      }
    });
    rightCol.addControl(addBtn, 1, 0);

    // Function to open customization for a class
    const openCustomization = (unitClass: UnitClass): void => {
      selectedClass = unitClass;
      const classData = getClassData(unitClass);
      classTitle.text = classData.name.toUpperCase();
      // Update button text through textBlock property
      const btnText = addBtn.textBlock;
      if (btnText) btnText.text = `+ Add ${classData.name}`;
      customPanel.isVisible = true;
      updateDescription();
      // Show the correct model for the selected class
      updatePreview(previews[side], currentCustomization, selectedClass);
    };

    // Create class buttons
    const classButtons: Button[] = [];

    ALL_CLASSES.forEach((unitClass, index) => {
      const classData = getClassData(unitClass);
      const btn = Button.CreateSimpleButton(`${playerName}_${unitClass}`, classData.name);
      btn.width = "95%";
      btn.height = "35px";
      btn.color = "white";
      btn.background = "#333355";
      btn.cornerRadius = 5;
      btn.fontSize = 13;
      btn.onPointerEnterObservable.add(() => {
        infoText.text = `${classData.name}: HP ${classData.hp} | ATK ${classData.attack} | Move ${classData.moveRange} | Range ${classData.attackRange}`;
        infoText.color = "white";
      });
      btn.onPointerOutObservable.add(() => {
        infoText.text = "Hover over a unit type to see stats";
        infoText.color = "#888888";
      });
      btn.onPointerClickObservable.add(() => {
        if (selectionArray.length < UNITS_PER_TEAM) {
          openCustomization(unitClass);
        }
      });
      classButtons.push(btn);
      classButtonRow.addControl(btn, 0, index);  // Add to specific column
    });

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

  // Helper: color chooser (accepts readonly arrays from config)
  function createColorChooser(label: string, colors: readonly string[], defaultIdx: number, onChange: (idx: number) => void): StackPanel {
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
    // Show max colors that fit in UI (using centralized constant)
    const displayColors = colors.slice(0, MAX_DISPLAY_COLORS);
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
