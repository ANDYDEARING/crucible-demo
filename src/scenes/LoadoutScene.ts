import {
  Engine,
  Scene,
  Color4,
  FreeCamera,
  Vector3,
} from "@babylonjs/core";
import {
  AdvancedDynamicTexture,
  TextBlock,
  Button,
  StackPanel,
  Rectangle,
  Grid,
  Control,
} from "@babylonjs/gui";
import { UNIT_INFO, Loadout, UnitSelection, SupportCustomization } from "../types";

// Color palette options (indices into these arrays)
const SKIN_TONES = ["#FFE0BD", "#FFCD94", "#EAC086", "#D4A373", "#C68642", "#8D5524", "#6B4423", "#4A3728"];
const HAIR_COLORS = ["#090806", "#2C222B", "#6A4E42", "#B55239", "#DCD0BA", "#E5C8A8", "#977961", "#E8E0D5", "#CC2222", "#22AA44", "#2266DD", "#8833AA"];
const EYE_COLORS = ["#634E34", "#463320", "#1C7847", "#2E8B57", "#1E90FF", "#4169E1", "#808080", "#000000", "#CC2222", "#8833AA"];

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

  new FreeCamera("camera", Vector3.Zero(), scene);

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Title
  const title = new TextBlock();
  title.text = "SELECT YOUR UNITS";
  title.color = "white";
  title.fontSize = 36;
  title.top = "-44%";
  title.fontWeight = "bold";
  gui.addControl(title);

  // Main container
  const mainGrid = new Grid();
  mainGrid.width = "90%";
  mainGrid.height = "70%";
  mainGrid.top = "-2%";
  mainGrid.addColumnDefinition(0.5);
  mainGrid.addColumnDefinition(0.5);
  mainGrid.addRowDefinition(1);
  gui.addControl(mainGrid);

  // Track selections
  const selections: Loadout = {
    player: [],
    enemy: []
  };

  // Create player panels
  const player1Panel = createPlayerPanel("Player 1", "#4488ff", selections.player, updateStartButton);
  const player2Panel = createPlayerPanel("Player 2", "#ff8844", selections.enemy, updateStartButton);

  mainGrid.addControl(player1Panel, 0, 0);
  mainGrid.addControl(player2Panel, 0, 1);

  // Unit info panel at bottom
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

  // Start battle button
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
    onUpdate: () => void
  ): Rectangle {
    const panel = new Rectangle();
    panel.width = "95%";
    panel.height = "100%";
    panel.background = "#1a1a2e";
    panel.cornerRadius = 10;
    panel.thickness = 2;
    panel.color = color;

    const container = new StackPanel();
    container.width = "90%";
    panel.addControl(container);

    // Player name
    const nameText = new TextBlock();
    nameText.text = playerName;
    nameText.color = color;
    nameText.fontSize = 24;
    nameText.height = "40px";
    nameText.fontWeight = "bold";
    container.addControl(nameText);

    // Selection display
    const selectionDisplay = new TextBlock();
    selectionDisplay.text = "Selected: (choose 3)";
    selectionDisplay.color = "#888888";
    selectionDisplay.fontSize = 14;
    selectionDisplay.height = "25px";
    container.addControl(selectionDisplay);

    const updateSelectionDisplay = (): void => {
      if (selectionArray.length === 0) {
        selectionDisplay.text = "Selected: (choose 3)";
        selectionDisplay.color = "#888888";
      } else {
        const names = selectionArray.map(u => UNIT_INFO[u.type].name);
        selectionDisplay.text = `Selected: ${names.join(", ")}`;
        selectionDisplay.color = selectionArray.length === 3 ? "#44ff44" : "white";
      }
    };

    // Tank button (simple)
    const tankBtn = Button.CreateSimpleButton(`${playerName}_tank`, "+ Tank");
    tankBtn.width = "100%";
    tankBtn.height = "40px";
    tankBtn.color = "white";
    tankBtn.background = "#333355";
    tankBtn.cornerRadius = 5;
    tankBtn.paddingTop = "3px";
    tankBtn.paddingBottom = "3px";
    tankBtn.onPointerEnterObservable.add(() => {
      const info = UNIT_INFO.tank;
      infoText.text = `${info.name}: HP ${info.hp} | ATK ${info.attack} | Move ${info.moveRange} | Range ${info.attackRange}`;
      infoText.color = "white";
    });
    tankBtn.onPointerOutObservable.add(() => {
      infoText.text = "Hover over a unit type to see stats";
      infoText.color = "#888888";
    });
    tankBtn.onPointerClickObservable.add(() => {
      if (selectionArray.length < 3) {
        selectionArray.push({ type: "tank" });
        updateSelectionDisplay();
        onUpdate();
      }
    });
    container.addControl(tankBtn);

    // Damage button (simple)
    const damageBtn = Button.CreateSimpleButton(`${playerName}_damage`, "+ Damage");
    damageBtn.width = "100%";
    damageBtn.height = "40px";
    damageBtn.color = "white";
    damageBtn.background = "#333355";
    damageBtn.cornerRadius = 5;
    damageBtn.paddingTop = "3px";
    damageBtn.paddingBottom = "3px";
    damageBtn.onPointerEnterObservable.add(() => {
      const info = UNIT_INFO.damage;
      infoText.text = `${info.name}: HP ${info.hp} | ATK ${info.attack} | Move ${info.moveRange} | Range ${info.attackRange}`;
      infoText.color = "white";
    });
    damageBtn.onPointerOutObservable.add(() => {
      infoText.text = "Hover over a unit type to see stats";
      infoText.color = "#888888";
    });
    damageBtn.onPointerClickObservable.add(() => {
      if (selectionArray.length < 3) {
        selectionArray.push({ type: "damage" });
        updateSelectionDisplay();
        onUpdate();
      }
    });
    container.addControl(damageBtn);

    // === SUPPORT PANEL (big, with customization) ===
    const supportPanel = new Rectangle();
    supportPanel.width = "100%";
    supportPanel.height = "250px";
    supportPanel.background = "#2a2a4e";
    supportPanel.cornerRadius = 5;
    supportPanel.thickness = 1;
    supportPanel.color = "#555588";
    supportPanel.paddingTop = "5px";
    container.addControl(supportPanel);

    const supportContent = new StackPanel();
    supportContent.width = "95%";
    supportPanel.addControl(supportContent);

    // Support title
    const supportTitle = new TextBlock();
    supportTitle.text = "SUPPORT (Medic)";
    supportTitle.color = "#88ff88";
    supportTitle.fontSize = 16;
    supportTitle.height = "25px";
    supportTitle.fontWeight = "bold";
    supportContent.addControl(supportTitle);

    // Track current customization for this panel
    const currentCustomization: SupportCustomization = {
      head: 0,
      weapon: "gun",
      skinTone: 2,
      hairColor: 0,
      eyeColor: 0
    };

    // Two-column grid for options (3 rows)
    const optionsGrid = new Grid();
    optionsGrid.width = "100%";
    optionsGrid.height = "135px";
    optionsGrid.addColumnDefinition(0.5);
    optionsGrid.addColumnDefinition(0.5);
    optionsGrid.addRowDefinition(1/3);
    optionsGrid.addRowDefinition(1/3);
    optionsGrid.addRowDefinition(1/3);
    supportContent.addControl(optionsGrid);

    // Head chooser (row 0, col 0)
    const headRow = createOptionChooser("Head", ["1", "2", "3", "4"], 0, (idx) => {
      currentCustomization.head = idx;
    });
    optionsGrid.addControl(headRow, 0, 0);

    // Weapon chooser (row 0, col 1)
    const weaponRow = createOptionChooser("Weapon", ["Gun", "Sword"], 0, (idx) => {
      currentCustomization.weapon = idx === 0 ? "gun" : "sword";
    });
    optionsGrid.addControl(weaponRow, 0, 1);

    // Skin chooser (row 1, col 0)
    const skinRow = createColorChooser("Skin", SKIN_TONES, 2, (idx) => {
      currentCustomization.skinTone = idx;
    });
    optionsGrid.addControl(skinRow, 1, 0);

    // Hair chooser (row 1, col 1)
    const hairRow = createColorChooser("Hair", HAIR_COLORS, 0, (idx) => {
      currentCustomization.hairColor = idx;
    });
    optionsGrid.addControl(hairRow, 1, 1);

    // Eye chooser (row 2, col 0)
    const eyeRow = createColorChooser("Eyes", EYE_COLORS, 0, (idx) => {
      currentCustomization.eyeColor = idx;
    });
    optionsGrid.addControl(eyeRow, 2, 0);

    // +Add Support button (below the grid)
    const addSupportBtn = Button.CreateSimpleButton(`${playerName}_addSupport`, "+ Add Medic");
    addSupportBtn.width = "95%";
    addSupportBtn.height = "45px";
    addSupportBtn.color = "white";
    addSupportBtn.background = "#338833";
    addSupportBtn.cornerRadius = 5;
    addSupportBtn.fontSize = 18;
    addSupportBtn.fontWeight = "bold";
    addSupportBtn.onPointerEnterObservable.add(() => {
      const info = UNIT_INFO.support;
      infoText.text = `${info.name}: HP ${info.hp} | ATK ${info.attack} | Move ${info.moveRange} | Range ${info.attackRange} - ${info.description}`;
      infoText.color = "white";
      addSupportBtn.background = "#44aa44";
    });
    addSupportBtn.onPointerOutObservable.add(() => {
      infoText.text = "Hover over a unit type to see stats";
      infoText.color = "#888888";
      addSupportBtn.background = "#338833";
    });
    addSupportBtn.onPointerClickObservable.add(() => {
      if (selectionArray.length < 3) {
        // Clone the customization so each medic can be different
        selectionArray.push({
          type: "support",
          customization: { ...currentCustomization }
        });
        updateSelectionDisplay();
        onUpdate();
      }
    });
    supportContent.addControl(addSupportBtn);

    // Clear button
    const clearBtn = Button.CreateSimpleButton(`${playerName}_clear`, "Clear All");
    clearBtn.width = "100%";
    clearBtn.height = "30px";
    clearBtn.color = "#ff6666";
    clearBtn.background = "#442222";
    clearBtn.cornerRadius = 5;
    clearBtn.paddingTop = "5px";
    clearBtn.onPointerClickObservable.add(() => {
      selectionArray.length = 0;
      updateSelectionDisplay();
      onUpdate();
    });
    container.addControl(clearBtn);

    return panel;
  }

  // Helper: create text option chooser (e.g., Gun/Sword)
  function createOptionChooser(
    label: string,
    options: string[],
    defaultIdx: number,
    onChange: (idx: number) => void
  ): StackPanel {
    const row = new StackPanel();
    row.width = "100%";
    row.height = "100%";
    row.paddingLeft = "5px";
    row.paddingRight = "5px";

    const labelText = new TextBlock();
    labelText.text = label;
    labelText.color = "#aaaaaa";
    labelText.fontSize = 12;
    labelText.height = "16px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(labelText);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.height = "25px";
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(btnRow);

    const buttons: Button[] = [];
    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`opt_${label}_${i}`, opt);
      btn.width = "35px";
      btn.height = "22px";
      btn.color = "white";
      btn.background = i === defaultIdx ? "#4488ff" : "#333355";
      btn.cornerRadius = 3;
      btn.fontSize = 10;
      btn.onPointerClickObservable.add(() => {
        buttons.forEach((b, j) => {
          b.background = j === i ? "#4488ff" : "#333355";
        });
        onChange(i);
      });
      buttons.push(btn);
      btnRow.addControl(btn);
    });

    return row;
  }

  // Helper: create color swatch chooser
  function createColorChooser(
    label: string,
    colors: string[],
    defaultIdx: number,
    onChange: (idx: number) => void
  ): StackPanel {
    const row = new StackPanel();
    row.width = "100%";
    row.height = "100%";
    row.paddingLeft = "5px";
    row.paddingRight = "5px";

    const labelText = new TextBlock();
    labelText.text = label;
    labelText.color = "#aaaaaa";
    labelText.fontSize = 12;
    labelText.height = "16px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(labelText);

    const swatchRow = new StackPanel();
    swatchRow.isVertical = false;
    swatchRow.height = "22px";
    swatchRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(swatchRow);

    const swatches: Rectangle[] = [];
    colors.forEach((color, i) => {
      const swatch = new Rectangle();
      swatch.width = "18px";
      swatch.height = "18px";
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
