// Type definitions for WH40k Companion App data

export interface Statline {
  M: string;
  T: string;
  Sv: string;
  W: string;
  Ld: string;
  OC: string;
}

export interface WeaponProfile {
  name: string;
  type: string; // 'ranged' | 'melee'
  range: string;
  attacks: string;
  ballisticSkill: string | null;
  weaponSkill: string | null;
  strength: string;
  armourPenetration: string;
  damage: string;
  rules?: string[];
}

export interface Weapon {
  name: string;
  wargearType: string; // 'weapon' | 'wargear'
  count: number;
  profiles: WeaponProfile[];
}

export interface Model {
  id: string;
  name: string;
  statlineHidden: boolean;
  stats: Statline;
  keywords: string[];
  weapons: Weapon[];
}

export interface CompositionModel {
  miniature: string;
  min: number;
  max: number;
}

export interface Composition {
  isDefault: boolean;
  points: number;
  models: CompositionModel[];
}

export interface PointsStep {
  atModels: number;
  points: number;
}

export interface Ability {
  name: string;
  type: string; // 'datasheet' | 'faction' | 'core'
  isAura: boolean;
  isPsychic: boolean;
  rules: string;
}

export interface DamageProfile {
  name: string;
  damagedAt: string | null;
  rules: string;
}

export interface Datasheet {
  id: string;
  name: string;
  slug: string;
  faction: string;
  factionKeywords: string[];
  publication: string;
  isLegends: boolean;
  isFreeFromEntitlements: boolean;
  maxModelCount: number | null;
  lore: string | null;
  models: Model[];
  compositions: Composition[];
  pointsSteps: PointsStep[];
  abilities: Ability[];
  damageProfiles: DamageProfile[];
  leads?: string[];
}

export interface AppDetachmentRule {
  id: string;
  name: string;
  lore: string | null;
  rules: string | null;
}

export interface AppEnhancement {
  id: string;
  name: string;
  pointsCost: number | null;
  cannotBeWarlord: boolean;
  lore: string | null;
  rules: string | null;
}

export interface AppStratagem {
  id: string;
  name: string;
  cpCost: string | null;
  category: string | null;
  key: string | null;
  lore: string | null;
  when: string | null;
  target: string | null;
  effect: string | null;
  restrictions: string | null;
}

export interface AppDetachment {
  id: string;
  name: string;
  slug: string;
  isCombatPatrol: boolean;
  isFreeFromEntitlements: boolean;
  detachmentPointsCost: number | null;
  rules: AppDetachmentRule[];
  enhancements: AppEnhancement[];
  stratagems: AppStratagem[];
}

export interface AppFactionData {
  faction: string;
  slug: string;
  datasheets: Datasheet[];
  detachments?: AppDetachment[];
}

export interface MergedDetachment {
  name: string;
  slug: string;
  isCombatPatrol: boolean;
  isFactionPack: boolean;
  detachmentPointsCost: number | null;
  rules: AppDetachmentRule[];
  enhancements: {
    name: string;
    pointsCost: number | null;
    cannotBeWarlord: boolean;
    lore: string | null;
    rules: string | null;
  }[];
  stratagems: AppStratagem[];
  restrictions: string[]; // detachment unique-keyword restrictions from the DB
}

// Unified mapping structure for the application
export interface MergedUnit {
  name: string;
  slug: string;
  appDatasheet: Datasheet | null;
  pointsRange: { min: number; max: number };
  isCombatPatrol: boolean;
  isFactionPack?: boolean;
}

export interface RosterUnit {
  id: string; // Unique instance ID
  unitSlug: string;
  name: string;
  points: number;
  modelsCount: number;
  isCharacter: boolean;
  isBattleline: boolean;
  isFactionPack: boolean;
  selectedCostIndex: number;
  attachedToId?: string; // ID of target bodyguard squad
  enhancementName?: string;
  enhancementPoints?: number;
  isWarlord?: boolean;
}

export interface ArmyList {
  name: string;
  factionSlug: string;
  factionName: string;
  detachmentSlug: string | null;
  detachmentName: string | null;
  pointLimit: number;
  units: RosterUnit[];
}
