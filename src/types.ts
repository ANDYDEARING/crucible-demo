export type UnitType = "tank" | "damage" | "support";
export type WeaponType = "gun" | "sword";

export type BodyType = "male" | "female";

export interface SupportCustomization {
  head: number;
  weapon: WeaponType;
  skinTone: number;
  hairColor: number;
  eyeColor: number;
  body: BodyType;
}

export interface UnitSelection {
  type: UnitType;
  customization?: SupportCustomization;
}

export interface Loadout {
  player: UnitSelection[];
  enemy: UnitSelection[];
}

export const UNIT_INFO: Record<UnitType, { name: string; hp: number; attack: number; moveRange: number; attackRange: number; description: string }> = {
  tank: {
    name: "Tank",
    hp: 100,
    attack: 15,
    moveRange: 2,
    attackRange: 1,
    description: "High HP, low damage. Gets in the enemy's face."
  },
  damage: {
    name: "Damage",
    hp: 50,
    attack: 30,
    moveRange: 4,
    attackRange: 2,
    description: "Glass cannon. Fast and deadly, but fragile."
  },
  support: {
    name: "Support",
    hp: 60,
    attack: 10,
    moveRange: 3,
    attackRange: 3,
    description: "Can heal allies OR attack. Choose wisely each turn."
  }
};
