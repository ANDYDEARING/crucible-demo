import {
  Engine,
  Scene,
  Color4,
  Vector3,
  ArcRotateCamera,
  HemisphericLight,
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
import { createMusicPlayer } from "../utils";

// Class descriptions for tooltips
const CLASS_DESCRIPTIONS: Record<UnitClass, { fluff: string; ability: string }> = {
  soldier: {
    fluff: "Soldiers are the backbone of settlement defense. Where others see danger, they see a perimeter to hold.",
    ability: "[COVER] Enemies that finish actions in covered squares trigger a counter attack. Cover ends at next turn start, after countering, or if hit.",
  },
  operator: {
    fluff: "Operators work beyond the walls where survival demands cunning over strength. The unseen blade that keeps the settlement safe.",
    ability: "[CONCEAL] Next incoming hit is negated and won't trigger enemy Cover. Survive fatal encounters or slip past defenses.",
  },
  medic: {
    fluff: "In a settlement where every life is precious, Medics are revered. Trained in trauma care and combat medicine.",
    ability: "[HEAL] Restore HP to self or adjacent ally. The difference between victory and defeat is keeping the right person standing.",
  },
};

// Combat style descriptions for tooltips
const COMBAT_STYLE_DESCRIPTIONS = {
  melee: "[MELEE] 2x damage. Attacks all 8 adjacent spaces with line of sight. Best for holding chokepoints.",
  ranged: "[RANGED] Attacks anywhere in line of sight except 8 adjacent spaces. Control the battlefield from distance.",
};

// Greek letters for unit designations
const UNIT_DESIGNATIONS = ["Δ", "Ψ", "Ω"]; // Delta, Psi, Omega

export function createLoadoutScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  onStartBattle: (loadout: Loadout) => void
): Scene {
  const scene = new Scene(engine);

  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.loadout;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

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

  // Simple camera setup
  const camera = new ArcRotateCamera("cam", Math.PI/2, Math.PI/2.2, 6, new Vector3(0, 0.8, 0), scene);
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

  // Tooltip system
  const tooltip = new Rectangle("tooltip");
  tooltip.width = "280px";
  tooltip.adaptHeightToChildren = true;
  tooltip.background = "#1a1a2eee";
  tooltip.cornerRadius = 8;
  tooltip.thickness = 1;
  tooltip.color = "#666688";
  tooltip.paddingTop = "8px";
  tooltip.paddingBottom = "8px";
  tooltip.paddingLeft = "10px";
  tooltip.paddingRight = "10px";
  tooltip.isVisible = false;
  tooltip.zIndex = 1000;
  tooltip.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  tooltip.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  gui.addControl(tooltip);

  const tooltipText = new TextBlock("tooltipText");
  tooltipText.text = "";
  tooltipText.color = "#cccccc";
  tooltipText.fontSize = 12;
  tooltipText.textWrapping = true;
  tooltipText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  tooltipText.resizeToFit = true;
  tooltipText.paddingBottom = "4px";
  tooltip.addControl(tooltipText);

  function showTooltip(text: string, x: number, y: number): void {
    tooltipText.text = text;
    tooltip.left = `${x + 10}px`;
    tooltip.top = `${y + 10}px`;
    tooltip.isVisible = true;
  }

  function hideTooltip(): void {
    tooltip.isVisible = false;
  }

  // Main vertical container with scroll
  const scrollViewer = new ScrollViewer("mainScroll");
  scrollViewer.width = "100%";
  scrollViewer.height = "100%";
  scrollViewer.thickness = 0;
  scrollViewer.barSize = 8;
  scrollViewer.barColor = "#666688";
  gui.addControl(scrollViewer);

  const mainStack = new StackPanel("mainStack");
  mainStack.width = "100%";
  mainStack.isVertical = true;
  mainStack.paddingTop = "10px";
  mainStack.paddingBottom = "80px"; // Space for start button
  scrollViewer.addControl(mainStack);

  // Start button (fixed at bottom) - create BEFORE player panels since they call updateStartButton
  const startBtnContainer = new Rectangle("startBtnContainer");
  startBtnContainer.width = "100%";
  startBtnContainer.height = "70px";
  startBtnContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  startBtnContainer.background = "#1a1a2eee";
  startBtnContainer.thickness = 0;
  gui.addControl(startBtnContainer);

  const startBtn = Button.CreateSimpleButton("startBattle", "START BATTLE");
  startBtn.width = "200px";
  startBtn.height = "50px";
  startBtn.color = "white";
  startBtn.background = "#444444";
  startBtn.cornerRadius = 8;
  startBtn.fontSize = 18;
  startBtn.fontWeight = "bold";
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
    startBtn.background = ready ? "#448844" : "#444444";
  }

  // Player names for PvE
  const player1Name = gameMode === "local-pve" && humanTeam !== "player1" ? "Computer" : "Player 1";
  const player2Name = gameMode === "local-pve" && humanTeam !== "player2" ? "Computer" : "Player 2";

  // Create both player panels
  createPlayerPanel(player1Name, "player1", selections.player1, mainStack);

  // Separator
  const separator = new Rectangle("separator");
  separator.width = "90%";
  separator.height = "2px";
  separator.background = "#333355";
  separator.thickness = 0;
  mainStack.addControl(separator);

  createPlayerPanel(player2Name, "player2", selections.player2, mainStack);

  function createPlayerPanel(
    playerName: string,
    playerId: "player1" | "player2",
    selectionArray: UnitSelection[],
    parent: StackPanel
  ): void {
    const defaultColor = playerId === "player1"
      ? TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex
      : TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex;

    const panel = new Rectangle(`${playerId}Panel`);
    panel.width = "95%";
    panel.height = "420px";
    panel.background = "#1a1a2e";
    panel.cornerRadius = 10;
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
    headerRow.height = "40px";
    headerRow.addColumnDefinition(0.4);
    headerRow.addColumnDefinition(0.6);
    headerRow.addRowDefinition(1);
    panelStack.addControl(headerRow);

    const nameText = new TextBlock(`${playerId}Name`);
    nameText.text = playerName;
    nameText.color = defaultColor;
    nameText.fontSize = 20;
    nameText.fontWeight = "bold";
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
    colorLabel.text = "Team:";
    colorLabel.color = "#888888";
    colorLabel.fontSize = 12;
    colorLabel.width = "40px";
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
      const swatch = new Rectangle();
      swatch.width = "22px";
      swatch.height = "22px";
      swatch.background = teamColor.hex;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      const isSelected = getThisColor() === teamColor.hex;
      const isDisabled = getOtherColor() === teamColor.hex;
      swatch.thickness = isSelected ? 3 : 1;
      swatch.color = isSelected ? "white" : "#333333";
      swatch.alpha = isDisabled ? 0.3 : 1;

      swatch.onPointerClickObservable.add(() => {
        if (getOtherColor() === teamColor.hex) return;
        setThisColor(teamColor.hex);
        refreshColorSwatches();
        panel.color = teamColor.hex;
        nameText.color = teamColor.hex;

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
        swatch.color = isSelected ? "white" : "#333333";
        swatch.alpha = isDisabled ? 0.3 : 1;
      });
    };

    teamColorRefreshCallbacks[playerId] = refreshColorSwatches;

    // Unit rows container
    const unitsContainer = new StackPanel(`${playerId}Units`);
    unitsContainer.width = "100%";
    unitsContainer.isVertical = true;
    unitsContainer.paddingTop = "10px";
    panelStack.addControl(unitsContainer);

    // Create 3 unit selection rows
    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      createUnitRow(i, playerId, selectionArray, unitsContainer);
    }
  }

  // ============================================
  // APPEARANCE EDITOR OVERLAY
  // ============================================

  // Store button references for updating selection state - declare BEFORE helper functions
  const appearanceOptionButtons: Map<string, Button[]> = new Map();
  const appearanceColorSwatches: Map<string, Rectangle[]> = new Map();

  // Current unit being edited
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

  // Helper function to create appearance option buttons
  function createAppearanceOption(
    label: string,
    options: string[],
    defaultIdx: number,
    onChange: (idx: number) => void
  ): StackPanel {
    const container = new StackPanel(`appearance_${label}`);
    container.width = "95%";
    container.isVertical = true;
    container.paddingTop = "10px";

    const labelText = new TextBlock();
    labelText.text = label;
    labelText.color = "#888888";
    labelText.fontSize = 14;
    labelText.height = "24px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(labelText);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    btnRow.height = "40px";
    container.addControl(btnRow);

    const buttons: Button[] = [];
    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`${label}_${i}`, opt);
      btn.width = "70px";
      btn.height = "36px";
      btn.color = "white";
      btn.background = i === defaultIdx ? "#4488ff" : "#333355";
      btn.cornerRadius = 6;
      btn.fontSize = 13;
      btn.paddingLeft = "4px";
      btn.paddingRight = "4px";

      btn.onPointerClickObservable.add(() => {
        buttons.forEach((b, j) => {
          b.background = j === i ? "#4488ff" : "#333355";
        });
        onChange(i);
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
    container.width = "95%";
    container.isVertical = true;
    container.paddingTop = "10px";

    const labelText = new TextBlock();
    labelText.text = label;
    labelText.color = "#888888";
    labelText.fontSize = 14;
    labelText.height = "24px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(labelText);

    const swatchRow = new StackPanel();
    swatchRow.isVertical = false;
    swatchRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    swatchRow.height = "40px";
    container.addControl(swatchRow);

    const swatches: Rectangle[] = [];
    colors.forEach((color, i) => {
      const swatch = new Rectangle();
      swatch.width = "28px";
      swatch.height = "28px";
      swatch.background = color;
      swatch.thickness = i === defaultIdx ? 3 : 1;
      swatch.color = i === defaultIdx ? "white" : "#333333";
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      swatch.onPointerClickObservable.add(() => {
        swatches.forEach((s, j) => {
          s.thickness = j === i ? 3 : 1;
          s.color = j === i ? "white" : "#333333";
        });
        onChange(i);
      });

      swatches.push(swatch);
      swatchRow.addControl(swatch);
    });

    appearanceColorSwatches.set(label, swatches);
    return container;
  }

  // Now create the overlay UI elements (after helper functions are defined)
  const appearanceOverlay = new Rectangle("appearanceOverlay");
  appearanceOverlay.width = "100%";
  appearanceOverlay.height = "100%";
  appearanceOverlay.background = "#0a0a15ee";
  appearanceOverlay.thickness = 0;
  appearanceOverlay.isVisible = false;
  appearanceOverlay.zIndex = 500;
  gui.addControl(appearanceOverlay);

  const overlayContent = new StackPanel("overlayContent");
  overlayContent.width = "95%";
  overlayContent.isVertical = true;
  overlayContent.paddingTop = "20px";
  appearanceOverlay.addControl(overlayContent);

  const overlayTitle = new TextBlock("overlayTitle");
  overlayTitle.text = "Customize Appearance";
  overlayTitle.color = "#ffffff";
  overlayTitle.fontSize = 24;
  overlayTitle.fontWeight = "bold";
  overlayTitle.height = "40px";
  overlayContent.addControl(overlayTitle);

  const optionsGrid = new Grid("optionsGrid");
  optionsGrid.width = "100%";
  optionsGrid.height = "400px";
  optionsGrid.addColumnDefinition(0.5);
  optionsGrid.addColumnDefinition(0.5);
  optionsGrid.addRowDefinition(0.25);
  optionsGrid.addRowDefinition(0.25);
  optionsGrid.addRowDefinition(0.25);
  optionsGrid.addRowDefinition(0.25);
  overlayContent.addControl(optionsGrid);

  // Body selector
  const bodySelector = createAppearanceOption("Body", ["Male", "Female"], 0, (idx) => {
    editingCustomization.body = idx === 0 ? "male" : "female";
  });
  optionsGrid.addControl(bodySelector, 0, 0);

  // Head selector
  const headSelector = createAppearanceOption("Head", ["1", "2", "3", "4"], 0, (idx) => {
    editingCustomization.head = idx;
  });
  optionsGrid.addControl(headSelector, 0, 1);

  // Handedness selector
  const handSelector = createAppearanceOption("Hand", ["Right", "Left"], 0, (idx) => {
    editingCustomization.handedness = idx === 0 ? "right" : "left";
  });
  optionsGrid.addControl(handSelector, 1, 0);

  // Skin tone selector
  const skinSelector = createColorOption("Skin", SKIN_TONES, 4, (idx) => {
    editingCustomization.skinTone = idx;
  });
  optionsGrid.addControl(skinSelector, 1, 1);

  // Hair color selector
  const hairSelector = createColorOption("Hair", HAIR_COLORS, 0, (idx) => {
    editingCustomization.hairColor = idx;
  });
  optionsGrid.addControl(hairSelector, 2, 0);

  // Eye color selector
  const eyeSelector = createColorOption("Eyes", EYE_COLORS, 2, (idx) => {
    editingCustomization.eyeColor = idx;
  });
  optionsGrid.addControl(eyeSelector, 2, 1);

  // Save button
  const saveBtn = Button.CreateSimpleButton("saveAppearance", "SAVE");
  saveBtn.width = "200px";
  saveBtn.height = "50px";
  saveBtn.color = "white";
  saveBtn.background = "#448844";
  saveBtn.cornerRadius = 8;
  saveBtn.fontSize = 18;
  saveBtn.fontWeight = "bold";
  saveBtn.onPointerClickObservable.add(() => {
    if (editingUnit) {
      const { unitIndex, selectionArray } = editingUnit;
      if (selectionArray[unitIndex]) {
        selectionArray[unitIndex].customization = { ...editingCustomization };
      }
    }
    appearanceOverlay.isVisible = false;
    editingUnit = null;
  });
  overlayContent.addControl(saveBtn);

  // Cancel button
  const cancelBtn = Button.CreateSimpleButton("cancelAppearance", "Cancel");
  cancelBtn.width = "120px";
  cancelBtn.height = "40px";
  cancelBtn.color = "#aaaaaa";
  cancelBtn.background = "#333344";
  cancelBtn.cornerRadius = 6;
  cancelBtn.fontSize = 14;
  cancelBtn.paddingTop = "10px";
  cancelBtn.onPointerClickObservable.add(() => {
    appearanceOverlay.isVisible = false;
    editingUnit = null;
  });
  overlayContent.addControl(cancelBtn);

  function openAppearanceEditor(playerId: string, unitIndex: number, selectionArray: UnitSelection[]): void {
    editingUnit = { playerId, unitIndex, selectionArray };

    // Load current customization or defaults
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
        b.background = (editingCustomization.body === "male" ? 0 : 1) === i ? "#4488ff" : "#333355";
      });
    }

    const headBtns = appearanceOptionButtons.get("Head");
    if (headBtns) {
      headBtns.forEach((b, i) => {
        b.background = editingCustomization.head === i ? "#4488ff" : "#333355";
      });
    }

    const handBtns = appearanceOptionButtons.get("Hand");
    if (handBtns) {
      handBtns.forEach((b, i) => {
        b.background = (editingCustomization.handedness === "right" ? 0 : 1) === i ? "#4488ff" : "#333355";
      });
    }

    const skinSwatches = appearanceColorSwatches.get("Skin");
    if (skinSwatches) {
      skinSwatches.forEach((s, i) => {
        s.thickness = editingCustomization.skinTone === i ? 3 : 1;
        s.color = editingCustomization.skinTone === i ? "white" : "#333333";
      });
    }

    const hairSwatches = appearanceColorSwatches.get("Hair");
    if (hairSwatches) {
      hairSwatches.forEach((s, i) => {
        s.thickness = editingCustomization.hairColor === i ? 3 : 1;
        s.color = editingCustomization.hairColor === i ? "white" : "#333333";
      });
    }

    const eyeSwatches = appearanceColorSwatches.get("Eyes");
    if (eyeSwatches) {
      eyeSwatches.forEach((s, i) => {
        s.thickness = editingCustomization.eyeColor === i ? 3 : 1;
        s.color = editingCustomization.eyeColor === i ? "white" : "#333333";
      });
    }

    // Update title
    overlayTitle.text = `Customize ${UNIT_DESIGNATIONS[unitIndex]} Appearance`;

    appearanceOverlay.isVisible = true;
  }

  // ============================================
  // UNIT ROW
  // ============================================

  function createUnitRow(
    unitIndex: number,
    playerId: string,
    selectionArray: UnitSelection[],
    parent: StackPanel
  ): void {
    const row = new Rectangle(`${playerId}Unit${unitIndex}`);
    row.width = "95%";
    row.height = "100px";
    row.background = "#2a2a4e";
    row.cornerRadius = 8;
    row.thickness = 1;
    row.color = "#444466";
    row.paddingTop = "5px";
    row.paddingBottom = "5px";
    parent.addControl(row);

    const rowGrid = new Grid(`${playerId}Unit${unitIndex}Grid`);
    rowGrid.width = "100%";
    rowGrid.height = "100%";
    rowGrid.addColumnDefinition(0.10); // Unit designation (Greek letter)
    rowGrid.addColumnDefinition(0.28); // Class selector
    rowGrid.addColumnDefinition(0.22); // Boost selector
    rowGrid.addColumnDefinition(0.28); // Combat style
    rowGrid.addColumnDefinition(0.12); // Appearance button
    rowGrid.addRowDefinition(1);
    row.addControl(rowGrid);

    // Unit designation (Greek letter)
    const unitDesignation = new TextBlock();
    unitDesignation.text = UNIT_DESIGNATIONS[unitIndex] || `${unitIndex + 1}`;
    unitDesignation.color = "#8888aa";
    unitDesignation.fontSize = 28;
    unitDesignation.fontWeight = "bold";
    rowGrid.addControl(unitDesignation, 0, 0);

    // Initialize selection for this unit if not exists
    if (!selectionArray[unitIndex]) {
      selectionArray[unitIndex] = {
        unitClass: "soldier",
        customization: {
          body: "male",
          combatStyle: "ranged",
          handedness: "right",
          head: 0,
          hairColor: 0,
          eyeColor: 2,
          skinTone: 4,
        },
      };
      // Clear it so we know it's not "confirmed" yet
      selectionArray.length = unitIndex;
    }

    // Track current selections for this row
    let selectedClass: UnitClass = "soldier";
    let selectedBoost: number = 0;
    let selectedStyle: "ranged" | "melee" = "ranged";

    // Class selector
    const classContainer = createSelectorWithTooltip(
      `${playerId}Unit${unitIndex}Class`,
      "Class",
      ALL_CLASSES.map(c => getClassData(c).name),
      0,
      (idx) => {
        selectedClass = ALL_CLASSES[idx];
        updateUnitSelection();
      },
      (idx, x, y) => {
        const unitClass = ALL_CLASSES[idx];
        const desc = CLASS_DESCRIPTIONS[unitClass];
        showTooltip(`${desc.fluff}\n\n${desc.ability}`, x, y);
      },
      hideTooltip
    );
    rowGrid.addControl(classContainer, 0, 1);

    // Boost selector
    const boostContainer = createSelectorWithTooltip(
      `${playerId}Unit${unitIndex}Boost`,
      "Boost",
      ["#1", "#2", "#3"],
      0,
      (idx) => {
        selectedBoost = idx;
        updateUnitSelection();
      },
      (_idx, x, y) => {
        showTooltip("Boosts coming soon! Choose your loadout bonus.", x, y);
      },
      hideTooltip
    );
    rowGrid.addControl(boostContainer, 0, 2);

    // Combat style selector
    const styleContainer = createSelectorWithTooltip(
      `${playerId}Unit${unitIndex}Style`,
      "Weapon",
      ["Ranged", "Melee"],
      0,
      (idx) => {
        selectedStyle = idx === 0 ? "ranged" : "melee";
        updateUnitSelection();
      },
      (idx, x, y) => {
        const style = idx === 0 ? "ranged" : "melee";
        showTooltip(COMBAT_STYLE_DESCRIPTIONS[style], x, y);
      },
      hideTooltip
    );
    rowGrid.addControl(styleContainer, 0, 3);

    // Appearance button
    const appearanceBtn = Button.CreateSimpleButton(`${playerId}Unit${unitIndex}Appearance`, "✎");
    appearanceBtn.width = "40px";
    appearanceBtn.height = "40px";
    appearanceBtn.color = "white";
    appearanceBtn.background = "#555577";
    appearanceBtn.cornerRadius = 20;
    appearanceBtn.fontSize = 18;
    appearanceBtn.onPointerEnterObservable.add(() => {
      appearanceBtn.background = "#6666aa";
    });
    appearanceBtn.onPointerOutObservable.add(() => {
      appearanceBtn.background = "#555577";
    });
    appearanceBtn.onPointerClickObservable.add(() => {
      openAppearanceEditor(playerId, unitIndex, selectionArray);
    });
    rowGrid.addControl(appearanceBtn, 0, 4);

    function updateUnitSelection(): void {
      // Ensure array is long enough
      while (selectionArray.length < unitIndex + 1) {
        selectionArray.push({
          unitClass: "soldier",
          customization: {
            body: "male",
            combatStyle: "ranged",
            handedness: "right",
            head: 0,
            hairColor: 0,
            eyeColor: 2,
            skinTone: 4,
          },
        });
      }

      // Preserve existing customization if it exists, otherwise randomize
      const existingCustomization = selectionArray[unitIndex]?.customization;

      selectionArray[unitIndex] = {
        unitClass: selectedClass,
        customization: existingCustomization ? {
          ...existingCustomization,
          combatStyle: selectedStyle,
        } : {
          body: Math.random() > 0.5 ? "male" : "female",
          combatStyle: selectedStyle,
          handedness: Math.random() > 0.5 ? "right" : "left",
          head: Math.floor(Math.random() * 4),
          hairColor: Math.floor(Math.random() * 10),
          eyeColor: Math.floor(Math.random() * 8),
          skinTone: Math.floor(Math.random() * 10),
        },
        boost: selectedBoost,
      };

      updateStartButton();
    }

    // Initialize the selection
    updateUnitSelection();
  }

  function createSelectorWithTooltip(
    id: string,
    label: string,
    options: string[],
    defaultIdx: number,
    onChange: (idx: number) => void,
    onHover: (idx: number, x: number, y: number) => void,
    onLeave: () => void
  ): StackPanel {
    const container = new StackPanel(id);
    container.width = "95%";
    container.isVertical = true;

    const labelText = new TextBlock(`${id}Label`);
    labelText.text = label;
    labelText.color = "#888888";
    labelText.fontSize = 11;
    labelText.height = "16px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(labelText);

    const buttonsStack = new StackPanel(`${id}Buttons`);
    buttonsStack.isVertical = true;
    buttonsStack.width = "100%";
    container.addControl(buttonsStack);

    const buttons: Button[] = [];

    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`${id}_${i}`, opt);
      btn.width = "90%";
      btn.height = "24px";
      btn.color = "white";
      btn.background = i === defaultIdx ? "#4488ff" : "#333355";
      btn.cornerRadius = 4;
      btn.fontSize = 11;
      btn.paddingTop = "2px";
      btn.paddingBottom = "2px";

      btn.onPointerEnterObservable.add((_, state) => {
        const x = state.currentTarget?.centerX ?? 0;
        const y = state.currentTarget?.centerY ?? 0;
        onHover(i, x, y);
      });

      btn.onPointerOutObservable.add(() => {
        onLeave();
      });

      btn.onPointerClickObservable.add(() => {
        buttons.forEach((b, j) => {
          b.background = j === i ? "#4488ff" : "#333355";
        });
        onChange(i);
      });

      buttons.push(btn);
      buttonsStack.addControl(btn);
    });

    return container;
  }

  return scene;
}
