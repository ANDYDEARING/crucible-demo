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
  PointerEventTypes,
  RenderTargetTexture,
  PBRMaterial,
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
  ScrollViewer,
  Image,
} from "@babylonjs/gui";
import { ALL_CLASSES, getClassData, Loadout, UnitSelection, UnitClass, UnitCustomization } from "../types";
import { getGameMode } from "../main";

// Import centralized config
import {
  TEAM_COLORS,
  SCENE_BACKGROUNDS,
  DEFAULT_PLAYER1_COLOR_INDEX,
  DEFAULT_PLAYER2_COLOR_INDEX,
  UNITS_PER_TEAM,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
} from "../config";
import { MUSIC, AUDIO_VOLUMES, LOOP_BUFFER_TIME, DEBUG_SKIP_OFFSET } from "../config";
import { createMusicPlayer, hexToColor3, hexToColor4 } from "../utils";

// ============================================
// COLOR PALETTE (matches title screen aesthetic)
// ============================================
const COLORS = {
  // Backgrounds
  bgDeep: "#0a0a12",
  bgPanel: "#14110f",
  bgUnitRow: "#1a1714",
  bgButton: "#2a2420",
  bgButtonHover: "#3a3025",
  bgPreview: "#0a0a0a", // Near-black background for RTT previews

  // Borders & dividers
  borderWarm: "#3a2a1a",
  borderLight: "#5a4a35",

  // Text
  textPrimary: "#e8c8a0",
  textSecondary: "#a08060",
  textMuted: "#706050",

  // Accents
  accentOrange: "#ff9650",
  accentOrangeDeep: "#c06020",
  accentBlue: "#4080cc",
  accentBlueDeep: "#305080",

  // Interactive states
  selected: "#c06020",
  selectedGlow: "rgba(255, 150, 80, 0.3)",
  disabled: "#404040",
  success: "#508040",
  successHover: "#609050",
};

// Greek letters for unit designations
const UNIT_DESIGNATIONS = ["Δ", "Ψ", "Ω"]; // Delta, Psi, Omega

// Class info
const CLASS_INFO: Record<UnitClass, { name: string; tagline: string; abilityName: string; abilityDesc: string }> = {
  soldier: {
    name: "Soldier",
    tagline: "The settlement's last line of defense",
    abilityName: "COVER",
    abilityDesc: "Activate to counter enemies in range, potentially interrupting their move",
  },
  operator: {
    name: "Operator",
    tagline: "A ghost in the chaos of battle",
    abilityName: "CONCEAL",
    abilityDesc: "Activate to negate the next incoming hit and avoid triggering enemy Cover",
  },
  medic: {
    name: "Medic",
    tagline: "Keeping hope alive under fire",
    abilityName: "HEAL",
    abilityDesc: "Restore HP to self or adjacent allies (diagonals require line of sight)",
  },
};

// Boost info - values can be adjusted later
const BOOST_INFO = [
  { name: "Tough", stat: "HP", value: 25, desc: "This unit has an extra" },
  { name: "Deadly", stat: "Damage", value: 25, desc: "This unit deals an extra" },
  { name: "Quick", stat: "Speed", value: 25, desc: "This unit has" },
];

// Helper to format boost copy text
function getBoostCopy(boost: typeof BOOST_INFO[0]): string {
  return `[${boost.name.toUpperCase()}]: ${boost.desc} +${boost.value}% ${boost.stat}`;
}

// Weapon info
const WEAPON_INFO = {
  ranged: {
    label: "Ranged",
    desc: "This unit can attack any unit that is not adjacent (including diagonals) and in its Line of Sight",
  },
  melee: {
    label: "Melee",
    desc: "This unit deals 2x damage and attacks adjacent spaces only",
  },
};

// Helper to get full unit description
function getUnitDescription(unitClass: UnitClass, boostIndex: number, weaponStyle: "ranged" | "melee"): string {
  const cls = CLASS_INFO[unitClass];
  const boost = BOOST_INFO[boostIndex];
  const weapon = WEAPON_INFO[weaponStyle];

  return [
    `${cls.name}: ${cls.tagline}`,
    `[${cls.abilityName}]: ${cls.abilityDesc}`,
    getBoostCopy(boost),
    `[${weapon.label.toUpperCase()}]: ${weapon.desc}`,
  ].join("\n\n");
}

export function createLoadoutScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  onStartBattle: (loadout: Loadout) => void
): Scene {
  const scene = new Scene(engine);

  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.loadout;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

  // ============================================
  // RESPONSIVE SIZING
  // ============================================
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();
  const isLandscapePhone = screenHeight < 500 && screenWidth < 1024;
  const isMobile = screenWidth < 600 && !isLandscapePhone;
  const isTablet = (screenWidth >= 600 && screenWidth < 1024) || isLandscapePhone;

  // Touch-friendly button heights (44px minimum for mobile)
  const buttonHeight = isMobile ? 44 : isTablet ? 46 : 48;
  const smallButtonHeight = isMobile ? 40 : isTablet ? 42 : 44;
  const fontSize = isMobile ? 13 : isTablet ? 14 : 15;
  const smallFontSize = isMobile ? 11 : isTablet ? 12 : 13;
  const tinyFontSize = isMobile ? 10 : isTablet ? 11 : 12;
  const headerFontSize = isMobile ? 20 : isTablet ? 24 : 26;
  // Unit row: 3 rows of buttons + padding
  const unitRowHeight = isMobile ? 160 : isTablet ? 180 : 200;
  const panelWidth = isMobile ? "98%" : isTablet ? "94%" : "85%";
  const isDesktop = screenWidth >= 1024;

  // Loadout music
  const music = createMusicPlayer(MUSIC.loadout, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
  music.play();

  // Debug skip key
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

  // Camera setup for 3D preview
  const camera = new ArcRotateCamera("cam", Math.PI / 2, Math.PI / 2.5, isDesktop ? 8 : 4, new Vector3(0, 0.8, 0), scene);
  // Don't attach camera controls - they interfere with UI scrolling
  // camera.attachControl(_canvas, true);
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 12;
  scene.activeCamera = camera;

  const light = new HemisphericLight("light", new Vector3(0, 1, 0.5), scene);
  light.intensity = 1.2;

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Get game mode
  const { mode: gameMode, humanTeam } = getGameMode();

  const selections: Loadout = {
    player1: [],
    player2: [],
    player1TeamColor: TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex,
    player2TeamColor: TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex,
    gameMode,
    humanTeam,
  };

  // Track team color refresh callbacks
  const teamColorRefreshCallbacks: { player1?: () => void; player2?: () => void } = {};

  // Track preview refresh callbacks (called when team color changes)
  const previewRefreshCallbacks: { player1: (() => void)[]; player2: (() => void)[] } = {
    player1: [],
    player2: [],
  };

  // ============================================
  // MAIN LAYOUT - Custom drag-to-scroll
  // ============================================
  const scrollViewer = new ScrollViewer("mainScroll");
  scrollViewer.width = "100%";
  scrollViewer.height = "100%";
  scrollViewer.thickness = 0;
  scrollViewer.barSize = 0; // Hide scrollbar
  scrollViewer.barColor = "transparent";
  scrollViewer.wheelPrecision = 0.05;
  gui.addControl(scrollViewer);

  // Custom drag-to-scroll implementation using scene-level events
  let isDragging = false;
  let lastPointerY = 0;

  scene.onPointerObservable.add((pointerInfo) => {
    const evt = pointerInfo.event;

    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
      isDragging = true;
      lastPointerY = evt.clientY;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERUP) {
      isDragging = false;
    }

    if (pointerInfo.type === PointerEventTypes.POINTERMOVE && isDragging) {
      const deltaY = lastPointerY - evt.clientY;
      lastPointerY = evt.clientY;

      const contentHeight = mainStack.heightInPixels;
      const viewportHeight = scrollViewer.heightInPixels;
      const maxScroll = contentHeight - viewportHeight;

      if (maxScroll > 0) {
        const scrollDelta = deltaY / maxScroll;
        const newScroll = Math.max(0, Math.min(1, scrollViewer.verticalBar.value + scrollDelta));
        scrollViewer.verticalBar.value = newScroll;
      }
    }
  });

  const mainStack = new StackPanel("mainStack");
  mainStack.width = "100%";
  mainStack.isVertical = true;
  mainStack.paddingTop = "15px";
  mainStack.paddingBottom = "90px"; // Space for start button
  scrollViewer.addControl(mainStack);

  // ============================================
  // START BUTTON (fixed at bottom)
  // ============================================
  const startBtnContainer = new Rectangle("startBtnContainer");
  startBtnContainer.width = "100%";
  startBtnContainer.height = "80px";
  startBtnContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  startBtnContainer.background = COLORS.bgDeep + "ee";
  startBtnContainer.thickness = 0;
  gui.addControl(startBtnContainer);

  const startBtn = Button.CreateSimpleButton("startBattle", "S T A R T   B A T T L E");
  startBtn.width = isMobile ? "80%" : isTablet ? "50%" : "300px";
  startBtn.height = `${buttonHeight + 10}px`;
  startBtn.color = COLORS.textPrimary;
  startBtn.background = COLORS.disabled;
  startBtn.cornerRadius = 6;
  startBtn.fontSize = fontSize + 2;
  startBtn.fontFamily = "'Bebas Neue', sans-serif";
  startBtn.isEnabled = false;
  startBtn.alpha = 0.5;
  startBtn.onPointerClickObservable.add(() => {
    if (isReadyToStart()) {
      onStartBattle(selections);
    }
  });
  startBtnContainer.addControl(startBtn);

  function isReadyToStart(): boolean {
    return selections.player1.length === UNITS_PER_TEAM && selections.player2.length === UNITS_PER_TEAM;
  }

  function updateStartButton(): void {
    const ready = isReadyToStart();
    startBtn.isEnabled = ready;
    startBtn.alpha = ready ? 1 : 0.5;
    startBtn.background = ready ? COLORS.success : COLORS.disabled;
    if (ready) {
      startBtn.onPointerEnterObservable.clear();
      startBtn.onPointerOutObservable.clear();
      startBtn.onPointerEnterObservable.add(() => {
        startBtn.background = COLORS.successHover;
      });
      startBtn.onPointerOutObservable.add(() => {
        startBtn.background = COLORS.success;
      });
    }
  }

  // Player names for PvE
  const player1Name = gameMode === "local-pve" && humanTeam !== "player1" ? "Computer" : "Player 1";
  const player2Name = gameMode === "local-pve" && humanTeam !== "player2" ? "Computer" : "Player 2";

  // Create both player panels
  createPlayerPanel(player1Name, "player1", selections.player1, mainStack);

  // Separator
  const separator = new Rectangle("separator");
  separator.width = panelWidth;
  separator.height = "2px";
  separator.background = COLORS.borderWarm;
  separator.thickness = 0;
  mainStack.addControl(separator);

  createPlayerPanel(player2Name, "player2", selections.player2, mainStack);

  // ============================================
  // PLAYER PANEL
  // ============================================
  function createPlayerPanel(
    playerName: string,
    playerId: "player1" | "player2",
    selectionArray: UnitSelection[],
    parent: StackPanel
  ): void {
    const defaultColor = playerId === "player1"
      ? TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex
      : TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex;

    const panelHeight = unitRowHeight * UNITS_PER_TEAM + 80;

    const panel = new Rectangle(`${playerId}Panel`);
    panel.width = panelWidth;
    panel.height = `${panelHeight}px`;
    panel.background = COLORS.bgPanel;
    panel.cornerRadius = 8;
    panel.thickness = 2;
    panel.color = defaultColor;
    panel.paddingTop = "10px";
    panel.paddingBottom = "10px";
    parent.addControl(panel);

    const panelStack = new StackPanel(`${playerId}Stack`);
    panelStack.width = "100%";
    panelStack.isVertical = true;
    panel.addControl(panelStack);

    // Header row: Player name + Team color
    const headerRow = new Grid(`${playerId}Header`);
    headerRow.width = "95%";
    headerRow.height = `${buttonHeight + 10}px`;
    headerRow.addColumnDefinition(0.4);
    headerRow.addColumnDefinition(0.6);
    headerRow.addRowDefinition(1);
    panelStack.addControl(headerRow);

    const nameText = new TextBlock(`${playerId}Name`);
    nameText.text = playerName.toUpperCase();
    nameText.color = defaultColor;
    nameText.fontSize = headerFontSize;
    nameText.fontFamily = "'Bebas Neue', sans-serif";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.paddingLeft = "10px";
    headerRow.addControl(nameText, 0, 0);

    // Team color selector
    const colorRow = new StackPanel(`${playerId}ColorRow`);
    colorRow.isVertical = false;
    colorRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    colorRow.paddingRight = "10px";
    headerRow.addControl(colorRow, 0, 1);

    const colorLabel = new TextBlock();
    colorLabel.text = "TEAM";
    colorLabel.color = COLORS.textMuted;
    colorLabel.fontSize = smallFontSize;
    colorLabel.width = "45px";
    colorRow.addControl(colorLabel);

    const colorSwatches: Rectangle[] = [];

    const getOtherColor = (): string => {
      return (playerId === "player1" ? selections.player2TeamColor : selections.player1TeamColor) ?? "";
    };

    const getThisColor = (): string => {
      return (playerId === "player1" ? selections.player1TeamColor : selections.player2TeamColor) ?? "";
    };

    const setThisColor = (hex: string): void => {
      if (playerId === "player1") {
        selections.player1TeamColor = hex;
      } else {
        selections.player2TeamColor = hex;
      }
    };

    TEAM_COLORS.forEach((teamColor) => {
      const swatchSize = isMobile ? 28 : 24;
      const swatch = new Rectangle();
      swatch.width = `${swatchSize}px`;
      swatch.height = `${swatchSize}px`;
      swatch.background = teamColor.hex;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      const isSelected = getThisColor() === teamColor.hex;
      const isDisabled = getOtherColor() === teamColor.hex;
      swatch.thickness = isSelected ? 3 : 1;
      swatch.color = isSelected ? "white" : COLORS.borderWarm;
      swatch.alpha = isDisabled ? 0.3 : 1;

      swatch.onPointerClickObservable.add(() => {
        if (getOtherColor() === teamColor.hex) return;
        setThisColor(teamColor.hex);
        refreshColorSwatches();
        panel.color = teamColor.hex;
        nameText.color = teamColor.hex;

        // Refresh previews for this player's units
        previewRefreshCallbacks[playerId].forEach(cb => cb());

        const otherPlayerId = playerId === "player1" ? "player2" : "player1";
        teamColorRefreshCallbacks[otherPlayerId]?.();
      });

      colorSwatches.push(swatch);
      colorRow.addControl(swatch);
    });

    const refreshColorSwatches = (): void => {
      TEAM_COLORS.forEach((teamColor, i) => {
        const swatch = colorSwatches[i];
        const isSelected = getThisColor() === teamColor.hex;
        const isDisabled = getOtherColor() === teamColor.hex;
        swatch.thickness = isSelected ? 3 : 1;
        swatch.color = isSelected ? "white" : COLORS.borderWarm;
        swatch.alpha = isDisabled ? 0.3 : 1;
      });
    };

    teamColorRefreshCallbacks[playerId] = refreshColorSwatches;

    // Unit rows container
    const unitsContainer = new StackPanel(`${playerId}Units`);
    unitsContainer.width = "100%";
    unitsContainer.isVertical = true;
    unitsContainer.paddingTop = "5px";
    unitsContainer.paddingBottom = "10px";
    panelStack.addControl(unitsContainer);

    // Create 3 unit selection rows
    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      createUnitRow(i, playerId, selectionArray, unitsContainer);
    }
  }

  // ============================================
  // APPEARANCE EDITOR OVERLAY
  // ============================================
  const appearanceOptionButtons: Map<string, Button[]> = new Map();
  const appearanceColorSwatches: Map<string, Rectangle[]> = new Map();

  let editingUnit: { playerId: string; unitIndex: number; selectionArray: UnitSelection[] } | null = null;
  let editingCustomization: UnitCustomization = {
    body: "male",
    combatStyle: "ranged",
    handedness: "right",
    head: 0,
    hairColor: 0,
    eyeColor: 2,
    skinTone: 4,
  };

  // RTT-based preview for appearance editor
  let editorPreviewMesh: AbstractMesh | null = null;
  let editorPreviewMeshes: AbstractMesh[] = [];
  let editorPreviewAnimations: AnimationGroup[] = [];
  let editorLoadedModelKey = "";

  // RTT setup for appearance editor preview
  const editorRttSize = 512;
  const editorRtt = new RenderTargetTexture("editorRtt", editorRttSize, scene, false);
  editorRtt.clearColor = hexToColor4(COLORS.bgPreview); // Dark warm background
  scene.customRenderTargets.push(editorRtt);

  // Preview camera for editor
  const editorPreviewCamera = new ArcRotateCamera(
    "editorPreviewCam",
    Math.PI / 2 + 0.2,
    Math.PI / 2.3,
    2.8,
    new Vector3(0, 0.95, 0),
    scene
  );
  editorRtt.activeCamera = editorPreviewCamera;

  // Force square aspect ratio
  const editorOriginalGetEngine = editorPreviewCamera.getEngine.bind(editorPreviewCamera);
  editorPreviewCamera.getEngine = () => {
    const eng = editorOriginalGetEngine();
    return { ...eng, getAspectRatio: () => 1 } as any;
  };

  // Unique layer mask for editor preview
  const editorLayerMask = 0x20000000;
  editorPreviewCamera.layerMask = editorLayerMask;

  // Canvas for RTT pixels
  const editorCanvas = document.createElement("canvas");
  editorCanvas.width = editorRttSize;
  editorCanvas.height = editorRttSize;
  const editorCtx = editorCanvas.getContext("2d")!;

  // GUI Image for editor preview (will be added to previewArea)
  const editorPreviewImage = new Image("editorPreviewImg", "");
  editorPreviewImage.stretch = Image.STRETCH_UNIFORM;

  // Update canvas from RTT
  let editorFrameCount = 0;
  editorRtt.onAfterRenderObservable.add(() => {
    editorFrameCount++;
    if (editorFrameCount % 3 !== 0) return;

    editorRtt.readPixels()?.then((buffer) => {
      if (!buffer) return;
      const pixels = new Uint8Array(buffer.buffer);
      const imageData = editorCtx.createImageData(editorRttSize, editorRttSize);

      for (let y = 0; y < editorRttSize; y++) {
        for (let x = 0; x < editorRttSize; x++) {
          const srcIdx = ((editorRttSize - 1 - y) * editorRttSize + x) * 4;
          const dstIdx = (y * editorRttSize + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }
      editorCtx.putImageData(imageData, 0, 0);
      editorPreviewImage.source = editorCanvas.toDataURL();
    });
  });

  function createAppearanceOption(
    label: string,
    options: string[],
    defaultIdx: number,
    onChange: (idx: number) => void
  ): StackPanel {
    const container = new StackPanel(`appearance_${label}`);
    container.width = "100%";
    container.isVertical = true;
    container.paddingTop = isMobile ? "6px" : "12px";
    container.paddingBottom = isMobile ? "6px" : "12px";
    container.paddingLeft = isMobile ? "15px" : "25px";
    container.paddingRight = isMobile ? "15px" : "25px";

    const labelText = new TextBlock();
    labelText.text = label.toUpperCase();
    labelText.color = COLORS.textMuted;
    labelText.fontSize = isMobile ? 10 : smallFontSize;
    labelText.height = isMobile ? "18px" : "24px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(labelText);

    const editorBtnHeight = isMobile ? 32 : smallButtonHeight;
    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    btnRow.height = `${editorBtnHeight + 4}px`;
    container.addControl(btnRow);

    const buttons: Button[] = [];
    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`${label}_${i}`, opt);
      btn.width = `${Math.max(isMobile ? 50 : 60, opt.length * (isMobile ? 10 : 12) + 16)}px`;
      btn.height = `${editorBtnHeight}px`;
      btn.color = COLORS.textPrimary;
      btn.background = i === defaultIdx ? COLORS.selected : COLORS.bgButton;
      btn.cornerRadius = 4;
      btn.fontSize = isMobile ? 10 : smallFontSize;
      btn.paddingLeft = "3px";
      btn.paddingRight = "3px";
      btn.thickness = 1;

      btn.onPointerEnterObservable.add(() => {
        if (buttons.indexOf(btn) !== buttons.findIndex(b => b.background === COLORS.selected)) {
          btn.background = COLORS.bgButtonHover;
        }
      });
      btn.onPointerOutObservable.add(() => {
        const isSelected = btn.background === COLORS.selected;
        if (!isSelected) btn.background = COLORS.bgButton;
      });

      btn.onPointerClickObservable.add(() => {
        buttons.forEach((b, j) => {
          b.background = j === i ? COLORS.selected : COLORS.bgButton;
        });
        onChange(i);
        updateEditorPreview();
      });

      buttons.push(btn);
      btnRow.addControl(btn);
    });

    appearanceOptionButtons.set(label, buttons);
    return container;
  }

  function createColorOption(
    label: string,
    colors: readonly string[],
    defaultIdx: number,
    onChange: (idx: number) => void
  ): StackPanel {
    const container = new StackPanel(`appearance_${label}`);
    container.width = "100%";
    container.isVertical = true;
    container.paddingTop = isMobile ? "6px" : "12px";
    container.paddingBottom = isMobile ? "6px" : "12px";
    container.paddingLeft = isMobile ? "15px" : "25px";
    container.paddingRight = isMobile ? "15px" : "25px";

    const labelText = new TextBlock();
    labelText.text = label.toUpperCase();
    labelText.color = COLORS.textMuted;
    labelText.fontSize = isMobile ? 10 : smallFontSize;
    labelText.height = isMobile ? "18px" : "24px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(labelText);

    const swatchRow = new StackPanel();
    swatchRow.isVertical = false;
    swatchRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    const swatchSize = isMobile ? 26 : 28;
    swatchRow.height = `${swatchSize + 4}px`;
    container.addControl(swatchRow);

    const swatches: Rectangle[] = [];

    colors.forEach((color, i) => {
      const swatch = new Rectangle();
      swatch.width = `${swatchSize}px`;
      swatch.height = `${swatchSize}px`;
      swatch.background = color;
      swatch.thickness = i === defaultIdx ? 3 : 1;
      swatch.color = i === defaultIdx ? COLORS.accentOrange : COLORS.borderWarm;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      swatch.onPointerClickObservable.add(() => {
        swatches.forEach((s, j) => {
          s.thickness = j === i ? 3 : 1;
          s.color = j === i ? COLORS.accentOrange : COLORS.borderWarm;
        });
        onChange(i);
        updateEditorPreview();
      });

      swatches.push(swatch);
      swatchRow.addControl(swatch);
    });

    appearanceColorSwatches.set(label, swatches);
    return container;
  }

  // Update editor preview appearance
  function updateEditorPreviewAppearance(): void {
    if (editorPreviewMeshes.length === 0 || !editorPreviewMesh) return;

    const headIndex = editingCustomization.head;
    const combatStyle = editingCustomization.combatStyle;
    const isMelee = combatStyle === "melee";
    const isRightHanded = editingCustomization.handedness === "right";

    // Get team color from editing unit
    const teamColorHex = editingUnit?.playerId === "player1"
      ? selections.player1TeamColor
      : selections.player2TeamColor;
    const teamColor = hexToColor3(teamColorHex || "#ff0000");

    // Apply handedness by flipping X scale
    const currentScale = editorPreviewMesh.scaling;
    editorPreviewMesh.scaling.x = isRightHanded ? -Math.abs(currentScale.x) : Math.abs(currentScale.x);

    editorPreviewMeshes.forEach(m => {
      if (m.material) {
        const mat = m.material as PBRMaterial;
        const matName = mat.name;

        // Apply colors based on material name
        if (matName === "TeamMain") {
          mat.albedoColor = teamColor;
        } else if (matName === "MainSkin") {
          mat.albedoColor = hexToColor3(SKIN_TONES[editingCustomization.skinTone] || SKIN_TONES[4]);
        } else if (matName === "MainHair") {
          mat.albedoColor = hexToColor3(HAIR_COLORS[editingCustomization.hairColor] || HAIR_COLORS[0]);
        } else if (matName === "MainEye") {
          mat.albedoColor = hexToColor3(EYE_COLORS[editingCustomization.eyeColor] || EYE_COLORS[2]);
        }
      }

      // Hide all heads except selected one
      for (let i = 0; i < 4; i++) {
        const headName = `Head_00${i + 1}`;
        if (m.name.includes(headName)) {
          m.setEnabled(i === headIndex);
        }
      }

      // Show sword or pistol based on combat style
      const meshNameLower = m.name.toLowerCase();
      if (meshNameLower.includes("sword")) {
        m.setEnabled(isMelee);
      } else if (meshNameLower.includes("pistol")) {
        m.setEnabled(!isMelee);
      }
    });

    // Play correct idle animation
    editorPreviewAnimations.forEach(ag => ag.stop());
    const idleAnim = isMelee
      ? editorPreviewAnimations.find(ag => ag.name === "Idle_Sword")
      : editorPreviewAnimations.find(ag => ag.name === "Idle_Gun");
    if (idleAnim) {
      idleAnim.start(true);
    }
  }

  // Load editor preview model
  function updateEditorPreview(): void {
    if (!editingUnit) return;

    const unitClass = editingUnit.selectionArray[editingUnit.unitIndex]?.unitClass || "soldier";
    const classData = getClassData(unitClass);
    const gender = editingCustomization.body === "male" ? "m" : "f";
    const modelKey = `${classData.modelFile}_${gender}`;

    // If same model, just update appearance
    if (modelKey === editorLoadedModelKey && editorPreviewMesh) {
      updateEditorPreviewAppearance();
      return;
    }

    // Clean up existing model
    if (editorPreviewMesh) {
      if (editorRtt.renderList) {
        editorRtt.renderList.length = 0;
      }
      editorPreviewMesh.dispose();
      editorPreviewMesh = null;
      editorPreviewMeshes = [];
    }
    editorPreviewAnimations.forEach(a => a.stop());
    editorPreviewAnimations = [];

    const modelPath = `/models/${modelKey}.glb`;
    editorLoadedModelKey = modelKey;

    SceneLoader.ImportMeshAsync("", modelPath, "", scene).then((result) => {
      editorPreviewMesh = result.meshes[0];
      editorPreviewMeshes = result.meshes;
      editorPreviewMesh.position = new Vector3(0, 0, 0);
      editorPreviewMesh.scaling = new Vector3(1, 1, 1);
      editorPreviewMesh.rotation = new Vector3(0, Math.PI * 0.1, 0);

      // Set layer mask and add to RTT render list
      result.meshes.forEach(m => {
        m.layerMask = editorLayerMask;
        editorRtt.renderList?.push(m);
      });

      // Store animations and update appearance
      editorPreviewAnimations = result.animationGroups;
      updateEditorPreviewAppearance();
    }).catch((err) => {
      console.warn("Failed to load editor preview:", err);
    });
  }

  // Appearance overlay
  const appearanceOverlay = new Rectangle("appearanceOverlay");
  appearanceOverlay.width = "100%";
  appearanceOverlay.height = "100%";
  appearanceOverlay.background = COLORS.bgDeep;
  appearanceOverlay.thickness = 0;
  appearanceOverlay.isVisible = false;
  appearanceOverlay.zIndex = 500;
  gui.addControl(appearanceOverlay);

  // Layout structure differs by device:
  // Mobile portrait: Sticky preview at top (35%), scrollable options below (65%)
  // Tablet/Desktop: Side-by-side with options left, preview right (cropped to show center)
  const overlayGrid = new Grid("overlayGrid");
  overlayGrid.width = "100%";
  overlayGrid.height = "100%";

  if (isMobile) {
    // Mobile portrait: preview on top (sticky), options scroll below
    overlayGrid.addColumnDefinition(1);
    overlayGrid.addRowDefinition(0.35); // Preview - sticky
    overlayGrid.addRowDefinition(0.65); // Options - scrollable
  } else {
    // Tablet/Desktop: side by side
    overlayGrid.addColumnDefinition(0.5); // Options
    overlayGrid.addColumnDefinition(0.5); // Preview
    overlayGrid.addRowDefinition(1);
  }
  appearanceOverlay.addControl(overlayGrid);

  // Options panel with scroll - use native ScrollViewer scrolling
  const optionsPanel = new ScrollViewer("optionsScroll");
  optionsPanel.width = "100%";
  optionsPanel.height = "100%";
  optionsPanel.thickness = 0;
  optionsPanel.barSize = 8;
  optionsPanel.barColor = COLORS.borderWarm;
  optionsPanel.barBackground = "transparent";
  optionsPanel.wheelPrecision = 100; // More responsive wheel scrolling
  if (isMobile) {
    overlayGrid.addControl(optionsPanel, 1, 0);
  } else {
    overlayGrid.addControl(optionsPanel, 0, 0);
  }

  const optionsStack = new StackPanel("optionsStack");
  optionsStack.width = "100%";
  optionsStack.isVertical = true;
  optionsStack.paddingTop = isMobile ? "10px" : "30px";
  optionsStack.paddingBottom = "40px";
  optionsPanel.addControl(optionsStack);

  // Touch-based drag-to-scroll using window events (more reliable on mobile)
  let editorDragging = false;
  let editorLastTouchY = 0;
  let editorTouchStartedInOptions = false;

  const editorTouchStart = (e: TouchEvent) => {
    if (!appearanceOverlay.isVisible) return;

    // Check if touch started in the options area (bottom 65% on mobile, left 50% on tablet/desktop)
    const touch = e.touches[0];
    const rect = engine.getRenderingCanvas()?.getBoundingClientRect();
    if (!rect) return;

    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    const canvasHeight = rect.height;
    const canvasWidth = rect.width;

    if (isMobile) {
      // On mobile, options are in bottom 65%
      editorTouchStartedInOptions = touchY > canvasHeight * 0.35;
    } else {
      // On tablet/desktop, options are on left 50%
      editorTouchStartedInOptions = touchX < canvasWidth * 0.5;
    }

    if (editorTouchStartedInOptions) {
      editorDragging = true;
      editorLastTouchY = touch.clientY;
    }
  };

  const editorTouchMove = (e: TouchEvent) => {
    if (!editorDragging || !appearanceOverlay.isVisible) return;

    const touch = e.touches[0];
    const deltaY = editorLastTouchY - touch.clientY;
    editorLastTouchY = touch.clientY;

    const contentHeight = optionsStack.heightInPixels;
    const viewportHeight = optionsPanel.heightInPixels;
    const maxScroll = contentHeight - viewportHeight;

    if (maxScroll > 0) {
      const scrollDelta = deltaY / maxScroll;
      const newScroll = Math.max(0, Math.min(1, optionsPanel.verticalBar.value + scrollDelta));
      optionsPanel.verticalBar.value = newScroll;
    }

    // Prevent page scroll
    e.preventDefault();
  };

  const editorTouchEnd = () => {
    editorDragging = false;
    editorTouchStartedInOptions = false;
  };

  window.addEventListener("touchstart", editorTouchStart, { passive: false });
  window.addEventListener("touchmove", editorTouchMove, { passive: false });
  window.addEventListener("touchend", editorTouchEnd);

  // Clean up touch listeners when scene is disposed
  scene.onDisposeObservable.add(() => {
    window.removeEventListener("touchstart", editorTouchStart);
    window.removeEventListener("touchmove", editorTouchMove);
    window.removeEventListener("touchend", editorTouchEnd);
  });

  // Title
  const titleContainer = new Rectangle("titleContainer");
  titleContainer.width = "100%";
  titleContainer.height = isMobile ? "40px" : "50px";
  titleContainer.thickness = 0;
  titleContainer.paddingLeft = isMobile ? "15px" : "25px";
  titleContainer.paddingRight = isMobile ? "15px" : "25px";
  optionsStack.addControl(titleContainer);

  const overlayTitle = new TextBlock("overlayTitle");
  overlayTitle.text = "EDIT APPEARANCE";
  overlayTitle.color = COLORS.textPrimary;
  overlayTitle.fontSize = isMobile ? 18 : headerFontSize;
  overlayTitle.fontFamily = "'Bebas Neue', sans-serif";
  overlayTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  overlayTitle.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  titleContainer.addControl(overlayTitle);

  // Options
  const bodySelector = createAppearanceOption("Body", ["Male", "Female"], 0, (idx) => {
    editingCustomization.body = idx === 0 ? "male" : "female";
  });
  optionsStack.addControl(bodySelector);

  const headSelector = createAppearanceOption("Head", ["1", "2", "3", "4"], 0, (idx) => {
    editingCustomization.head = idx;
  });
  optionsStack.addControl(headSelector);

  const handSelector = createAppearanceOption("Handedness", ["Right", "Left"], 0, (idx) => {
    editingCustomization.handedness = idx === 0 ? "right" : "left";
  });
  optionsStack.addControl(handSelector);

  const skinSelector = createColorOption("Skin Tone", SKIN_TONES, 4, (idx) => {
    editingCustomization.skinTone = idx;
  });
  optionsStack.addControl(skinSelector);

  const hairSelector = createColorOption("Hair Color", HAIR_COLORS, 0, (idx) => {
    editingCustomization.hairColor = idx;
  });
  optionsStack.addControl(hairSelector);

  const eyeSelector = createColorOption("Eye Color", EYE_COLORS, 2, (idx) => {
    editingCustomization.eyeColor = idx;
  });
  optionsStack.addControl(eyeSelector);

  // Button row
  const editorButtonRow = new StackPanel("editorButtonRow");
  editorButtonRow.isVertical = false;
  editorButtonRow.height = `${buttonHeight + 20}px`;
  editorButtonRow.paddingTop = "15px";
  editorButtonRow.paddingLeft = isMobile ? "15px" : "25px";
  editorButtonRow.paddingRight = isMobile ? "15px" : "25px";
  editorButtonRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  optionsStack.addControl(editorButtonRow);

  const saveBtn = Button.CreateSimpleButton("saveAppearance", "S A V E");
  saveBtn.width = isMobile ? "100px" : "140px";
  saveBtn.height = `${isMobile ? 38 : buttonHeight}px`;
  saveBtn.color = COLORS.textPrimary;
  saveBtn.background = COLORS.success;
  saveBtn.cornerRadius = 4;
  saveBtn.fontSize = isMobile ? 12 : fontSize;
  saveBtn.fontFamily = "'Bebas Neue', sans-serif";
  saveBtn.onPointerEnterObservable.add(() => { saveBtn.background = COLORS.successHover; });
  saveBtn.onPointerOutObservable.add(() => { saveBtn.background = COLORS.success; });
  saveBtn.onPointerClickObservable.add(() => {
    if (editingUnit) {
      const { unitIndex, selectionArray } = editingUnit;
      if (selectionArray[unitIndex]) {
        selectionArray[unitIndex].customization = { ...editingCustomization };
      }
    }
    closeAppearanceEditor();
  });
  editorButtonRow.addControl(saveBtn);

  // Spacer
  const editorBtnSpacer = new Rectangle();
  editorBtnSpacer.width = "10px";
  editorBtnSpacer.height = "1px";
  editorBtnSpacer.thickness = 0;
  editorButtonRow.addControl(editorBtnSpacer);

  const cancelBtn = Button.CreateSimpleButton("cancelAppearance", "C A N C E L");
  cancelBtn.width = isMobile ? "90px" : "120px";
  cancelBtn.height = `${isMobile ? 38 : buttonHeight}px`;
  cancelBtn.color = COLORS.textSecondary;
  cancelBtn.background = COLORS.bgButton;
  cancelBtn.cornerRadius = 4;
  cancelBtn.fontSize = isMobile ? 12 : fontSize;
  cancelBtn.fontFamily = "'Bebas Neue', sans-serif";
  cancelBtn.onPointerEnterObservable.add(() => { cancelBtn.background = COLORS.bgButtonHover; });
  cancelBtn.onPointerOutObservable.add(() => { cancelBtn.background = COLORS.bgButton; });
  cancelBtn.onPointerClickObservable.add(() => {
    closeAppearanceEditor();
  });
  editorButtonRow.addControl(cancelBtn);

  // Preview area (right side on tablet/desktop, top on mobile)
  // Make preview completely non-interactive so it doesn't interfere with scrolling
  const previewArea = new Rectangle("previewArea");
  previewArea.width = "100%";
  previewArea.height = "100%";
  previewArea.thickness = 0;
  previewArea.background = COLORS.bgPreview;
  previewArea.isHitTestVisible = false; // Don't capture any pointer events
  if (isMobile) {
    overlayGrid.addControl(previewArea, 0, 0);
  } else {
    overlayGrid.addControl(previewArea, 0, 1);
  }

  // For tablet/desktop: Use full height, crop sides to show center third of character
  // Container clips the image to show only the middle portion
  const previewClipContainer = new Rectangle("previewClip");
  previewClipContainer.thickness = 0;
  previewClipContainer.clipChildren = true;
  previewClipContainer.clipContent = true;
  previewClipContainer.isHitTestVisible = false;

  if (isMobile) {
    // Mobile: show full square preview, centered
    previewClipContainer.width = "90%";
    previewClipContainer.height = "90%";
  } else {
    // Tablet/Desktop: full height, narrow width to crop sides
    // Show center 40% of the square RTT (cuts 30% from each side)
    previewClipContainer.height = "90%";
    previewClipContainer.width = "36%"; // Narrow to show center portion
  }
  previewArea.addControl(previewClipContainer);

  // Preview image - stretched to fill container, overflow hidden
  editorPreviewImage.isHitTestVisible = false; // Don't capture any pointer events
  if (isMobile) {
    editorPreviewImage.width = "100%";
    editorPreviewImage.height = "100%";
    editorPreviewImage.stretch = Image.STRETCH_UNIFORM;
  } else {
    // Make image taller than container so sides get cropped
    editorPreviewImage.width = "280%"; // Wider than container
    editorPreviewImage.height = "100%";
    editorPreviewImage.stretch = Image.STRETCH_UNIFORM;
  }
  previewClipContainer.addControl(editorPreviewImage);

  function openAppearanceEditor(playerId: string, unitIndex: number, selectionArray: UnitSelection[]): void {
    editingUnit = { playerId, unitIndex, selectionArray };

    const current = selectionArray[unitIndex]?.customization;
    if (current) {
      editingCustomization = { ...current };
    } else {
      editingCustomization = {
        body: "male",
        combatStyle: "ranged",
        handedness: "right",
        head: 0,
        hairColor: 0,
        eyeColor: 2,
        skinTone: 4,
      };
    }

    // Update UI to reflect current values
    const bodyBtns = appearanceOptionButtons.get("Body");
    if (bodyBtns) {
      bodyBtns.forEach((b, i) => {
        b.background = (editingCustomization.body === "male" ? 0 : 1) === i ? COLORS.selected : COLORS.bgButton;
      });
    }

    const headBtns = appearanceOptionButtons.get("Head");
    if (headBtns) {
      headBtns.forEach((b, i) => {
        b.background = editingCustomization.head === i ? COLORS.selected : COLORS.bgButton;
      });
    }

    const handBtns = appearanceOptionButtons.get("Handedness");
    if (handBtns) {
      handBtns.forEach((b, i) => {
        b.background = (editingCustomization.handedness === "right" ? 0 : 1) === i ? COLORS.selected : COLORS.bgButton;
      });
    }

    const skinSwatches = appearanceColorSwatches.get("Skin Tone");
    if (skinSwatches) {
      skinSwatches.forEach((s, i) => {
        s.thickness = editingCustomization.skinTone === i ? 3 : 1;
        s.color = editingCustomization.skinTone === i ? COLORS.accentOrange : COLORS.borderWarm;
      });
    }

    const hairSwatches = appearanceColorSwatches.get("Hair Color");
    if (hairSwatches) {
      hairSwatches.forEach((s, i) => {
        s.thickness = editingCustomization.hairColor === i ? 3 : 1;
        s.color = editingCustomization.hairColor === i ? COLORS.accentOrange : COLORS.borderWarm;
      });
    }

    const eyeSwatches = appearanceColorSwatches.get("Eye Color");
    if (eyeSwatches) {
      eyeSwatches.forEach((s, i) => {
        s.thickness = editingCustomization.eyeColor === i ? 3 : 1;
        s.color = editingCustomization.eyeColor === i ? COLORS.accentOrange : COLORS.borderWarm;
      });
    }

    overlayTitle.text = `${UNIT_DESIGNATIONS[unitIndex]} - EDIT APPEARANCE`;
    appearanceOverlay.isVisible = true;

    // Reset scroll position
    optionsPanel.verticalBar.value = 0;

    // Load preview model
    editorLoadedModelKey = ""; // Force reload
    updateEditorPreview();
  }

  function closeAppearanceEditor(): void {
    appearanceOverlay.isVisible = false;
    editingUnit = null;

    // Clean up editor preview model
    if (editorPreviewMesh) {
      if (editorRtt.renderList) {
        editorRtt.renderList.length = 0;
      }
      editorPreviewMesh.dispose();
      editorPreviewMesh = null;
      editorPreviewMeshes = [];
    }
    editorPreviewAnimations.forEach(a => a.stop());
    editorPreviewAnimations = [];
    editorLoadedModelKey = "";
  }

  // ============================================
  // UNIT ROW - Clean grid layout
  // Mobile: [Greek] [3x3 buttons] [info icon]
  // Tablet: [Greek] [3x3 buttons] [copy text]
  // Desktop: [Greek] [3x3 buttons] [copy text] [preview]
  // ============================================
  function createUnitRow(
    unitIndex: number,
    playerId: string,
    selectionArray: UnitSelection[],
    parent: StackPanel
  ): void {
    // State - defaults based on unit index for variety
    // Delta (0): Soldier/Tough/Ranged, Psi (1): Operator/Deadly/Melee, Omega (2): Medic/Quick/Ranged
    const defaultClasses: UnitClass[] = ["soldier", "operator", "medic"];
    const defaultBoosts = [0, 1, 2]; // Tough, Deadly, Quick
    const defaultStyles: ("ranged" | "melee")[] = ["ranged", "melee", "ranged"];

    let selectedClass: UnitClass = defaultClasses[unitIndex] || "soldier";
    let selectedBoost = defaultBoosts[unitIndex] ?? 0;
    let selectedStyle: ("ranged" | "melee") = defaultStyles[unitIndex] || "ranged";

    // Card container
    const row = new Rectangle(`${playerId}Unit${unitIndex}`);
    row.width = "96%";
    row.height = `${unitRowHeight}px`;
    row.background = COLORS.bgUnitRow;
    row.cornerRadius = 8;
    row.thickness = 1;
    row.color = COLORS.borderWarm;
    row.paddingTop = "4px";
    row.paddingBottom = "4px";
    parent.addControl(row);

    // Main grid layout
    const mainGrid = new Grid(`${playerId}Unit${unitIndex}Grid`);
    mainGrid.width = "100%";
    mainGrid.height = "100%";

    // Column definitions based on screen size
    if (isMobile) {
      // [Greek 12%] [Buttons 88%] - info icon is now in button grid
      mainGrid.addColumnDefinition(0.12);
      mainGrid.addColumnDefinition(0.88);
    } else if (isTablet) {
      // [Greek 8%] [Buttons 45%] [Copy 27%] [Preview 20%]
      mainGrid.addColumnDefinition(0.08);
      mainGrid.addColumnDefinition(0.45);
      mainGrid.addColumnDefinition(0.27);
      mainGrid.addColumnDefinition(0.20);
    } else {
      // Desktop: [Greek 6%] [Buttons 40%] [Copy 30%] [Preview 24%]
      mainGrid.addColumnDefinition(0.06);
      mainGrid.addColumnDefinition(0.40);
      mainGrid.addColumnDefinition(0.30);
      mainGrid.addColumnDefinition(0.24);
    }
    mainGrid.addRowDefinition(1);
    row.addControl(mainGrid);

    // === COLUMN 0: Greek Letter ===
    const greekContainer = new Rectangle();
    greekContainer.width = "100%";
    greekContainer.height = "100%";
    greekContainer.thickness = 0;
    mainGrid.addControl(greekContainer, 0, 0);

    const unitDesignation = new TextBlock();
    unitDesignation.text = UNIT_DESIGNATIONS[unitIndex];
    unitDesignation.color = COLORS.accentOrange;
    unitDesignation.fontSize = headerFontSize;
    unitDesignation.fontFamily = "'Bebas Neue', sans-serif";
    unitDesignation.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    unitDesignation.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    greekContainer.addControl(unitDesignation);

    // === COLUMN 1: 3x3 Button Grid ===
    const buttonGrid = new Grid(`${playerId}Unit${unitIndex}Buttons`);
    buttonGrid.width = "100%";
    buttonGrid.height = "100%";
    buttonGrid.addColumnDefinition(1 / 3);
    buttonGrid.addColumnDefinition(1 / 3);
    buttonGrid.addColumnDefinition(1 / 3);
    buttonGrid.addRowDefinition(1 / 3);
    buttonGrid.addRowDefinition(1 / 3);
    buttonGrid.addRowDefinition(1 / 3);
    mainGrid.addControl(buttonGrid, 0, 1);

    const btnWidth = isMobile ? "90%" : "85%";
    const btnHeight = `${smallButtonHeight}px`;

    // Helper to create a button
    function createBtn(name: string, label: string, row: number, col: number, isSelected: boolean): Button {
      const btn = Button.CreateSimpleButton(name, label);
      btn.width = btnWidth;
      btn.height = btnHeight;
      btn.color = COLORS.textPrimary;
      btn.background = isSelected ? COLORS.selected : COLORS.bgButton;
      btn.cornerRadius = 4;
      btn.fontSize = smallFontSize;
      buttonGrid.addControl(btn, row, col);
      return btn;
    }

    // Row 0: Class buttons (Soldier, Operator, Medic)
    const classButtons: Button[] = [];
    ALL_CLASSES.forEach((cls, i) => {
      const btn = createBtn(`${playerId}${unitIndex}class${i}`, CLASS_INFO[cls].name, 0, i, cls === selectedClass);
      btn.onPointerClickObservable.add(() => {
        selectedClass = cls;
        classButtons.forEach((b, j) => {
          b.background = j === i ? COLORS.selected : COLORS.bgButton;
        });
        // Randomize appearance when class changes
        updateUnitSelection(true);
        updateCopy();
      });
      classButtons.push(btn);
    });

    // Row 1: Boost buttons (Tough, Deadly, Quick)
    const boostButtons: Button[] = [];
    BOOST_INFO.forEach((boost, i) => {
      const btn = createBtn(`${playerId}${unitIndex}boost${i}`, boost.name, 1, i, i === selectedBoost);
      btn.onPointerClickObservable.add(() => {
        selectedBoost = i;
        boostButtons.forEach((b, j) => {
          b.background = j === i ? COLORS.selected : COLORS.bgButton;
        });
        updateCopy();
        updateUnitSelection();
      });
      boostButtons.push(btn);
    });

    // Row 2: Weapon buttons (Ranged, Melee) + Edit circle
    const weaponButtons: Button[] = [];
    (["ranged", "melee"] as const).forEach((style, i) => {
      const btn = createBtn(`${playerId}${unitIndex}weapon${i}`, WEAPON_INFO[style].label, 2, i, style === selectedStyle);
      btn.onPointerClickObservable.add(() => {
        selectedStyle = style;
        weaponButtons.forEach((b, j) => {
          b.background = j === i ? COLORS.selected : COLORS.bgButton;
        });
        updateCopy();
        updateUnitSelection();
      });
      weaponButtons.push(btn);
    });

    // Row 2, Col 2: Edit button (+ info circle on mobile)
    const circleContainer = new StackPanel();
    circleContainer.isVertical = false;
    circleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    buttonGrid.addControl(circleContainer, 2, 2);

    const circleSize = isMobile ? 34 : 38;
    const circleGap = 6;

    // Edit button - circle on mobile, pill on tablet/desktop
    const editBtn = new Rectangle(`${playerId}${unitIndex}edit`);
    if (isMobile) {
      // Circle
      editBtn.width = `${circleSize}px`;
      editBtn.height = `${circleSize}px`;
      editBtn.cornerRadius = circleSize / 2;
    } else {
      // Pill
      editBtn.width = "75px";
      editBtn.height = `${circleSize}px`;
      editBtn.cornerRadius = circleSize / 2;
    }
    editBtn.background = COLORS.bgButton;
    editBtn.thickness = 2;
    editBtn.color = COLORS.borderWarm;
    editBtn.paddingRight = isMobile ? `${circleGap / 2}px` : "0px";
    circleContainer.addControl(editBtn);

    if (isMobile) {
      // Just icon on mobile
      const editIcon = new TextBlock();
      editIcon.text = "✎";
      editIcon.color = COLORS.textSecondary;
      editIcon.fontSize = 15;
      editBtn.addControl(editIcon);
    } else {
      // Icon + "Edit" on tablet/desktop
      const editContent = new StackPanel();
      editContent.isVertical = false;
      editContent.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      editBtn.addControl(editContent);

      const editIcon = new TextBlock();
      editIcon.text = "✎";
      editIcon.color = COLORS.textSecondary;
      editIcon.fontSize = 14;
      editIcon.width = "18px";
      editContent.addControl(editIcon);

      const editLabel = new TextBlock();
      editLabel.text = "Edit";
      editLabel.color = COLORS.textSecondary;
      editLabel.fontSize = smallFontSize;
      editLabel.width = "32px";
      editContent.addControl(editLabel);
    }

    editBtn.onPointerEnterObservable.add(() => {
      editBtn.background = COLORS.bgButtonHover;
      editBtn.color = COLORS.accentOrange;
    });
    editBtn.onPointerOutObservable.add(() => {
      editBtn.background = COLORS.bgButton;
      editBtn.color = COLORS.borderWarm;
    });
    editBtn.onPointerClickObservable.add(() => {
      openAppearanceEditor(playerId, unitIndex, selectionArray);
    });

    // === COLUMN 2: Copy text (single combined description) ===
    let copyText: TextBlock | null = null;

    // Tooltip elements (used by mobile info circle)
    let tooltipBackdrop: Rectangle | null = null;
    let tooltipOverlay: Rectangle | null = null;

    // Mobile RTT preview variables
    let mobilePreviewMesh: AbstractMesh | null = null;
    let mobilePreviewAnims: AnimationGroup[] = [];
    let mobilePreviewMeshes: AbstractMesh[] = [];
    let mobileLoadedModelKey = "";
    let mobilePreviewImage: Image | null = null;
    let loadMobilePreview: (() => void) | null = null;

    if (isMobile) {
      // Info circle (magnifying glass) - next to edit button
      const infoCircle = new Rectangle(`${playerId}${unitIndex}info`);
      infoCircle.width = `${circleSize}px`;
      infoCircle.height = `${circleSize}px`;
      infoCircle.cornerRadius = circleSize / 2;
      infoCircle.background = COLORS.bgButton;
      infoCircle.thickness = 2;
      infoCircle.color = COLORS.borderWarm;
      infoCircle.paddingLeft = `${circleGap / 2}px`;
      circleContainer.addControl(infoCircle);

      const infoIcon = new TextBlock();
      infoIcon.text = "⌕";  // Monochrome magnifying glass
      infoIcon.color = COLORS.textSecondary;
      infoIcon.fontSize = 18;
      infoCircle.addControl(infoIcon);

      infoCircle.onPointerEnterObservable.add(() => {
        infoCircle.background = COLORS.bgButtonHover;
        infoCircle.color = COLORS.accentBlue;
      });
      infoCircle.onPointerOutObservable.add(() => {
        infoCircle.background = COLORS.bgButton;
        infoCircle.color = COLORS.borderWarm;
      });

      // Backdrop (click to close)
      tooltipBackdrop = new Rectangle(`${playerId}${unitIndex}backdrop`);
      tooltipBackdrop.width = "100%";
      tooltipBackdrop.height = "100%";
      tooltipBackdrop.background = "rgba(0, 0, 0, 0.6)";
      tooltipBackdrop.thickness = 0;
      tooltipBackdrop.zIndex = 99;
      tooltipBackdrop.isVisible = false;
      gui.addControl(tooltipBackdrop);

      tooltipBackdrop.onPointerClickObservable.add(() => {
        if (tooltipBackdrop) tooltipBackdrop.isVisible = false;
        if (tooltipOverlay) tooltipOverlay.isVisible = false;
        // Reset info circle style
        infoCircle.background = COLORS.bgButton;
        infoCircle.color = COLORS.borderWarm;
      });

      // Tooltip overlay for mobile - fixed height to accommodate preview
      tooltipOverlay = new Rectangle(`${playerId}${unitIndex}tooltip`);
      tooltipOverlay.width = "85%";
      tooltipOverlay.height = "420px";
      tooltipOverlay.background = COLORS.bgPanel;
      tooltipOverlay.cornerRadius = 12;
      tooltipOverlay.thickness = 2;
      tooltipOverlay.color = COLORS.borderWarm;
      tooltipOverlay.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      tooltipOverlay.zIndex = 100;
      tooltipOverlay.isVisible = false;
      gui.addControl(tooltipOverlay);

      // Stack for preview + text
      const tooltipStack = new StackPanel();
      tooltipStack.width = "100%";
      tooltipStack.isVertical = true;
      tooltipStack.paddingTop = "16px";
      tooltipStack.paddingBottom = "20px";
      tooltipOverlay.addControl(tooltipStack);

      // Preview container at top
      const mobilePreviewContainer = new Rectangle();
      mobilePreviewContainer.width = "140px";
      mobilePreviewContainer.height = "140px";
      mobilePreviewContainer.thickness = 0;
      mobilePreviewContainer.background = COLORS.bgPreview;
      mobilePreviewContainer.cornerRadius = 8;
      tooltipStack.addControl(mobilePreviewContainer);

      // RTT setup for mobile preview
      const mobileRttSize = 256;
      const mobileRtt = new RenderTargetTexture(`mobileRtt_${playerId}_${unitIndex}`, mobileRttSize, scene, false);
      mobileRtt.clearColor = hexToColor4(COLORS.bgPreview); // Dark warm background
      scene.customRenderTargets.push(mobileRtt);

      // Preview camera for mobile
      const mobilePreviewCamera = new ArcRotateCamera(
        `mobilePreviewCam_${playerId}_${unitIndex}`,
        Math.PI / 2 + 0.3,
        Math.PI / 2.5,
        2.5,
        new Vector3(0, 0.9, 0),
        scene
      );
      mobileRtt.activeCamera = mobilePreviewCamera;

      // Force square aspect ratio
      const originalGetEngine = mobilePreviewCamera.getEngine.bind(mobilePreviewCamera);
      mobilePreviewCamera.getEngine = () => {
        const eng = originalGetEngine();
        return { ...eng, getAspectRatio: () => 1 } as any;
      };

      // Unique layer mask for mobile preview (offset by 6 to avoid collision with desktop)
      const mobileLayerMask = 0x10000000 << (playerId === "player1" ? unitIndex + 6 : unitIndex + 9);
      mobilePreviewCamera.layerMask = mobileLayerMask;

      // Canvas for RTT pixels
      const mobileCanvas = document.createElement("canvas");
      mobileCanvas.width = mobileRttSize;
      mobileCanvas.height = mobileRttSize;
      const mobileCtx = mobileCanvas.getContext("2d")!;

      // GUI Image for preview
      mobilePreviewImage = new Image(`mobilePreviewImg_${playerId}_${unitIndex}`, "");
      mobilePreviewImage.stretch = Image.STRETCH_UNIFORM;
      mobilePreviewImage.width = "100%";
      mobilePreviewImage.height = "100%";
      mobilePreviewContainer.addControl(mobilePreviewImage);

      // Update canvas from RTT
      let mobileFrameCount = 0;
      mobileRtt.onAfterRenderObservable.add(() => {
        mobileFrameCount++;
        if (mobileFrameCount % 3 !== 0) return;

        mobileRtt.readPixels()?.then((buffer) => {
          if (!buffer || !mobilePreviewImage) return;
          const pixels = new Uint8Array(buffer.buffer);
          const imageData = mobileCtx.createImageData(mobileRttSize, mobileRttSize);

          for (let y = 0; y < mobileRttSize; y++) {
            for (let x = 0; x < mobileRttSize; x++) {
              const srcIdx = ((mobileRttSize - 1 - y) * mobileRttSize + x) * 4;
              const dstIdx = (y * mobileRttSize + x) * 4;
              imageData.data[dstIdx] = pixels[srcIdx];
              imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
              imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
              imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
            }
          }
          mobileCtx.putImageData(imageData, 0, 0);
          mobilePreviewImage.source = mobileCanvas.toDataURL();
        });
      });

      // Update mobile preview appearance
      const updateMobilePreviewAppearance = (): void => {
        if (mobilePreviewMeshes.length === 0 || !mobilePreviewMesh) return;

        const customization = selectionArray[unitIndex]?.customization;
        const headIndex = customization?.head ?? 0;
        const isMelee = selectedStyle === "melee";
        const isRightHanded = customization?.handedness === "right";

        const teamColorHex = playerId === "player1"
          ? selections.player1TeamColor
          : selections.player2TeamColor;
        const teamColor = hexToColor3(teamColorHex || "#ff0000");

        // Apply handedness by flipping X scale
        const currentScale = mobilePreviewMesh.scaling;
        mobilePreviewMesh.scaling.x = isRightHanded ? -Math.abs(currentScale.x) : Math.abs(currentScale.x);

        mobilePreviewMeshes.forEach(m => {
          if (m.material) {
            const mat = m.material as PBRMaterial;
            const matName = mat.name;

            if (matName === "TeamMain") {
              mat.albedoColor = teamColor;
            } else if (matName === "MainSkin") {
              mat.albedoColor = hexToColor3(SKIN_TONES[customization?.skinTone ?? 4] || SKIN_TONES[4]);
            } else if (matName === "MainHair") {
              mat.albedoColor = hexToColor3(HAIR_COLORS[customization?.hairColor ?? 0] || HAIR_COLORS[0]);
            } else if (matName === "MainEye") {
              mat.albedoColor = hexToColor3(EYE_COLORS[customization?.eyeColor ?? 2] || EYE_COLORS[2]);
            }
          }

          for (let i = 0; i < 4; i++) {
            const headName = `Head_00${i + 1}`;
            if (m.name.includes(headName)) {
              m.setEnabled(i === headIndex);
            }
          }

          const meshNameLower = m.name.toLowerCase();
          if (meshNameLower.includes("sword")) {
            m.setEnabled(isMelee);
          } else if (meshNameLower.includes("pistol")) {
            m.setEnabled(!isMelee);
          }
        });

        mobilePreviewAnims.forEach(ag => ag.stop());
        const idleAnim = isMelee
          ? mobilePreviewAnims.find(ag => ag.name === "Idle_Sword")
          : mobilePreviewAnims.find(ag => ag.name === "Idle_Gun");
        if (idleAnim) {
          idleAnim.start(true);
        }
      };

      // Load mobile preview model
      loadMobilePreview = (): void => {
        const classData = getClassData(selectedClass);
        const body = selectionArray[unitIndex]?.customization?.body || "male";
        const gender = body === "male" ? "m" : "f";
        const modelKey = `${classData.modelFile}_${gender}`;

        if (modelKey === mobileLoadedModelKey && mobilePreviewMesh) {
          updateMobilePreviewAppearance();
          return;
        }

        if (mobilePreviewMesh) {
          if (mobileRtt.renderList) {
            mobileRtt.renderList.length = 0;
          }
          mobilePreviewMesh.dispose();
          mobilePreviewMesh = null;
          mobilePreviewMeshes = [];
        }
        mobilePreviewAnims.forEach(a => a.stop());
        mobilePreviewAnims = [];

        const modelPath = `/models/${modelKey}.glb`;
        mobileLoadedModelKey = modelKey;

        SceneLoader.ImportMeshAsync("", modelPath, "", scene).then((result) => {
          mobilePreviewMesh = result.meshes[0];
          mobilePreviewMeshes = result.meshes;
          mobilePreviewMesh.position = new Vector3(0, 0, 0);
          mobilePreviewMesh.scaling = new Vector3(0.9, 0.9, 0.9);
          mobilePreviewMesh.rotation = new Vector3(0, Math.PI * 0.15, 0);

          result.meshes.forEach(m => {
            m.layerMask = mobileLayerMask;
            mobileRtt.renderList?.push(m);
          });

          mobilePreviewAnims = result.animationGroups;
          updateMobilePreviewAppearance();
        }).catch((err) => {
          console.warn("Failed to load mobile preview:", err);
        });
      };

      // Register for team color changes
      previewRefreshCallbacks[playerId as "player1" | "player2"].push(updateMobilePreviewAppearance);

      // Note: Initial load happens via updateCopy() at end of createUnitRow

      // Spacer between preview and text
      const tooltipSpacer = new Rectangle();
      tooltipSpacer.width = "100%";
      tooltipSpacer.height = "16px";
      tooltipSpacer.thickness = 0;
      tooltipStack.addControl(tooltipSpacer);

      // Text container with padding
      const tooltipTextContainer = new Rectangle();
      tooltipTextContainer.width = "100%";
      tooltipTextContainer.height = "220px";
      tooltipTextContainer.thickness = 0;
      tooltipTextContainer.paddingLeft = "24px";
      tooltipTextContainer.paddingRight = "24px";
      tooltipStack.addControl(tooltipTextContainer);

      // Single text block for unit description
      const tooltipText = new TextBlock();
      tooltipText.text = getUnitDescription(selectedClass, selectedBoost, selectedStyle);
      tooltipText.color = COLORS.textPrimary;
      tooltipText.fontSize = fontSize;
      tooltipText.textWrapping = true;
      tooltipText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      tooltipText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      tooltipTextContainer.addControl(tooltipText);

      // Store reference for updates
      copyText = tooltipText;

      infoCircle.onPointerClickObservable.add(() => {
        if (copyText) copyText.text = getUnitDescription(selectedClass, selectedBoost, selectedStyle);
        if (loadMobilePreview) loadMobilePreview();
        if (tooltipBackdrop) tooltipBackdrop.isVisible = true;
        if (tooltipOverlay) tooltipOverlay.isVisible = true;
      });

    } else {
      // Tablet/Desktop: Show copy text inline
      const copyContainer = new Rectangle();
      copyContainer.width = "100%";
      copyContainer.height = "100%";
      copyContainer.thickness = 0;
      copyContainer.paddingLeft = "8px";
      copyContainer.paddingRight = "8px";
      copyContainer.paddingTop = "4px";
      copyContainer.paddingBottom = "4px";
      mainGrid.addControl(copyContainer, 0, 2);

      // Single text block for unit description
      copyText = new TextBlock();
      copyText.text = getUnitDescription(selectedClass, selectedBoost, selectedStyle);
      copyText.color = COLORS.textSecondary;
      copyText.fontSize = tinyFontSize;
      copyText.textWrapping = true;
      copyText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      copyText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      copyContainer.addControl(copyText);
    }

    // === COLUMN 3: Preview (Tablet & Desktop) - RTT based ===
    let unitPreviewMesh: AbstractMesh | null = null;
    let unitPreviewAnims: AnimationGroup[] = [];
    let loadUnitPreview: (() => void) | null = null;

    if (!isMobile) {
      const previewContainer = new Rectangle();
      previewContainer.width = "100%";
      previewContainer.height = "100%";
      previewContainer.thickness = 0;
      previewContainer.background = COLORS.bgPreview;
      previewContainer.cornerRadius = 6;
      mainGrid.addControl(previewContainer, 0, 3);

      // RTT setup for this unit's preview
      const rttSize = 256;
      const rtt = new RenderTargetTexture(`rtt_${playerId}_${unitIndex}`, rttSize, scene, false);
      rtt.clearColor = hexToColor4(COLORS.bgPreview); // Dark warm background
      scene.customRenderTargets.push(rtt);

      // Preview camera for this unit
      const previewCamera = new ArcRotateCamera(
        `previewCam_${playerId}_${unitIndex}`,
        Math.PI / 2 + 0.3, // Slight angle
        Math.PI / 2.5,
        2.5,
        new Vector3(0, 0.9, 0),
        scene
      );
      rtt.activeCamera = previewCamera;

      // Force square aspect ratio for the RTT camera (ignores main canvas aspect)
      const originalGetEngine = previewCamera.getEngine.bind(previewCamera);
      previewCamera.getEngine = () => {
        const eng = originalGetEngine();
        return {
          ...eng,
          getAspectRatio: () => 1,
        } as any;
      };

      // Layer mask so this model only renders to its own RTT
      const layerMask = 0x10000000 << (playerId === "player1" ? unitIndex : unitIndex + 3);
      previewCamera.layerMask = layerMask;

      // Canvas to read RTT pixels
      const canvas = document.createElement("canvas");
      canvas.width = rttSize;
      canvas.height = rttSize;
      const ctx = canvas.getContext("2d")!;

      // GUI Image to display the preview
      const previewImage = new Image(`previewImg_${playerId}_${unitIndex}`, "");
      previewImage.stretch = Image.STRETCH_UNIFORM;
      previewImage.width = "100%";
      previewImage.height = "100%";
      previewContainer.addControl(previewImage);

      // Update canvas from RTT (throttled)
      let frameCount = 0;
      rtt.onAfterRenderObservable.add(() => {
        frameCount++;
        if (frameCount % 3 !== 0) return;

        rtt.readPixels()?.then((buffer) => {
          if (!buffer) return;
          const pixels = new Uint8Array(buffer.buffer);
          const imageData = ctx.createImageData(rttSize, rttSize);

          for (let y = 0; y < rttSize; y++) {
            for (let x = 0; x < rttSize; x++) {
              const srcIdx = ((rttSize - 1 - y) * rttSize + x) * 4;
              const dstIdx = (y * rttSize + x) * 4;
              imageData.data[dstIdx] = pixels[srcIdx];
              imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
              imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
              imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
            }
          }
          ctx.putImageData(imageData, 0, 0);
          previewImage.source = canvas.toDataURL();
        });
      });

      // Track what model is currently loaded
      let loadedModelKey = "";
      let unitPreviewMeshes: AbstractMesh[] = [];

      // Update preview appearance without reloading model
      const updatePreviewAppearance = (): void => {
        if (unitPreviewMeshes.length === 0 || !unitPreviewMesh) return;

        const customization = selectionArray[unitIndex]?.customization;
        const headIndex = customization?.head ?? 0;
        const isMelee = selectedStyle === "melee";
        const isRightHanded = customization?.handedness === "right";

        // Get team color
        const teamColorHex = playerId === "player1"
          ? selections.player1TeamColor
          : selections.player2TeamColor;
        const teamColor = hexToColor3(teamColorHex || "#ff0000");

        // Apply handedness by flipping X scale
        const currentScale = unitPreviewMesh.scaling;
        unitPreviewMesh.scaling.x = isRightHanded ? -Math.abs(currentScale.x) : Math.abs(currentScale.x);

        unitPreviewMeshes.forEach(m => {
          // Apply colors to materials
          if (m.material) {
            const mat = m.material as PBRMaterial;
            const matName = mat.name;

            if (matName === "TeamMain") {
              mat.albedoColor = teamColor;
            } else if (matName === "MainSkin") {
              mat.albedoColor = hexToColor3(SKIN_TONES[customization?.skinTone ?? 4] || SKIN_TONES[4]);
            } else if (matName === "MainHair") {
              mat.albedoColor = hexToColor3(HAIR_COLORS[customization?.hairColor ?? 0] || HAIR_COLORS[0]);
            } else if (matName === "MainEye") {
              mat.albedoColor = hexToColor3(EYE_COLORS[customization?.eyeColor ?? 2] || EYE_COLORS[2]);
            }
          }

          // Hide all heads except selected one (Head_001 through Head_004)
          for (let i = 0; i < 4; i++) {
            const headName = `Head_00${i + 1}`;
            if (m.name.includes(headName)) {
              m.setEnabled(i === headIndex);
            }
          }

          // Show sword or pistol based on combat style
          const meshNameLower = m.name.toLowerCase();
          if (meshNameLower.includes("sword")) {
            m.setEnabled(isMelee);
          } else if (meshNameLower.includes("pistol")) {
            m.setEnabled(!isMelee);
          }
        });

        // Play correct idle animation based on combat style
        unitPreviewAnims.forEach(ag => ag.stop());
        const idleAnim = isMelee
          ? unitPreviewAnims.find(ag => ag.name === "Idle_Sword")
          : unitPreviewAnims.find(ag => ag.name === "Idle_Gun");
        if (idleAnim) {
          idleAnim.start(true);
        }
      };

      // Load preview model (only when class or body changes)
      loadUnitPreview = (): void => {
        const classData = getClassData(selectedClass);
        const body = selectionArray[unitIndex]?.customization?.body || "male";
        const gender = body === "male" ? "m" : "f";
        const modelKey = `${classData.modelFile}_${gender}`;

        // If same model is already loaded, just update appearance
        if (modelKey === loadedModelKey && unitPreviewMesh) {
          updatePreviewAppearance();
          return;
        }

        // Clean up existing model
        if (unitPreviewMesh) {
          if (rtt.renderList) {
            rtt.renderList.length = 0;
          }
          unitPreviewMesh.dispose();
          unitPreviewMesh = null;
          unitPreviewMeshes = [];
        }
        unitPreviewAnims.forEach(a => a.stop());
        unitPreviewAnims = [];

        const modelPath = `/models/${modelKey}.glb`;
        loadedModelKey = modelKey;

        SceneLoader.ImportMeshAsync("", modelPath, "", scene).then((result) => {
          unitPreviewMesh = result.meshes[0];
          unitPreviewMeshes = result.meshes;
          unitPreviewMesh.position = new Vector3(0, 0, 0);
          unitPreviewMesh.scaling = new Vector3(0.9, 0.9, 0.9);
          unitPreviewMesh.rotation = new Vector3(0, Math.PI * 0.15, 0);

          // Set layer mask and add to RTT render list
          result.meshes.forEach(m => {
            m.layerMask = layerMask;
            rtt.renderList?.push(m);
          });

          // Store animations and update appearance
          unitPreviewAnims = result.animationGroups;
          updatePreviewAppearance();
        }).catch((err) => {
          console.warn("Failed to load unit preview:", err);
        });
      };

      // Register callback for team color changes
      previewRefreshCallbacks[playerId as "player1" | "player2"].push(updatePreviewAppearance);

      // Note: Initial load happens via updateCopy() at end of createUnitRow
    }

    // Update copy text and preview
    function updateCopy(): void {
      if (copyText) {
        copyText.text = getUnitDescription(selectedClass, selectedBoost, selectedStyle);
      }
      // Update 3D preview on desktop or mobile
      if (loadUnitPreview) {
        loadUnitPreview();
      }
      if (loadMobilePreview) {
        loadMobilePreview();
      }
    }

    // Helper to generate random customization
    function randomizeCustomization(): UnitCustomization {
      return {
        body: Math.random() > 0.5 ? "male" : "female",
        combatStyle: selectedStyle,
        handedness: Math.random() > 0.5 ? "right" : "left",
        head: Math.floor(Math.random() * 4),
        hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
        eyeColor: Math.floor(Math.random() * EYE_COLORS.length),
        skinTone: Math.floor(Math.random() * SKIN_TONES.length),
      };
    }

    function updateUnitSelection(forceRandomize = false): void {
      while (selectionArray.length < unitIndex + 1) {
        selectionArray.push({
          unitClass: "soldier",
          customization: randomizeCustomization(),
        });
      }

      const existingCustomization = selectionArray[unitIndex]?.customization;

      // Randomize if forced (class change) or if no existing customization
      const shouldRandomize = forceRandomize || !existingCustomization;

      selectionArray[unitIndex] = {
        unitClass: selectedClass,
        customization: shouldRandomize
          ? randomizeCustomization()
          : {
              ...existingCustomization,
              combatStyle: selectedStyle,
            },
        boost: selectedBoost,
      };

      updateStartButton();
    }

    // Initialize selection with randomized customization, then update preview
    updateUnitSelection(true);
    updateCopy();
  }

  return scene;
}
