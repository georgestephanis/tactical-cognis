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
  /**
   * `wargear_item_profile.hunterProfileKeyword`, parsed.
   *
   * A "Hunter" profile is a conditional statline that only applies when the
   * target has one of these keywords (matched as OR); the weapon's other
   * profile ("Standard") applies against everything else. Introduced with
   * `Codex: Orks` in 11th edition. Empty/absent for ordinary profiles, where
   * every profile of a weapon is simultaneously available.
   */
  hunterKeywords?: string[];
}

export interface Weapon {
  name: string;
  wargearType: string; // 'weapon' | 'wargear'
  count: number;
  profiles: WeaponProfile[];
  /**
   * `wargear_item.id`, when the weapon came from a resolvable loadout option.
   *
   * Carried so wargear pricing can be keyed by id rather than display name —
   * see `getLoadoutWargearPoints` in `utils/loadout.ts`. Optional because
   * `Weapon` is also built from paths that have no option row behind them.
   */
  wargearItemId?: string;
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
  /**
   * A unit carrying any of these keywords counts toward this limit even though it
   * doesn't natively carry `keyword` itself (`allied_faction_keyword_slotless_keyword_group`
   * — e.g. Agents of the Imperium's "Retinue" cap, which no datasheet carries as a
   * literal keyword; an "Inquisitor" unit counts toward it instead).
   */
  donorKeywords?: string[];
}

export interface PointsStep {
  stepAt: number;
  stepPoints: number;
}

export interface Ability {
  name: string;
  type: string; // 'datasheet' | 'faction' | 'core'
  isAura: boolean;
  isPsychic: boolean;
  rules: string;
  /** Nested named sub-effects (`datasheet_sub_ability`), e.g. individually-named relics under a "choose one" parent ability. */
  subAbilities?: { name: string; rules: string }[];
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
  /** `datasheet.isLegends` — Warhammer Legends datasheet, not legal in matched play. */
  isLegends: boolean;
  /** `publication.isCombatPatrol` — datasheet belongs to a Combat Patrol box. */
  isCombatPatrol: boolean;
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
  /** Plain-text "you may replace X with Y" wargear prose (`wargear_rule.rulesText`), ordered. */
  wargearRules?: string[];
  /** "Apply to whole unit" wargear options, synthesized to prose (`all_model_wargear_choice*`). */
  allModelWargearOptions?: string[];
  /** Companion-app wargear-picker instruction prose (`wargear_option_group.instructionText`), display-only. */
  wargearInstructions?: string[];
  /**
   * Per-item wargear surcharges (`wargear_option.points`), as
   * `miniatureId -> wargearItemId -> points`. Only non-zero prices are present.
   *
   * 11th edition reintroduced paid wargear, so a unit's cost is its composition
   * points plus the price of every item it is *equipped with* — defaults included
   * (a Ravager is 110 + three 5pt dark lances = 125). Absent entirely on companion
   * DBs predating the column, in which case all wargear is treated as free.
   */
  wargearOptionPoints?: Record<string, Record<string, number>>;
}

export interface AppDetachmentRule {
  id: string;
  name: string;
  lore: string | null;
  rules: string | null;
}

/**
 * A "why take this detachment" flavor bullet group (`detachment_detail` +
 * `_bullet_point`) — the companion app's own short summary of a detachment's
 * notable restrictions/keywords/etc., grouped under a title.
 */
export interface DetachmentDetail {
  id: string;
  title: string;
  bullets: string[];
}

/** A datasheet bundled with a detachment (`detachment_linked_datasheet`), e.g. a Combat-Patrol-style box set. */
export interface LinkedDatasheet {
  datasheetName: string;
  count: number;
  isWarlord: boolean;
}

export interface AppEnhancement {
  id?: string;
  name: string;
  pointsCost: number | null;
  cannotBeWarlord: boolean;
  lore: string | null;
  rules: string | null;
  isEquipableByNonCharacterUnit?: boolean;
  isEquipableByEpicHero?: boolean;
  limit?: number;
  isIncludedInEnhancementLimit?: boolean;
  requiredKeywordGroups?: string[][];
  excludedKeywords?: string[];
  /**
   * Units (by name) or keywords this enhancement additionally lets its wearer
   * lead/support, on top of the wearer's intrinsic `leads` list
   * (`enhancement_bodyguard_group*`, e.g. Kaptin's Hat → Flash Gitz).
   */
  grantsLeadership?: { targetName: string; bodyguardType: string }[];
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
  /** Phase(s) this stratagem can be used in, humanized (`stratagem_phase`), e.g. "Charge Phase". */
  phases?: string[];
}

/** A force disposition offered by a detachment (`force_disposition`). */
export interface ForceDisposition {
  id: string;
  name: string;
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
  /**
   * Dispositions this detachment may deploy under. Crossed with the opponent's
   * disposition this selects the primary mission. Nearly every detachment offers
   * exactly one; where it offers several the player chooses.
   */
  forceDispositions: ForceDisposition[];
  /** "Why take this" flavor bullet groups (`detachment_detail*`). Display-only. */
  details?: DetachmentDetail[];
  /** Datasheets bundled with this detachment (`detachment_linked_datasheet`). Display-only. */
  linkedDatasheets?: LinkedDatasheet[];
}

export interface ConditionalKeywordGrant {
  /** Native datasheet name of the unit receiving the keyword. */
  datasheetName: string;
  /** Keyword granted when the condition holds. */
  keywordName: string;
  /** Only applies while this detachment is selected. */
  requiredDetachmentName?: string | null;
  /** Only applies while a unit matching this name is the army's Warlord. */
  requiredWarlordUnitName?: string | null;
  /** Only applies while this allegiance ability is declared for the roster. */
  requiredAllegianceAbilityName?: string | null;
  /** Only applies while the roster declares this sub-faction keyword. */
  requiredRosterFactionKeywordName?: string | null;
}

/** One selectable option within an allegiance group (e.g. "Khorne"). */
export interface AllegianceAbility {
  id: string;
  name: string;
  /** Rule prose (may be null for synthetic sub-faction-keyword options). */
  rules: string | null;
}

/**
 * An allegiance / sub-faction choice-set. `kind: 'ability'` maps to a DB
 * `allegiance_ability_group` (selected options are allegiance ability ids);
 * `kind: 'factionKeyword'` is a synthetic group of declarable sub-faction keywords
 * (selected options carry an `fk:<Name>` id and declare a roster faction keyword).
 */
export interface AllegianceGroup {
  id: string;
  name: string;
  kind: 'ability' | 'factionKeyword';
  isMandatory: boolean;
  minRosterLimit: number | null;
  maxRosterLimit: number | null;
  /** Detachment this group is scoped to, if any. */
  detachmentName: string | null;
  abilities: AllegianceAbility[];
}

/** An army-wide special rule (Oath of Moment, Acts of Faith, …). Display-only. */
export interface ArmyRule {
  id: string;
  name: string;
  rules: string;
}

/**
 * A datasheet that may not be taken in a given context — either barred from a
 * specific detachment (`detachment_excluded_datasheet`) or from the faction as a
 * whole (`faction_keyword_excluded_datasheet`). Faction-level exclusions carry no
 * `detachmentName`.
 */
export interface DatasheetExclusion {
  /** Native datasheet name of the excluded unit. */
  datasheetName: string;
  /** Detachment the exclusion applies to; null for faction-wide exclusions. */
  detachmentName: string | null;
}

/**
 * A "0-1" / "0-N" cap on how many units carrying a given set of keywords a roster
 * may include (`keyword_restriction_group` + `_keyword`). The base `limit` can be
 * overridden per-detachment (`restriction_group_detachment_limit`), and the whole
 * group can be gated on a declared allegiance/roster faction keyword being ABSENT
 * (`excludedFactionKeywordName`, e.g. the cap lifts for Ynnari) or on a specific
 * Warlord being present (`requiresWarlord`).
 */
export interface RestrictionDetachmentLimit {
  detachmentName: string;
  min: number | null;
  max: number | null;
}

export interface KeywordRestrictionGroup {
  /** Unit keywords this cap applies to (a unit matches if it carries any of them). */
  keywords: string[];
  /** Base per-roster cap; null means unlimited unless a detachment override applies. */
  limit: number | null;
  /** When set, the cap only applies while this named unit is the army's Warlord. */
  requiredWarlordUnitName: string | null;
  /** When the roster declares this faction keyword, the cap does not apply. */
  excludedFactionKeywordName: string | null;
  /** Per-detachment min/max overrides of `limit`. */
  detachmentLimits: RestrictionDetachmentLimit[];
}

/**
 * Detachment-scoped Warlord constraints from the DB:
 * `detachment_mandatory_warlord_miniature` forces the Warlord to be a specific unit
 * while the detachment is selected; `detachment_granted_warlord_miniature` merely
 * permits a unit to be Warlord that normally couldn't (informational). Miniature ids
 * are resolved to their datasheet names for roster-name matching.
 */
export interface DetachmentWarlordRule {
  detachmentName: string;
  /** Datasheets that MUST be the Warlord when this detachment is selected. */
  mandatoryWarlordDatasheets: string[];
  /** Datasheets permitted to be the Warlord when this detachment is selected. */
  grantedWarlordDatasheets: string[];
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
  enhancements: AppEnhancement[];
  stratagems: AppStratagem[];
  restrictions: string[]; // detachment unique-keyword restrictions from the DB
  /** Dispositions offered; more than one means the player must choose. */
  forceDispositions: ForceDisposition[];
  /** "Why take this" flavor bullet groups (`detachment_detail*`). Display-only. */
  details: DetachmentDetail[];
  /** Datasheets bundled with this detachment (`detachment_linked_datasheet`). Display-only. */
  linkedDatasheets: LinkedDatasheet[];
}

// Unified mapping structure for the application
export interface MergedUnit {
  name: string;
  slug: string;
  appDatasheet: Datasheet | null;
  pointsRange: { min: number; max: number };
  isCombatPatrol: boolean;
  /** Warhammer Legends datasheet — playable, but not legal in matched play. */
  isLegends: boolean;
  isFactionPack?: boolean;
  isAllied?: boolean;
  requiredDetachmentIds?: string[];
  /** Source faction of an allied unit, for display (`allied_faction_parent_faction_keyword`), e.g. "Adeptus Mechanicus". */
  alliedSourceFactionName?: string;
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
  /**
   * Index of the chosen tier's composition in `Datasheet.compositions`. Distinct from
   * `selectedCostIndex`, which indexes the *filtered* cost list. Absent on units
   * created before this field existed; model counts then fall back to `selectedCostIndex`.
   */
  compositionIndex?: number;
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
  /** Declared allegiance ability ids (from `allegiance_ability_group` choices). */
  selectedAllegianceAbilityIds?: string[];
  /** Declared sub-faction keyword names (e.g. a Space Marine Chapter). */
  selectedSubfactionKeywords?: string[];
  /**
   * The force disposition the army deploys under, chosen from those its
   * detachments offer. Unset when only one is on offer (resolved implicitly).
   */
  selectedForceDispositionId?: string | null;
  /** Legacy per-detachment disposition picks from older saves; migrated to selectedForceDispositionId on load. */
  selectedForceDispositionIds?: Record<string, string>;
  /** Legacy single-detachment fields from older saves; migrated to detachmentSlugs on load. */
  detachmentSlug?: string | null;
  detachmentName?: string | null;
}

// Core Rules book, extracted from rule_section / rule_container / rule_container_component.
export interface CoreRuleComponent {
  id: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  textContent: string | null;
  trigger: string | null;
  effect: string | null;
  imageUrl: string | null;
  /** For type 'bullets' — the actual list text lives in `bullet_point`, not `textContent`. */
  bulletPoints: string[];
}

export interface CoreRuleContainer {
  id: string;
  title: string | null;
  subtitle: string | null;
  containerType: string;
  components: CoreRuleComponent[];
}

export interface CoreRuleSection {
  id: string;
  name: string;
  containers: CoreRuleContainer[];
}

// FAQ / rules-commentary entry attached to a specific Core Rules container
// (from faq/faq_config.ruleContainerId). Either question+answer or
// errataHeader+errataText is populated, depending on the entry's kind.
export interface CoreRuleFaqEntry {
  id: string;
  question: string | null;
  answer: string | null;
  errataHeader: string | null;
  errataText: string | null;
}

export interface MissionPresetInfo {
  presetId: string;
  presetName: string;
  layoutId: string;
  layoutName: string;
  deploymentId: string;
  deploymentName: string;
}

export interface PrimaryMissionObjectiveScoring {
  id: string;
  scoringCriteria: string;
  victoryPoints: number;
  isCumulative: boolean;
  displayOrder: number;
}

export interface PrimaryMissionObjective {
  id: string;
  name: string;
  whenText: string | null;
  displayOrder: number;
  scoring: PrimaryMissionObjectiveScoring[];
}

export interface PrimaryMissionDetail {
  id: string;
  name: string;
  lore: string | null;
  description: string | null;
  objectives: PrimaryMissionObjective[];
}

export interface DispositionMatchup {
  oppositionDispositionId: string;
  oppositionDispositionName: string;
  primaryMission: PrimaryMissionDetail;
  presets: MissionPresetInfo[];
}

export interface DeploymentFrequency {
  deploymentName: string;
  count: number;
  totalPresets: number;
  percentage: number;
  matchups: string[];
}

export interface DispositionIntel {
  friendlyDispositionId: string;
  friendlyDispositionName: string;
  matchups: DispositionMatchup[];
  deploymentFrequencies: DeploymentFrequency[];
  totalPresets: number;
  neverEncounteredDeployments: string[];
}

export interface SecondaryMissionAction {
  id: string;
  name: string;
  startsText: string;
  completesText: string;
  effectText: string;
  restrictionText: string | null;
}

export interface SecondaryMissionObjectiveScoring {
  id: string;
  scoringCriteria: string;
  victoryPoints: number;
  isCumulative: boolean;
}

export interface SecondaryMissionObjective {
  id: string;
  name: string;
  whenText: string | null;
  scoring: SecondaryMissionObjectiveScoring[];
}

export interface AppSecondaryMission {
  id: string;
  name: string;
  lore: string | null;
  description: string | null;
  isFixedSecondary: boolean;
  isScorableFirstTurn: boolean;
  objectives: SecondaryMissionObjective[];
  actions: SecondaryMissionAction[];
}

export interface PrintableDetachmentRule extends AppDetachmentRule {
  detachmentName: string;
}

