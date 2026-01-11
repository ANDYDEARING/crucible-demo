import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  PointerEventTypes,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, Button, Rectangle } from "@babylonjs/gui";
import type { Loadout, UnitType } from "../types";

const GRID_SIZE = 8;
const TILE_SIZE = 1;
const TILE_GAP = 0.05;

const UNIT_STATS = {
  tank: { hp: 100, attack: 15, moveRange: 2, attackRange: 1, healAmount: 0 },
  damage: { hp: 50, attack: 30, moveRange: 4, attackRange: 2, healAmount: 0 },
  support: { hp: 60, attack: 10, moveRange: 3, attackRange: 3, healAmount: 25 },
};

type Team = "player" | "enemy";

interface Unit {
  mesh: Mesh;
  baseMesh: Mesh;
  type: "tank" | "damage" | "support";
  team: Team;
  gridX: number;
  gridZ: number;
  moveRange: number;
  attackRange: number;
  hp: number;
  maxHp: number;
  attack: number;
  healAmount: number;
  hpBar?: Rectangle;
  hpBarBg?: Rectangle;
  hasMoved: boolean;
  hasAttacked: boolean;
  originalColor: Color3;
}

export function createBattleScene(engine: Engine, _canvas: HTMLCanvasElement, loadout: Loadout | null): Scene {
  const scene = new Scene(engine);
  scene.clearColor.set(0.1, 0.1, 0.15, 1);

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 4,
    Math.PI / 3,
    12,
    new Vector3(0, 0, 0),
    scene
  );
  camera.attachControl(true);
  camera.lowerBetaLimit = 0.3;
  camera.upperBetaLimit = Math.PI / 2.2;
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 20;

  new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, -1), scene);
  dirLight.intensity = 0.5;

  // Tile materials
  const tileMaterialLight = new StandardMaterial("tileLightMat", scene);
  tileMaterialLight.diffuseColor = new Color3(0.3, 0.5, 0.3);

  const tileMaterialDark = new StandardMaterial("tileDarkMat", scene);
  tileMaterialDark.diffuseColor = new Color3(0.2, 0.4, 0.2);

  const selectedMaterial = new StandardMaterial("selectedMat", scene);
  selectedMaterial.diffuseColor = new Color3(0.8, 0.8, 0.2);

  const validMoveMaterial = new StandardMaterial("validMoveMat", scene);
  validMoveMaterial.diffuseColor = new Color3(0.3, 0.6, 0.9);

  const attackableMaterial = new StandardMaterial("attackableMat", scene);
  attackableMaterial.diffuseColor = new Color3(0.9, 0.3, 0.3);

  const healableMaterial = new StandardMaterial("healableMat", scene);
  healableMaterial.diffuseColor = new Color3(0.3, 0.9, 0.5);

  const unitMaterials = {
    tank: createUnitMaterial("tank", new Color3(0.3, 0.3, 0.8), scene),
    damage: createUnitMaterial("damage", new Color3(0.8, 0.2, 0.2), scene),
    support: createUnitMaterial("support", new Color3(0.2, 0.8, 0.3), scene),
  };

  // Create grid
  const tiles: Mesh[][] = [];
  const gridOffset = (GRID_SIZE * TILE_SIZE) / 2 - TILE_SIZE / 2;

  for (let x = 0; x < GRID_SIZE; x++) {
    tiles[x] = [];
    for (let z = 0; z < GRID_SIZE; z++) {
      const tile = MeshBuilder.CreateBox(
        `tile_${x}_${z}`,
        { width: TILE_SIZE - TILE_GAP, height: 0.1, depth: TILE_SIZE - TILE_GAP },
        scene
      );
      tile.position = new Vector3(
        x * TILE_SIZE - gridOffset,
        0,
        z * TILE_SIZE - gridOffset
      );
      tile.material = (x + z) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
      tile.metadata = { type: "tile", gridX: x, gridZ: z };
      tiles[x][z] = tile;
    }
  }

  // GUI
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Units
  const units: Unit[] = [];

  // Starting positions for each team
  const playerPositions = [
    { x: 1, z: 1 },
    { x: 3, z: 0 },
    { x: 5, z: 1 },
  ];
  const enemyPositions = [
    { x: 6, z: 6 },
    { x: 4, z: 7 },
    { x: 2, z: 6 },
  ];

  // Use loadout if provided, otherwise default setup
  const playerUnits: UnitType[] = loadout?.player ?? ["tank", "damage", "support"];
  const enemyUnits: UnitType[] = loadout?.enemy ?? ["tank", "damage", "support"];

  // Spawn player units
  for (let i = 0; i < playerUnits.length; i++) {
    const pos = playerPositions[i];
    units.push(createUnit(playerUnits[i], "player", pos.x, pos.z, scene, unitMaterials, gridOffset, gui));
  }

  // Spawn enemy units
  for (let i = 0; i < enemyUnits.length; i++) {
    const pos = enemyPositions[i];
    units.push(createUnit(enemyUnits[i], "enemy", pos.x, pos.z, scene, unitMaterials, gridOffset, gui));
  }

  // Game state
  let selectedUnit: Unit | null = null;
  let highlightedTiles: Mesh[] = [];
  let attackableUnits: Unit[] = [];
  let healableUnits: Unit[] = [];
  let gameOver = false;
  let currentTeam: Team = "player";

  function getDefaultTileMaterial(x: number, z: number): StandardMaterial {
    return (x + z) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
  }

  function clearHighlights(): void {
    for (const tile of highlightedTiles) {
      const { gridX, gridZ } = tile.metadata;
      tile.material = getDefaultTileMaterial(gridX, gridZ);
    }
    highlightedTiles = [];
    attackableUnits = [];
    healableUnits = [];
  }

  function getValidMoveTiles(unit: Unit): { x: number; z: number }[] {
    if (unit.hasMoved) return []; // Already moved this turn
    const valid: { x: number; z: number }[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const distance = Math.abs(x - unit.gridX) + Math.abs(z - unit.gridZ);
        if (distance > 0 && distance <= unit.moveRange) {
          const occupied = units.some(u => u.gridX === x && u.gridZ === z);
          if (!occupied) {
            valid.push({ x, z });
          }
        }
      }
    }
    return valid;
  }

  function getAttackableEnemies(unit: Unit): Unit[] {
    if (unit.hasAttacked) return []; // Already attacked this turn
    return units.filter(u => {
      if (u.team === unit.team) return false;
      const distance = Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridZ - unit.gridZ);
      return distance <= unit.attackRange;
    });
  }

  function getHealableAllies(unit: Unit): Unit[] {
    // Only support can heal, and only if hasn't attacked this turn
    if (unit.healAmount <= 0 || unit.hasAttacked) return [];
    return units.filter(u => {
      if (u.team !== unit.team) return false; // Must be same team
      if (u === unit) return false; // Can't heal self
      if (u.hp >= u.maxHp) return false; // Already at full health
      const distance = Math.abs(u.gridX - unit.gridX) + Math.abs(u.gridZ - unit.gridZ);
      return distance <= unit.attackRange; // Uses attack range for heal range
    });
  }

  function highlightValidActions(unit: Unit): void {
    clearHighlights();

    // Highlight move tiles (if hasn't moved)
    const validTiles = getValidMoveTiles(unit);
    for (const { x, z } of validTiles) {
      const tile = tiles[x][z];
      tile.material = validMoveMaterial;
      highlightedTiles.push(tile);
    }

    // Highlight current tile
    const currentTile = tiles[unit.gridX][unit.gridZ];
    currentTile.material = selectedMaterial;
    highlightedTiles.push(currentTile);

    // Highlight attackable enemies (if hasn't attacked)
    attackableUnits = getAttackableEnemies(unit);
    for (const enemy of attackableUnits) {
      const tile = tiles[enemy.gridX][enemy.gridZ];
      tile.material = attackableMaterial;
      highlightedTiles.push(tile);
    }

    // Highlight healable allies (support only, if hasn't attacked)
    healableUnits = getHealableAllies(unit);
    for (const ally of healableUnits) {
      const tile = tiles[ally.gridX][ally.gridZ];
      tile.material = healableMaterial;
      highlightedTiles.push(tile);
    }
  }

  function isValidMove(x: number, z: number): boolean {
    return highlightedTiles.some(tile => {
      const meta = tile.metadata;
      return meta.gridX === x && meta.gridZ === z && tile.material === validMoveMaterial;
    });
  }

  function setUnitExhausted(unit: Unit): void {
    // Desaturate the unit mesh
    const mat = unit.mesh.material as StandardMaterial;
    const gray = (unit.originalColor.r + unit.originalColor.g + unit.originalColor.b) / 3;
    mat.diffuseColor = new Color3(gray * 0.5, gray * 0.5, gray * 0.5);

    // Dim the base
    const baseMat = unit.baseMesh.material as StandardMaterial;
    baseMat.diffuseColor = baseMat.diffuseColor.scale(0.4);
    baseMat.emissiveColor = new Color3(0, 0, 0);
  }

  function resetUnitAppearance(unit: Unit): void {
    const mat = unit.mesh.material as StandardMaterial;
    mat.diffuseColor = unit.team === "enemy"
      ? unit.originalColor.scale(0.7)
      : unit.originalColor.clone();

    const baseMat = unit.baseMesh.material as StandardMaterial;
    if (unit.team === "player") {
      baseMat.diffuseColor = new Color3(0.2, 0.4, 0.9);
      baseMat.emissiveColor = new Color3(0.1, 0.2, 0.4);
    } else {
      baseMat.diffuseColor = new Color3(0.9, 0.4, 0.2);
      baseMat.emissiveColor = new Color3(0.4, 0.2, 0.1);
    }
  }

  function attackUnit(attacker: Unit, defender: Unit): void {
    defender.hp -= attacker.attack;
    console.log(`${attacker.team} ${attacker.type} attacks ${defender.team} ${defender.type} for ${attacker.attack} damage! (${defender.hp}/${defender.maxHp} HP)`);

    attacker.hasAttacked = true;
    setUnitExhausted(attacker);

    updateHpBar(defender);

    if (defender.hp <= 0) {
      console.log(`${defender.team} ${defender.type} was defeated!`);
      defender.mesh.dispose();
      defender.baseMesh.dispose();
      if (defender.hpBar) defender.hpBar.dispose();
      if (defender.hpBarBg) defender.hpBarBg.dispose();
      const index = units.indexOf(defender);
      if (index > -1) units.splice(index, 1);
      checkWinCondition();
    }
  }

  function healUnit(healer: Unit, target: Unit): void {
    const healedAmount = Math.min(healer.healAmount, target.maxHp - target.hp);
    target.hp += healedAmount;
    console.log(`${healer.team} ${healer.type} heals ${target.team} ${target.type} for ${healedAmount} HP! (${target.hp}/${target.maxHp} HP)`);

    healer.hasAttacked = true; // Uses the same action as attacking
    setUnitExhausted(healer);

    updateHpBar(target);
  }

  function checkWinCondition(): void {
    const playerUnits = units.filter(u => u.team === "player");
    const enemyUnits = units.filter(u => u.team === "enemy");

    if (enemyUnits.length === 0) {
      gameOver = true;
      showGameOver("VICTORY!");
    } else if (playerUnits.length === 0) {
      gameOver = true;
      showGameOver("DEFEAT");
    }
  }

  function showGameOver(message: string): void {
    const overlay = new Rectangle();
    overlay.width = "100%";
    overlay.height = "100%";
    overlay.background = "rgba(0,0,0,0.7)";
    gui.addControl(overlay);

    const text = new TextBlock();
    text.text = message;
    text.color = message === "VICTORY!" ? "#44ff44" : "#ff4444";
    text.fontSize = 72;
    overlay.addControl(text);
  }

  function updateHpBar(unit: Unit): void {
    if (unit.hpBar) {
      const hpPercent = Math.max(0, unit.hp / unit.maxHp);
      unit.hpBar.width = `${30 * hpPercent}px`;
      if (hpPercent < 0.3) {
        unit.hpBar.background = "#ff4444";
      } else if (hpPercent < 0.6) {
        unit.hpBar.background = "#ffaa44";
      }
    }
  }

  function endTurn(): void {
    clearHighlights();
    selectedUnit = null;

    // Reset all units for the current team
    for (const unit of units) {
      unit.hasMoved = false;
      unit.hasAttacked = false;
      resetUnitAppearance(unit);
    }

    // Switch teams
    currentTeam = currentTeam === "player" ? "enemy" : "player";
    updateTurnIndicator();
  }

  function updateTurnIndicator(): void {
    const teamName = currentTeam === "player" ? "Player 1" : "Player 2";
    const teamColor = currentTeam === "player" ? "#4488ff" : "#ff8844";
    turnText.text = `${teamName}'s Turn`;
    turnText.color = teamColor;
  }

  function canSelectUnit(unit: Unit): boolean {
    // Must be current team and not exhausted (attacked)
    return unit.team === currentTeam && !unit.hasAttacked;
  }

  // Click handling
  scene.onPointerObservable.add((pointerInfo) => {
    if (gameOver) return;
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!pickedMesh) return;

    const metadata = pickedMesh.metadata;

    if (metadata?.type === "tile") {
      const { gridX, gridZ } = metadata;

      if (selectedUnit) {
        if (isValidMove(gridX, gridZ)) {
          moveUnit(selectedUnit, gridX, gridZ, gridOffset);
          selectedUnit.hasMoved = true;

          // After moving, check if can still attack
          if (!selectedUnit.hasAttacked) {
            // Re-highlight to show attack/heal options from new position
            highlightValidActions(selectedUnit);

            // If no actions left, deselect
            const canAttack = getAttackableEnemies(selectedUnit).length > 0;
            const canHeal = getHealableAllies(selectedUnit).length > 0;
            if (!canAttack && !canHeal) {
              clearHighlights();
              selectedUnit = null;
            }
          } else {
            clearHighlights();
            selectedUnit = null;
          }
        } else {
          clearHighlights();
          selectedUnit = null;
        }
      }
    } else if (metadata?.type === "unit") {
      const clickedUnit = units.find(u => u.mesh === pickedMesh || u.baseMesh === pickedMesh);
      if (!clickedUnit) return;

      if (selectedUnit) {
        // Check if clicking an attackable enemy
        if (attackableUnits.includes(clickedUnit)) {
          attackUnit(selectedUnit, clickedUnit);
          clearHighlights();
          selectedUnit = null;
          return;
        }

        // Check if clicking a healable ally
        if (healableUnits.includes(clickedUnit)) {
          healUnit(selectedUnit, clickedUnit);
          clearHighlights();
          selectedUnit = null;
          return;
        }
      }

      // Try to select/deselect unit
      if (selectedUnit === clickedUnit) {
        clearHighlights();
        selectedUnit = null;
      } else if (canSelectUnit(clickedUnit)) {
        selectedUnit = clickedUnit;
        highlightValidActions(clickedUnit);
        console.log(`Selected ${clickedUnit.team} ${clickedUnit.type} (HP: ${clickedUnit.hp}/${clickedUnit.maxHp}, ATK: ${clickedUnit.attack})`);
      }
    }
  });

  // Turn indicator
  const turnText = new TextBlock();
  turnText.text = "Player 1's Turn";
  turnText.color = "#4488ff";
  turnText.fontSize = 24;
  turnText.top = "-45%";
  turnText.fontWeight = "bold";
  gui.addControl(turnText);

  // End turn button
  const endTurnBtn = Button.CreateSimpleButton("endTurn", "END TURN");
  endTurnBtn.width = "120px";
  endTurnBtn.height = "40px";
  endTurnBtn.color = "white";
  endTurnBtn.background = "#444444";
  endTurnBtn.cornerRadius = 5;
  endTurnBtn.top = "45%";
  endTurnBtn.onPointerClickObservable.add(() => {
    endTurn();
  });
  gui.addControl(endTurnBtn);

  // Rotation buttons
  const rotateLeftBtn = Button.CreateSimpleButton("rotateLeft", "↺");
  rotateLeftBtn.width = "50px";
  rotateLeftBtn.height = "50px";
  rotateLeftBtn.color = "white";
  rotateLeftBtn.background = "#444444";
  rotateLeftBtn.cornerRadius = 25;
  rotateLeftBtn.left = "-45%";
  rotateLeftBtn.top = "40%";
  rotateLeftBtn.onPointerClickObservable.add(() => {
    camera.alpha += Math.PI / 2;
  });
  gui.addControl(rotateLeftBtn);

  const rotateRightBtn = Button.CreateSimpleButton("rotateRight", "↻");
  rotateRightBtn.width = "50px";
  rotateRightBtn.height = "50px";
  rotateRightBtn.color = "white";
  rotateRightBtn.background = "#444444";
  rotateRightBtn.cornerRadius = 25;
  rotateRightBtn.left = "45%";
  rotateRightBtn.top = "40%";
  rotateRightBtn.onPointerClickObservable.add(() => {
    camera.alpha -= Math.PI / 2;
  });
  gui.addControl(rotateRightBtn);

  return scene;
}

function createUnitMaterial(name: string, color: Color3, scene: Scene): StandardMaterial {
  const mat = new StandardMaterial(`${name}Mat`, scene);
  mat.diffuseColor = color;
  return mat;
}

function createUnit(
  type: "tank" | "damage" | "support",
  team: Team,
  gridX: number,
  gridZ: number,
  scene: Scene,
  materials: Record<string, StandardMaterial>,
  gridOffset: number,
  gui: AdvancedDynamicTexture
): Unit {
  const stats = UNIT_STATS[type];
  const sizes = {
    tank: { width: 0.7, height: 0.8, depth: 0.7 },
    damage: { width: 0.5, height: 0.9, depth: 0.5 },
    support: { width: 0.5, height: 0.7, depth: 0.5 },
  };

  const size = sizes[type];

  // Team indicator base
  const baseMesh = MeshBuilder.CreateCylinder(
    `${team}_${type}_base_${gridX}_${gridZ}`,
    { diameter: 0.8, height: 0.08, tessellation: 24 },
    scene
  );
  const baseMat = new StandardMaterial(`${team}BaseMat_${gridX}_${gridZ}`, scene);
  baseMat.diffuseColor = team === "player" ? new Color3(0.2, 0.4, 0.9) : new Color3(0.9, 0.4, 0.2);
  baseMat.emissiveColor = team === "player" ? new Color3(0.1, 0.2, 0.4) : new Color3(0.4, 0.2, 0.1);
  baseMesh.material = baseMat;
  baseMesh.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    0.1,
    gridZ * TILE_SIZE - gridOffset
  );

  // Unit mesh
  const mesh = MeshBuilder.CreateBox(`${team}_${type}_${gridX}_${gridZ}`, size, scene);
  mesh.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    size.height / 2 + 0.14,
    gridZ * TILE_SIZE - gridOffset
  );

  const originalColor = materials[type].diffuseColor.clone();

  if (team === "enemy") {
    const enemyMat = materials[type].clone(`${type}_enemy_${gridX}_${gridZ}`);
    enemyMat.diffuseColor = originalColor.scale(0.7);
    mesh.material = enemyMat;
  } else {
    const playerMat = materials[type].clone(`${type}_player_${gridX}_${gridZ}`);
    mesh.material = playerMat;
  }

  mesh.metadata = { type: "unit", unitType: type, team };
  baseMesh.metadata = { type: "unit", unitType: type, team };

  // HP bar background
  const hpBarBg = new Rectangle();
  hpBarBg.width = "34px";
  hpBarBg.height = "6px";
  hpBarBg.background = "#333333";
  hpBarBg.thickness = 1;
  hpBarBg.color = "#000000";
  gui.addControl(hpBarBg);
  hpBarBg.linkWithMesh(mesh);
  hpBarBg.linkOffsetY = -50;

  // HP bar fill
  const hpBar = new Rectangle();
  hpBar.width = "30px";
  hpBar.height = "4px";
  hpBar.background = "#44ff44";
  hpBar.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.left = "2px";
  hpBarBg.addControl(hpBar);

  return {
    mesh,
    baseMesh,
    type,
    team,
    gridX,
    gridZ,
    moveRange: stats.moveRange,
    attackRange: stats.attackRange,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    healAmount: stats.healAmount,
    hpBar,
    hpBarBg,
    hasMoved: false,
    hasAttacked: false,
    originalColor,
  };
}

function moveUnit(unit: Unit, newX: number, newZ: number, gridOffset: number): void {
  unit.gridX = newX;
  unit.gridZ = newZ;

  const height = unit.mesh.getBoundingInfo().boundingBox.extendSize.y;
  unit.mesh.position = new Vector3(
    newX * TILE_SIZE - gridOffset,
    height + 0.14,
    newZ * TILE_SIZE - gridOffset
  );
  unit.baseMesh.position = new Vector3(
    newX * TILE_SIZE - gridOffset,
    0.1,
    newZ * TILE_SIZE - gridOffset
  );
}
