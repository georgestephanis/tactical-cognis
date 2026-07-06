// Type definitions for WH40k Companion App data

export interface Statline {
  M: string;
  T: string;
  Sv: string;
  W: string;
  Ld: string;
  OC: string;
  Inv?: string | null; // Invulnerable save, e.g. "4+" (rendered as 4++); null if none
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

export interface WargearChoiceItem {
  wargearItemId: string;
  name: string;
  wargearType: string; // 'weapon' | 'wargear'
  count: number;
  profiles: WeaponProfile[];
}

export interface WargearChoice {
  id: string;
  items: WargearChoiceItem[];
}

export interface WargearChoiceSet {
  id: string;
  limit: number;
  allowDuplicates: boolean;
  alternate: boolean;
  choices: WargearChoice[];
  miniatureId?: string | null;
}

export interface WargearLimit {
  modelCount: number;
  choiceLimit: number;
  duplicateLimit: number | null;
}

export interface LimitedWargearChoice {
  id: string;
  wargearItemIds: string[];
}

export interface LimitedWargearChoiceSet {
  id: string;
  miniatureId: string | null;
  mandatory: boolean;
  limits: WargearLimit[];
  choices: LimitedWargearChoice[];
}

export interface Model {
  id: string;
  name: string;
  statlineHidden: boolean;
  stats: Statline;
  keywords: string[];
  weapons: Weapon[];
  wargearChoiceSets?: WargearChoiceSet[];
}

export interface CompositionModel {
  miniature: string;
  min: number;
  max: number;
}

export interface Composition {
  id?: string;
  isDefault: boolean;
  points: number;
  models: CompositionModel[];
  referenceGroupingKeywordId?: string | null;
  referenceGroupingKeywordName?: string | null;
  requiredFactionKeywordIds?: string[];
  requiredDetachmentIds?: string[];
}

export interface AlliedLimit {
  keyword: string;
  limitCount: number;
  battleSize: string | null;
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

export interface DatasheetRule {
  name: string;
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
  rules?: DatasheetRule[];
  leads?: string[];
  limitedWargearChoiceSets?: LimitedWargearChoiceSet[];
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
  id: string;
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
  isAllied?: boolean;
  requiredDetachmentIds?: string[];
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
  selectedWargearChoices?: Record<string, string[]>; // choiceSetId -> choiceId[]
  wargearCounts?: Record<string, number>; // choiceId -> count selected
  splitSquad?: boolean; // Indicates if the squad is split into two pre-game
}

export interface ArmyList {
  name: string;
  factionSlug: string;
  factionName: string;
  detachmentSlugs: string[];
  pointLimit: number;
  units: RosterUnit[];
  /** Legacy single-detachment fields from older saves; migrated to detachmentSlugs on load. */
  detachmentSlug?: string | null;
  detachmentName?: string | null;
}
