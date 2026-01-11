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
} from "@babylonjs/gui";
import { UnitType, UNIT_INFO, Loadout } from "../types";

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

  // Main container - shifted up to make room for bottom UI
  const mainGrid = new Grid();
  mainGrid.width = "90%";
  mainGrid.height = "65%";
  mainGrid.top = "-5%";
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
  infoPanel.top = "38%";
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
  startBtn.top = "44%";
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
    selectionArray: UnitType[],
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
    nameText.fontSize = 28;
    nameText.height = "50px";
    nameText.fontWeight = "bold";
    container.addControl(nameText);

    // Selection display
    const selectionDisplay = new TextBlock();
    selectionDisplay.text = "Selected: (choose 3)";
    selectionDisplay.color = "#888888";
    selectionDisplay.fontSize = 16;
    selectionDisplay.height = "30px";
    container.addControl(selectionDisplay);

    const updateSelectionDisplay = (): void => {
      if (selectionArray.length === 0) {
        selectionDisplay.text = "Selected: (choose 3)";
        selectionDisplay.color = "#888888";
      } else {
        const names = selectionArray.map(t => UNIT_INFO[t].name);
        selectionDisplay.text = `Selected: ${names.join(", ")}`;
        selectionDisplay.color = selectionArray.length === 3 ? "#44ff44" : "white";
      }
    };

    // Unit type buttons
    const unitTypes: UnitType[] = ["tank", "damage", "support"];
    for (const unitType of unitTypes) {
      const info = UNIT_INFO[unitType];

      const btn = Button.CreateSimpleButton(`${playerName}_${unitType}`, `+ ${info.name}`);
      btn.width = "100%";
      btn.height = "60px";
      btn.color = "white";
      btn.background = "#333355";
      btn.cornerRadius = 5;
      btn.paddingTop = "5px";
      btn.paddingBottom = "5px";

      btn.onPointerEnterObservable.add(() => {
        infoText.text = `${info.name}: HP ${info.hp} | ATK ${info.attack} | Move ${info.moveRange} | Range ${info.attackRange} - ${info.description}`;
        infoText.color = "white";
      });

      btn.onPointerOutObservable.add(() => {
        infoText.text = "Hover over a unit type to see stats";
        infoText.color = "#888888";
      });

      btn.onPointerClickObservable.add(() => {
        if (selectionArray.length < 3) {
          selectionArray.push(unitType);
          updateSelectionDisplay();
          onUpdate();
        }
      });

      container.addControl(btn);
    }

    // Clear button
    const clearBtn = Button.CreateSimpleButton(`${playerName}_clear`, "Clear");
    clearBtn.width = "100%";
    clearBtn.height = "40px";
    clearBtn.color = "#ff6666";
    clearBtn.background = "#442222";
    clearBtn.cornerRadius = 5;
    clearBtn.paddingTop = "10px";

    clearBtn.onPointerClickObservable.add(() => {
      selectionArray.length = 0;
      updateSelectionDisplay();
      onUpdate();
    });

    container.addControl(clearBtn);

    return panel;
  }

  return scene;
}
