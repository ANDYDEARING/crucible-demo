export type UnitType = "tank" | "damage" | "support";
export type WeaponType = "gun" | "sword";

export type BodyType = "male" | "female";
export type CombatStyle = "melee" | "ranged";
export type Handedness = "right" | "left";

export interface SupportCustomization {
  body: BodyType;
  combatStyle: CombatStyle;
  handedness: Handedness;
  head: number;  // 0-3 for Head_001 through Head_004
  hairColor: number;
  eyeColor: number;
  skinTone: number;
}

export interface UnitSelection {
  type: UnitType;
  customization?: SupportCustomization;
}

export interface Loadout {
  player: UnitSelection[];
  enemy: UnitSelection[];
  playerTeamColor?: string;  // hex color for player team
  enemyTeamColor?: string;   // hex color for enemy team
}

export const UNIT_INFO: Record<UnitType, { name: string; hp: number; attack: number; moveRange: number; attackRange: number; description: string }> = {
  tank: {
    name: "Soldier",
    hp: 100,
    attack: 15,
    moveRange: 2,
    attackRange: 1,
    description: "High HP, low damage. Gets in the enemy's face."
  },
  damage: {
    name: "Operator",
    hp: 50,
    attack: 30,
    moveRange: 4,
    attackRange: 2,
    description: "Glass cannon. Fast and deadly, but fragile."
  },
  support: {
    name: "Medic",
    hp: 60,
    attack: 10,
    moveRange: 3,
    attackRange: 3,
    description: "Can heal allies OR attack. Choose wisely each turn."
  }
};
