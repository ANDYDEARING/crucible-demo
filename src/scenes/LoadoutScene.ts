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
import { UNIT_INFO, Loadout, UnitSelection, SupportCustomization } from "../types";

// Color palette options
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

  // Single camera - positioned to see models in background
  const camera = new ArcRotateCamera("cam", Math.PI/2, Math.PI/2.2, 6, new Vector3(0, 0.8, 0), scene);
  scene.activeCamera = camera;

  // Lights
  const light = new HemisphericLight("light", new Vector3(0, 1, 0.5), scene);
  light.intensity = 1.2;

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Title
  const title = new TextBlock();
  title.text = "SELECT YOUR UNITS";
  title.color = "white";
  title.fontSize = 32;
  title.top = "-44%";
  title.fontWeight = "bold";
  gui.addControl(title);

  // Main container (2 columns: Player 1, Player 2)
  const mainGrid = new Grid();
  mainGrid.width = "95%";
  mainGrid.height = "72%";
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

  // 3D Preview system using RTT
  interface MedicPreview {
    meshes: AbstractMesh[];
    animationGroups: AnimationGroup[];
    rtt: RenderTargetTexture;
    previewCamera: ArcRotateCamera;
  }

  const previews: { left?: MedicPreview; right?: MedicPreview } = {};

  // Helper to convert hex color to Color3
  function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
  }

  function updatePreview(preview: MedicPreview | undefined, c: SupportCustomization): void {
    if (!preview) return;

    // Update head visibility
    for (let i = 0; i < 4; i++) {
      const headMesh = preview.meshes.find(m => m.name === `Head_${i}` || m.name.includes(`Head_${i}`));
      if (headMesh) {
        headMesh.setEnabled(i === c.head);
      }
    }

    // Update weapon visibility and animation
    const swordMeshes = preview.meshes.filter(m => m.name.toLowerCase().includes("sword"));
    const gunMeshes = preview.meshes.filter(m =>
      m.name.toLowerCase().includes("pistol") || m.name.toLowerCase().includes("gun")
    );

    const useSword = c.weapon === "sword";
    swordMeshes.forEach(m => m.setEnabled(useSword));
    gunMeshes.forEach(m => m.setEnabled(!useSword));

    // Switch animation based on weapon
    preview.animationGroups.forEach(ag => ag.stop());
    const idleAnim = useSword
      ? preview.animationGroups.find(ag => ag.name === "Idle_Sword")
      : preview.animationGroups.find(ag => ag.name === "Idle_Gun");
    idleAnim?.start(true);

    // Update materials (skin, hair, eyes)
    preview.meshes.forEach(mesh => {
      if (!mesh.material) return;
      const mat = mesh.material as PBRMaterial;
      const matName = mat.name.toLowerCase();

      if (matName.includes("skin")) {
        mat.albedoColor = hexToColor3(SKIN_TONES[c.skinTone] || SKIN_TONES[0]);
      } else if (matName.includes("hair")) {
        mat.albedoColor = hexToColor3(HAIR_COLORS[c.hairColor] || HAIR_COLORS[0]);
      } else if (matName.includes("eye")) {
        mat.albedoColor = hexToColor3(EYE_COLORS[c.eyeColor] || EYE_COLORS[0]);
      }
    });

    // Update body - flip model direction for visual differentiation
    const root = preview.meshes[0];
    if (root) {
      // Use consistent scale, flip X for female to differentiate
      root.scaling.x = c.body === "female" ? -0.6 : 0.6;
    }
  }

  async function createMedicPreview(
    side: "left" | "right",
    previewRect: Rectangle,
    _customization: SupportCustomization
  ): Promise<MedicPreview> {
    console.log(`Loading ${side} medic model...`);

    // Make the preview rectangle transparent so 3D shows through
    previewRect.background = "transparent";
    previewRect.thickness = 0;

    // Load medic model
    const result = await SceneLoader.ImportMeshAsync("", "/models/", "medic_m.glb", scene);

    console.log(`${side} model loaded successfully`);

    // Position models in world space - centered so we can see them
    // Camera is at arc (π/2, π/2.2, 6) looking at (0, 0.8, 0)
    const modelX = side === "left" ? -0.5 : 0.5;

    const root = result.meshes[0];
    root.position = new Vector3(modelX, 0, 0);
    root.scaling = new Vector3(0.8, 0.8, 0.8);

    // Start idle animation
    const idleAnim = result.animationGroups.find(ag => ag.name === "Idle_Gun");
    result.animationGroups.forEach(ag => ag.stop());
    idleAnim?.start(true);

    const preview: MedicPreview = {
      meshes: result.meshes,
      animationGroups: result.animationGroups,
      rtt: null as unknown as RenderTargetTexture,
      previewCamera: null as unknown as ArcRotateCamera,
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
    panel.background = "transparent"; // Transparent so 3D shows through
    panel.cornerRadius = 10;
    panel.thickness = 2;
    panel.color = color;

    const container = new StackPanel();
    container.width = "95%";
    panel.addControl(container);

    // Player name
    const nameText = new TextBlock();
    nameText.text = playerName;
    nameText.color = color;
    nameText.fontSize = 22;
    nameText.height = "35px";
    nameText.fontWeight = "bold";
    container.addControl(nameText);

    // Selection display
    const selectionDisplay = new TextBlock();
    selectionDisplay.text = "Selected: (choose 3)";
    selectionDisplay.color = "#888888";
    selectionDisplay.fontSize = 13;
    selectionDisplay.height = "22px";
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

    // Tank button
    const tankBtn = Button.CreateSimpleButton(`${playerName}_tank`, "+ Tank");
    tankBtn.width = "100%";
    tankBtn.height = "35px";
    tankBtn.color = "white";
    tankBtn.background = "#333355";
    tankBtn.cornerRadius = 5;
    tankBtn.paddingTop = "2px";
    tankBtn.paddingBottom = "2px";
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
        updateStartButton();
      }
    });
    container.addControl(tankBtn);

    // Damage button
    const damageBtn = Button.CreateSimpleButton(`${playerName}_damage`, "+ Damage");
    damageBtn.width = "100%";
    damageBtn.height = "35px";
    damageBtn.color = "white";
    damageBtn.background = "#333355";
    damageBtn.cornerRadius = 5;
    damageBtn.paddingTop = "2px";
    damageBtn.paddingBottom = "2px";
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
        updateStartButton();
      }
    });
    container.addControl(damageBtn);

    // === SUPPORT PANEL with 3 internal columns ===
    const supportPanel = new Rectangle();
    supportPanel.width = "100%";
    supportPanel.height = "220px";
    supportPanel.background = "transparent"; // Transparent so preview shows through
    supportPanel.cornerRadius = 5;
    supportPanel.thickness = 1;
    supportPanel.color = "#555588";
    supportPanel.paddingTop = "3px";
    container.addControl(supportPanel);

    const supportContainer = new StackPanel();
    supportContainer.width = "98%";
    supportPanel.addControl(supportContainer);

    // Support title
    const supportTitle = new TextBlock();
    supportTitle.text = "SUPPORT (Medic)";
    supportTitle.color = "#88ff88";
    supportTitle.fontSize = 14;
    supportTitle.height = "22px";
    supportTitle.fontWeight = "bold";
    supportContainer.addControl(supportTitle);

    // Current customization
    const currentCustomization: SupportCustomization = {
      head: 0,
      weapon: "gun",
      skinTone: 2,
      hairColor: 0,
      eyeColor: 0,
      body: "male"
    };

    // 3-column grid: Options Col1, Options Col2, Preview
    const innerGrid = new Grid();
    innerGrid.width = "100%";
    innerGrid.height = "150px";
    innerGrid.addColumnDefinition(0.33);
    innerGrid.addColumnDefinition(0.33);
    innerGrid.addColumnDefinition(0.34);
    innerGrid.addRowDefinition(1);
    supportContainer.addControl(innerGrid);

    // Column 1: Head, Skin, Eyes
    const col1Bg = new Rectangle();
    col1Bg.background = "#2a2a4e";
    col1Bg.thickness = 0;
    innerGrid.addControl(col1Bg, 0, 0);

    const col1 = new StackPanel();
    col1.width = "100%";
    col1Bg.addControl(col1);

    // We'll define updatePreviewText before the choosers so they can call it
    let updatePreviewText: () => void;

    col1.addControl(createOptionChooser("Head", ["1", "2", "3", "4"], 0, (idx) => {
      currentCustomization.head = idx;
      updatePreview(previews[side], currentCustomization);
      updatePreviewText?.();
    }));
    col1.addControl(createColorChooser("Skin", SKIN_TONES, 2, (idx) => {
      currentCustomization.skinTone = idx;
      updatePreview(previews[side], currentCustomization);
    }));
    col1.addControl(createColorChooser("Eyes", EYE_COLORS, 0, (idx) => {
      currentCustomization.eyeColor = idx;
      updatePreview(previews[side], currentCustomization);
    }));

    // Column 2: Weapon, Hair, Body
    const col2Bg = new Rectangle();
    col2Bg.background = "#2a2a4e";
    col2Bg.thickness = 0;
    innerGrid.addControl(col2Bg, 0, 1);

    const col2 = new StackPanel();
    col2.width = "100%";
    col2Bg.addControl(col2);

    col2.addControl(createOptionChooser("Weapon", ["Gun", "Sword"], 0, (idx) => {
      currentCustomization.weapon = idx === 0 ? "gun" : "sword";
      updatePreview(previews[side], currentCustomization);
      updatePreviewText?.();
    }));
    col2.addControl(createColorChooser("Hair", HAIR_COLORS, 0, (idx) => {
      currentCustomization.hairColor = idx;
      updatePreview(previews[side], currentCustomization);
    }));
    col2.addControl(createOptionChooser("Body", ["M", "F"], 0, (idx) => {
      currentCustomization.body = idx === 0 ? "male" : "female";
      updatePreview(previews[side], currentCustomization);
      updatePreviewText?.();
    }));

    // Column 3: 3D Preview area
    const previewArea = new Rectangle();
    previewArea.width = "100%";
    previewArea.height = "100%";
    previewArea.background = "#222244";
    previewArea.thickness = 1;
    previewArea.color = "#444466";
    previewArea.cornerRadius = 5;
    innerGrid.addControl(previewArea, 0, 2);

    const previewLabel = new TextBlock();
    previewLabel.text = "Preview";
    previewLabel.color = "#888899";
    previewLabel.fontSize = 9;
    previewLabel.top = "-42%";
    previewArea.addControl(previewLabel);

    // Loading indicator while model loads
    const loadingText = new TextBlock();
    loadingText.text = "Loading...";
    loadingText.color = "#666688";
    loadingText.fontSize = 10;
    previewArea.addControl(loadingText);

    // Initialize 3D preview asynchronously
    createMedicPreview(side, previewArea, currentCustomization)
      .then((preview) => {
        previews[side] = preview;
        loadingText.text = ""; // Hide loading text
      })
      .catch((err) => {
        console.error(`Failed to load ${side} preview:`, err);
        loadingText.text = "Error";
        loadingText.color = "#ff4444";
      });

    // No-op for backwards compatibility with chooser callbacks
    updatePreviewText = (): void => {};

    // +Add Medic button
    const addBtn = Button.CreateSimpleButton(`${playerName}_addSupport`, "+ Add Medic");
    addBtn.width = "100%";
    addBtn.height = "35px";
    addBtn.color = "white";
    addBtn.background = "#338833";
    addBtn.cornerRadius = 5;
    addBtn.fontSize = 14;
    addBtn.fontWeight = "bold";
    addBtn.onPointerEnterObservable.add(() => {
      const info = UNIT_INFO.support;
      infoText.text = `${info.name}: HP ${info.hp} | ATK ${info.attack} | Range ${info.attackRange} - ${info.description}`;
      infoText.color = "white";
      addBtn.background = "#44aa44";
    });
    addBtn.onPointerOutObservable.add(() => {
      infoText.text = "Hover over a unit type to see stats";
      infoText.color = "#888888";
      addBtn.background = "#338833";
    });
    addBtn.onPointerClickObservable.add(() => {
      if (selectionArray.length < 3) {
        selectionArray.push({ type: "support", customization: { ...currentCustomization } });
        updateSelectionDisplay();
        updateStartButton();
      }
    });
    supportContainer.addControl(addBtn);

    // Clear button
    const clearBtn = Button.CreateSimpleButton(`${playerName}_clear`, "Clear All");
    clearBtn.width = "100%";
    clearBtn.height = "28px";
    clearBtn.color = "#ff6666";
    clearBtn.background = "#442222";
    clearBtn.cornerRadius = 5;
    clearBtn.paddingTop = "3px";
    clearBtn.onPointerClickObservable.add(() => {
      selectionArray.length = 0;
      updateSelectionDisplay();
      updateStartButton();
    });
    container.addControl(clearBtn);

    return panel;
  }

  // Helper: option chooser
  function createOptionChooser(label: string, options: string[], defaultIdx: number, onChange: (idx: number) => void): StackPanel {
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

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.height = "24px";
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(btnRow);

    const buttons: Button[] = [];
    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`opt_${label}_${i}`, opt);
      btn.width = "28px";
      btn.height = "20px";
      btn.color = "white";
      btn.background = i === defaultIdx ? "#4488ff" : "#333355";
      btn.cornerRadius = 3;
      btn.fontSize = 9;
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
