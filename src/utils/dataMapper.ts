import type {
  MergedUnit,
  Datasheet,
  MergedDetachment,
  AppDetachmentRule,
  AppEnhancement,
  AppStratagem,
  AlliedLimit,
  ConditionalKeywordGrant,
  DatasheetExclusion,
  KeywordRestrictionGroup,
  RestrictionDetachmentLimit,
  DetachmentWarlordRule,
  AllegianceGroup,
  AllegianceAbility,
  ArmyRule,
  ForceDisposition,
  DetachmentDetail,
  LinkedDatasheet
} from '../types/data';
import {
  initDatabase,
  getUnitsByFaction,
  getDetachmentsByFaction,
  normalizeName,
  getAlliedUnitsForFaction,
  getAlliedLimitsForFaction,
  getFactionKeywordIds,
  getConditionalKeywordGrants,
  getExcludedDatasheets,
  getKeywordRestrictionGroups,
  getDetachmentWarlordRules,
  getAllegianceGroups,
  getArmyRules
} from './db';

export { normalizeName };

export interface MergedFaction {
  factionName: string;
  slug: string;
  appRawList: Datasheet[];
  units: MergedUnit[];
  detachments: MergedDetachment[];
  alliedUnits?: MergedUnit[];
  alliedLimits?: AlliedLimit[];
  factionKeywordIds?: string[];
  conditionalKeywordGrants?: ConditionalKeywordGrant[];
  excludedDatasheets?: DatasheetExclusion[];
  keywordRestrictionGroups?: KeywordRestrictionGroup[];
  detachmentWarlordRules?: DetachmentWarlordRule[];
  allegianceGroups?: AllegianceGroup[];
  armyRules?: ArmyRule[];
}

/**
 * A single pricing tier for a unit, derived from the datasheet's SQLite-native
 * `compositions`.
 */
export interface DerivedCost {
  label: string;
  points: number;
  models: number;
}

/**
 * Derive per-tier pricing and model counts from a datasheet's compositions,
 * filtered by the current army's active keywords, detachment, and faction slug context.
 */
export function getDatasheetCosts(
  ds: Datasheet | null | undefined,
  activeFactionKeywordIds: string[] = [],
  activeDetachmentId?: string | null,
  factionSlug?: string | null
): DerivedCost[] {
  if (!ds?.compositions) return [];

  // Resolve meta group keywords (Imperium / Chaos / Aeldari) based on slug
  const imperiumSlugs = [
    'space-marines',
    'astra-militarum',
    'adepta-sororitas',
    'adeptus-mechanicus',
    'adeptus-custodes',
    'grey-knights',
    'imperial-knights',
    'agents-of-the-imperium'
  ];
  const chaosSlugs = [
    'chaos-space-marines',
    'death-guard',
    'thousand-sons',
    'world-eaters',
    'chaos-daemons',
    'chaos-knights'
  ];
  const aeldariSlugs = ['aeldari', 'drukhari'];

  const matchesGroup = (groupName: string | null | undefined): boolean => {
    if (!groupName || !factionSlug) return false;
    const normGroup = groupName.toLowerCase();
    if (normGroup === 'imperium') return imperiumSlugs.includes(factionSlug);
    if (normGroup === 'chaos') return chaosSlugs.includes(factionSlug);
    if (normGroup === 'aeldari' || normGroup === 'aeldari / drukhari') return aeldariSlugs.includes(factionSlug);
    return false;
  };

  // Find eligible compositions based on active filters
  const eligible = ds.compositions.filter(c => {
    // 1. Detachment limit check
    if (c.requiredDetachmentIds && c.requiredDetachmentIds.length > 0) {
      if (!activeDetachmentId || !c.requiredDetachmentIds.includes(activeDetachmentId)) return false;
    }
    // 2. Faction limit check
    if (c.requiredFactionKeywordIds && c.requiredFactionKeywordIds.length > 0) {
      if (!activeFactionKeywordIds.some(id => c.requiredFactionKeywordIds!.includes(id))) return false;
    }
    // 3. Group limit check
    if (c.referenceGroupingKeywordName) {
      if (!matchesGroup(c.referenceGroupingKeywordName)) return false;
    }
    return true;
  });

  // Fallback to default compositions if filters yielded nothing
  const targetCompositions = eligible.length > 0 ? eligible : ds.compositions;

  return targetCompositions
    .filter(c => c.points != null && Number(c.points) > 0)
    .map(c => {
      const models = (c.models || []).reduce((sum, m) => sum + (m.max ?? m.min ?? 0), 0);
      return {
        label: models > 0 ? `${models} model${models === 1 ? '' : 's'}` : 'Unit',
        points: Number(c.points),
        models,
      };
    });
}

/**
 * In-memory cache of merged factions, keyed by slug. The SQLite queries behind
 * a faction merge are expensive and the underlying DB is immutable per session,
 * so we only ever build each faction once.
 */
const factionCache = new Map<string, MergedFaction>();


/**
 * Decides whether a datasheet belongs to a Combat Patrol box.
 *
 * Prefers `publication.isCombatPatrol`. Older companion DBs predate that column,
 * so the publication-name heuristic remains as a fallback, and the zero-points
 * check as a last resort for datasheets carrying no costed composition at all.
 *
 * Shared by the primary-faction and allied-unit paths so the two can't drift —
 * an allied Combat Patrol datasheet must be recognised the same way as any other.
 */
function resolveIsCombatPatrol(ds: Datasheet, minPoints: number): boolean {
  return !!ds.isCombatPatrol
    || !!ds.publication?.toLowerCase().includes('combat patrol')
    || (minPoints === 0 && (ds.compositions?.length ?? 0) > 0);
}

/**
 * Load and merge data from SQLite for a selected faction slug.
 */
export async function loadAndMergeFaction(factionSlug: string): Promise<MergedFaction | null> {
  const cached = factionCache.get(factionSlug);
  if (cached) return cached;

  await initDatabase('/40k.sqlite');

  // Fetch results from SQLite
  const dbUnits = await getUnitsByFaction(factionSlug);
  const dbDetachments = await getDetachmentsByFaction(factionSlug);
  const dbAlliedUnits = await getAlliedUnitsForFaction(factionSlug);
  const dbAlliedLimits = await getAlliedLimitsForFaction(factionSlug);
  const factionKeywordIds = await getFactionKeywordIds(factionSlug);
  const dbConditionalKeywordGrants = await getConditionalKeywordGrants(factionSlug);
  const conditionalKeywordGrants: ConditionalKeywordGrant[] = dbConditionalKeywordGrants.map(g => ({
    datasheetName: String(g.datasheetName),
    keywordName: String(g.keywordName),
    requiredDetachmentName: g.requiredDetachmentName ? String(g.requiredDetachmentName) : null,
    requiredWarlordUnitName: g.requiredWarlordUnitName ? String(g.requiredWarlordUnitName) : null,
    requiredAllegianceAbilityName: g.requiredAllegianceAbilityName ? String(g.requiredAllegianceAbilityName) : null,
    requiredRosterFactionKeywordName: g.requiredRosterFactionKeywordName ? String(g.requiredRosterFactionKeywordName) : null,
  }));

  const dbExcludedDatasheets = await getExcludedDatasheets(factionSlug);
  const excludedDatasheets: DatasheetExclusion[] = dbExcludedDatasheets.map(x => ({
    datasheetName: String(x.datasheetName),
    detachmentName: x.detachmentName ? String(x.detachmentName) : null,
  }));

  const dbKeywordRestrictionGroups = await getKeywordRestrictionGroups(factionSlug);
  const keywordRestrictionGroups: KeywordRestrictionGroup[] = dbKeywordRestrictionGroups.map(g => ({
    keywords: (g.keywords as string[]) || [],
    limit: g.limit != null ? Number(g.limit) : null,
    requiredWarlordUnitName: g.requiredWarlordUnitName ? String(g.requiredWarlordUnitName) : null,
    excludedFactionKeywordName: g.excludedFactionKeywordName ? String(g.excludedFactionKeywordName) : null,
    detachmentLimits: ((g.detachmentLimits as RestrictionDetachmentLimit[]) || []),
  }));

  const dbDetachmentWarlordRules = await getDetachmentWarlordRules(factionSlug);
  const detachmentWarlordRules: DetachmentWarlordRule[] = dbDetachmentWarlordRules.map(r => ({
    detachmentName: String(r.detachmentName),
    mandatoryWarlordDatasheets: (r.mandatoryWarlordDatasheets as string[]) || [],
    grantedWarlordDatasheets: (r.grantedWarlordDatasheets as string[]) || [],
  }));

  const dbAllegianceGroups = await getAllegianceGroups(factionSlug);
  const allegianceGroups: AllegianceGroup[] = dbAllegianceGroups.map(g => ({
    id: String(g.id),
    name: String(g.name),
    kind: (g.kind === 'factionKeyword' ? 'factionKeyword' : 'ability'),
    isMandatory: !!g.isMandatory,
    minRosterLimit: g.minRosterLimit != null ? Number(g.minRosterLimit) : null,
    maxRosterLimit: g.maxRosterLimit != null ? Number(g.maxRosterLimit) : null,
    detachmentName: g.detachmentName ? String(g.detachmentName) : null,
    abilities: ((g.abilities as AllegianceAbility[]) || []),
  }));

  const dbArmyRules = await getArmyRules(factionSlug);
  const armyRules: ArmyRule[] = dbArmyRules.map(r => ({
    id: String(r.id),
    name: String(r.name),
    rules: r.rules ? String(r.rules) : '',
  }));

  const mergedUnits: MergedUnit[] = [];

  dbUnits.forEach(u => {
    const ds = u as unknown as Datasheet;

    let minPts = 0;
    let maxPts = 0;
    if (ds.compositions && ds.compositions.length > 0) {
      const points = ds.compositions.map(c => Number(c.points));
      minPts = Math.min(...points);
      maxPts = Math.max(...points);
    }

    const isCombatPatrol = resolveIsCombatPatrol(ds, minPts);

    mergedUnits.push({
      name: String(ds.name),
      slug: String(ds.slug),
      appDatasheet: ds,
      pointsRange: { min: minPts, max: maxPts },
      isCombatPatrol: isCombatPatrol,
      isLegends: !!ds.isLegends,
      isFactionPack: false, // Will be updated if we add FP support back
    });
  });

  mergedUnits.sort((a, b) => a.name.localeCompare(b.name));

  const alliedUnits: MergedUnit[] = [];
  dbAlliedUnits.forEach(u => {
    const ds = u as unknown as Datasheet;

    let minPts = 0;
    let maxPts = 0;
    if (ds.compositions && ds.compositions.length > 0) {
      const points = ds.compositions.map(c => Number(c.points));
      minPts = Math.min(...points);
      maxPts = Math.max(...points);
    }

    alliedUnits.push({
      name: String(ds.name),
      slug: String(ds.slug),
      appDatasheet: ds,
      pointsRange: { min: minPts, max: maxPts },
      isCombatPatrol: resolveIsCombatPatrol(ds, minPts),
      isLegends: !!ds.isLegends,
      isFactionPack: false,
      isAllied: true,
      requiredDetachmentIds: (u as { requiredDetachmentIds?: string[] }).requiredDetachmentIds || [],
      alliedSourceFactionName: (u as { sourceFactionName?: string }).sourceFactionName,
    });
  });

  alliedUnits.sort((a, b) => a.name.localeCompare(b.name));

  const alliedLimits: AlliedLimit[] = dbAlliedLimits.map((l: Record<string, unknown>) => ({
    keyword: String(l.keyword),
    limitCount: Number(l.limitCount),
    battleSize: l.battleSize ? String(l.battleSize) : null,
    donorKeywords: Array.isArray(l.donorKeywords) && l.donorKeywords.length > 0
      ? (l.donorKeywords as string[])
      : undefined,
  }));

  const mergedDetachments: MergedDetachment[] = [];
  const seenDetachmentIds = new Set<string>();

  dbDetachments.forEach(d => {
    const appDet = d as unknown as {
      id: string;
      name: string;
      slug: string;
      isCombatPatrol: boolean;
      detachmentPointsCost: number | null;
      rules: AppDetachmentRule[];
      enhancements: AppEnhancement[];
      stratagems: AppStratagem[];
      restrictions: string[];
      forceDispositions?: ForceDisposition[];
      details?: DetachmentDetail[];
      linkedDatasheets?: LinkedDatasheet[];
    };

    const id = String(appDet.id);
    if (!seenDetachmentIds.has(id)) {
      seenDetachmentIds.add(id);

      mergedDetachments.push({
        id,
        name: String(appDet.name),
        slug: String(appDet.slug),
        isCombatPatrol: !!appDet.isCombatPatrol,
        isFactionPack: false,
        detachmentPointsCost: appDet.detachmentPointsCost,
        rules: appDet.rules,
        enhancements: (appDet.enhancements || []).map(e => ({
          id: e.id,
          name: e.name,
          pointsCost: e.pointsCost,
          cannotBeWarlord: e.cannotBeWarlord,
          lore: e.lore,
          rules: e.rules,
          isEquipableByNonCharacterUnit: e.isEquipableByNonCharacterUnit,
          isEquipableByEpicHero: e.isEquipableByEpicHero,
          limit: e.limit,
          isIncludedInEnhancementLimit: e.isIncludedInEnhancementLimit,
          requiredKeywordGroups: e.requiredKeywordGroups,
          excludedKeywords: e.excludedKeywords,
          grantsLeadership: e.grantsLeadership,
        })),
        stratagems: appDet.stratagems || [],
        restrictions: appDet.restrictions || [],
        forceDispositions: appDet.forceDispositions || [],
        details: appDet.details || [],
        linkedDatasheets: appDet.linkedDatasheets || [],
      });
    }
  });

  mergedDetachments.sort((a, b) => a.name.localeCompare(b.name));

  const merged: MergedFaction = {
    factionName: factionSlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
    slug: factionSlug,
    appRawList: dbUnits as unknown as Datasheet[],
    units: mergedUnits,
    detachments: mergedDetachments,
    alliedUnits,
    alliedLimits,
    factionKeywordIds,
    conditionalKeywordGrants,
    excludedDatasheets,
    keywordRestrictionGroups,
    detachmentWarlordRules,
    allegianceGroups,
    armyRules,
  };

  factionCache.set(factionSlug, merged);
  return merged;
}
