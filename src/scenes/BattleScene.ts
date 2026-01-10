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
import { AdvancedDynamicTexture, TextBlock, Button } from "@babylonjs/gui";

const GRID_SIZE = 8;
const TILE_SIZE = 1;
const TILE_GAP = 0.05;

interface Unit {
  mesh: Mesh;
  type: "tank" | "damage" | "support";
  team: "player" | "enemy";
  gridX: number;
  gridZ: number;
}

export function createBattleScene(engine: Engine, _canvas: HTMLCanvasElement): Scene {
  const scene = new Scene(engine);
  scene.clearColor.set(0.1, 0.1, 0.15, 1);

  // Camera - isometric view
  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 4,      // alpha - rotation around Y
    Math.PI / 3,      // beta - angle from top (60 degrees)
    12,               // radius
    new Vector3(0, 0, 0),
    scene
  );
  camera.attachControl(true);

  // Constrain camera to reasonable angles
  camera.lowerBetaLimit = 0.3;           // Don't go too low
  camera.upperBetaLimit = Math.PI / 2.2; // Don't go under the map
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 20;

  // Lighting
  new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  const dirLight = new DirectionalLight("dirLight", new Vector3(-1, -2, -1), scene);
  dirLight.intensity = 0.5;

  // Materials
  const tileMaterialLight = new StandardMaterial("tileLightMat", scene);
  tileMaterialLight.diffuseColor = new Color3(0.3, 0.5, 0.3);

  const tileMaterialDark = new StandardMaterial("tileDarkMat", scene);
  tileMaterialDark.diffuseColor = new Color3(0.2, 0.4, 0.2);

  const selectedMaterial = new StandardMaterial("selectedMat", scene);
  selectedMaterial.diffuseColor = new Color3(0.8, 0.8, 0.2);

  // Unit materials by type
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
        {
          width: TILE_SIZE - TILE_GAP,
          height: 0.1,
          depth: TILE_SIZE - TILE_GAP
        },
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

  // Place units - 3v3
  const units: Unit[] = [];

  // Player units (bottom of grid)
  units.push(createUnit("tank", "player", 1, 1, scene, unitMaterials, gridOffset));
  units.push(createUnit("damage", "player", 3, 0, scene, unitMaterials, gridOffset));
  units.push(createUnit("support", "player", 5, 1, scene, unitMaterials, gridOffset));

  // Enemy units (top of grid)
  units.push(createUnit("tank", "enemy", 6, 6, scene, unitMaterials, gridOffset));
  units.push(createUnit("damage", "enemy", 4, 7, scene, unitMaterials, gridOffset));
  units.push(createUnit("support", "enemy", 2, 6, scene, unitMaterials, gridOffset));

  // Selection state
  let selectedUnit: Unit | null = null;
  let selectedTile: Mesh | null = null;

  // Click handling
  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type === PointerEventTypes.POINTERPICK) {
      const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
      if (!pickedMesh) return;

      // Clear previous selection highlight
      if (selectedTile) {
        const { gridX, gridZ } = selectedTile.metadata;
        selectedTile.material = (gridX + gridZ) % 2 === 0 ? tileMaterialLight : tileMaterialDark;
      }

      const metadata = pickedMesh.metadata;
      if (metadata?.type === "tile") {
        selectedTile = pickedMesh as Mesh;
        selectedTile.material = selectedMaterial;
        console.log(`Selected tile: ${metadata.gridX}, ${metadata.gridZ}`);

        // If we have a unit selected and clicked empty tile, move there
        if (selectedUnit) {
          moveUnit(selectedUnit, metadata.gridX, metadata.gridZ, gridOffset, units);
          selectedUnit = null;
        }
      } else if (metadata?.type === "unit") {
        const unit = units.find(u => u.mesh === pickedMesh);
        if (unit) {
          selectedUnit = unit;
          // Highlight the tile under the unit
          selectedTile = tiles[unit.gridX][unit.gridZ];
          selectedTile.material = selectedMaterial;
          console.log(`Selected ${unit.team} ${unit.type} at ${unit.gridX}, ${unit.gridZ}`);
        }
      }
    }
  });

  // GUI overlay
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Turn indicator
  const turnText = new TextBlock();
  turnText.text = "Player 1's Turn";
  turnText.color = "white";
  turnText.fontSize = 24;
  turnText.top = "-45%";
  turnText.horizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
  gui.addControl(turnText);

  // End turn button
  const endTurnBtn = Button.CreateSimpleButton("endTurn", "END TURN");
  endTurnBtn.width = "120px";
  endTurnBtn.height = "40px";
  endTurnBtn.color = "white";
  endTurnBtn.background = "#444444";
  endTurnBtn.cornerRadius = 5;
  endTurnBtn.top = "45%";
  endTurnBtn.horizontalAlignment = Button.HORIZONTAL_ALIGNMENT_CENTER;
  endTurnBtn.onPointerClickObservable.add(() => {
    console.log("End turn clicked");
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
  team: "player" | "enemy",
  gridX: number,
  gridZ: number,
  scene: Scene,
  materials: Record<string, StandardMaterial>,
  gridOffset: number
): Unit {
  // Different sizes for different unit types
  const sizes = {
    tank: { width: 0.7, height: 0.8, depth: 0.7 },
    damage: { width: 0.5, height: 0.9, depth: 0.5 },
    support: { width: 0.5, height: 0.7, depth: 0.5 },
  };

  const size = sizes[type];
  const mesh = MeshBuilder.CreateBox(`${team}_${type}`, size, scene);

  mesh.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    size.height / 2 + 0.05, // Sit on top of tile
    gridZ * TILE_SIZE - gridOffset
  );

  // Tint enemy units slightly darker
  if (team === "enemy") {
    const enemyMat = materials[type].clone(`${type}_enemy`);
    enemyMat.diffuseColor = materials[type].diffuseColor.scale(0.7);
    mesh.material = enemyMat;
  } else {
    mesh.material = materials[type];
  }

  mesh.metadata = { type: "unit", unitType: type, team };

  return { mesh, type, team, gridX, gridZ };
}

function moveUnit(unit: Unit, newX: number, newZ: number, gridOffset: number, allUnits: Unit[]): void {
  // Check if tile is occupied
  const occupied = allUnits.some(u => u.gridX === newX && u.gridZ === newZ && u !== unit);
  if (occupied) {
    console.log("Tile occupied!");
    return;
  }

  // Update position
  unit.gridX = newX;
  unit.gridZ = newZ;

  const height = unit.mesh.getBoundingInfo().boundingBox.extendSize.y;
  unit.mesh.position = new Vector3(
    newX * TILE_SIZE - gridOffset,
    height + 0.05,
    newZ * TILE_SIZE - gridOffset
  );

  console.log(`Moved ${unit.type} to ${newX}, ${newZ}`);
}
