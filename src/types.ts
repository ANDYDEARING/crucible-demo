// Class identifiers
export type UnitClass = "soldier" | "operator" | "medic";

export type BodyType = "male" | "female";
export type CombatStyle = "melee" | "ranged";
export type Handedness = "right" | "left";

export interface UnitCustomization {
  body: BodyType;
  combatStyle: CombatStyle;
  handedness: Handedness;
  head: number;  // 0-3 for Head_001 through Head_004
  hairColor: number;
  eyeColor: number;
  skinTone: number;
}

export interface UnitSelection {
  unitClass: UnitClass;
  customization?: UnitCustomization;
}

export interface Loadout {
  player1: UnitSelection[];
  player2: UnitSelection[];
  player1TeamColor?: string;  // hex color for player 1 team
  player2TeamColor?: string;  // hex color for player 2 team
}

// Class data with stats (unified for now, will balance later)
export interface ClassData {
  id: UnitClass;
  name: string;
  description: string;
  hp: number;
  attack: number;
  moveRange: number;
  attackRange: number;
  healAmount: number;
  ability: string;
  modelFile: string;  // base filename without gender suffix
}

export const CLASS_DATA: Record<UnitClass, ClassData> = {
  soldier: {
    id: "soldier",
    name: "Soldier",
    description: "Frontline fighter. Uses Cover to protect allies.",
    hp: 75,
    attack: 20,
    moveRange: 3,
    attackRange: 2,
    healAmount: 0,
    ability: "Cover",
    modelFile: "soldier",
  },
  operator: {
    id: "operator",
    name: "Operator",
    description: "Stealth specialist. Uses Conceal to avoid damage.",
    hp: 75,
    attack: 20,
    moveRange: 3,
    attackRange: 2,
    healAmount: 0,
    ability: "Conceal",
    modelFile: "operator",
  },
  medic: {
    id: "medic",
    name: "Medic",
    description: "Support unit. Can heal allies or attack.",
    hp: 75,
    attack: 20,
    moveRange: 3,
    attackRange: 2,
    healAmount: 25,
    ability: "Heal",
    modelFile: "medic",
  },
};

// Get all class IDs
export const ALL_CLASSES: UnitClass[] = ["soldier", "operator", "medic"];

// Helper to get class data
export function getClassData(unitClass: UnitClass): ClassData {
  return CLASS_DATA[unitClass];
}
