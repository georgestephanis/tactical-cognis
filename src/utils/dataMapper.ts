import type {
  MergedUnit,
  Datasheet,
  MergedDetachment,
  AppDetachmentRule,
  AppEnhancement,
  AppStratagem
} from '../types/data';
import { initDatabase, getUnitsByFaction, getDetachmentsByFaction, normalizeName } from './db';

export { normalizeName };

interface MfmOverrides {
  factions?: Record<string, {
    detachments?: Record<string, { rule?: string | null; restrictions?: string[] }>;
  }>;
}

let mfmOverrides: MfmOverrides | null = null;

/**
 * Load the consolidated MFM overrides once.
 */
async function loadMfmOverrides() {
  if (mfmOverrides) return mfmOverrides;
  try {
    const res = await fetch('/mfm-overrides.json');
    mfmOverrides = await res.json();
    return mfmOverrides;
  } catch (err) {
    console.error("Failed to load mfm-overrides.json", err);
    return { factions: {} };
  }
}

export interface MergedFaction {
  factionName: string;
  slug: string;
  version: string;
  appRawList: Datasheet[];
  units: MergedUnit[];
  detachments: MergedDetachment[];
}

/**
 * A single pricing tier for a unit, derived from the datasheet's SQLite-native
 * `compositions`. Replaces the old MFM `costs` array.
 */
export interface DerivedCost {
  label: string;
  points: number;
  models: number;
}

/**
 * Derive per-tier pricing and model counts from a datasheet's compositions.
 * Each composition is one price tier; its model count is the sum of the max
 * size of each miniature group (matching the full squad size the points buy).
 */
export function getDatasheetCosts(ds: Datasheet | null | undefined): DerivedCost[] {
  if (!ds?.compositions) return [];
  return ds.compositions
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
 * Load and merge data from SQLite for a selected faction slug.
 */
export async function loadAndMergeFaction(factionSlug: string): Promise<MergedFaction | null> {
  const cached = factionCache.get(factionSlug);
  if (cached) return cached;

  // Initialize DB and Overrides
  const [, overrides] = await Promise.all([
    initDatabase('/40k.sqlite'),
    loadMfmOverrides()
  ]);

  // Fetch results from SQLite
  const dbUnits = await getUnitsByFaction(factionSlug);
  const dbDetachments = await getDetachmentsByFaction(factionSlug);

  const factionOverrides = overrides?.factions?.[factionSlug];

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

    const isCombatPatrol = ds.publication?.toLowerCase().includes('combat patrol') || (minPts === 0 && ds.compositions.length > 0);

    mergedUnits.push({
      name: String(ds.name),
      slug: String(ds.slug),
      appDatasheet: ds,
      pointsRange: { min: minPts, max: maxPts },
      isCombatPatrol: isCombatPatrol,
      isFactionPack: false, // Will be updated if we add FP support back
    });
  });

  mergedUnits.sort((a, b) => a.name.localeCompare(b.name));

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
    };

    const id = String(appDet.id);
    if (!seenDetachmentIds.has(id)) {
      seenDetachmentIds.add(id);

      const detSlug = String(appDet.slug);
      const detOverride = factionOverrides?.detachments?.[detSlug];

      mergedDetachments.push({
        name: String(appDet.name),
        slug: detSlug,
        isCombatPatrol: !!appDet.isCombatPatrol,
        isFactionPack: false,
        detachmentPointsCost: appDet.detachmentPointsCost,
        rule: detOverride?.rule || null,
        rules: appDet.rules,
        enhancements: (appDet.enhancements || []).map(e => ({
          name: e.name,
          pointsCost: e.pointsCost,
          cannotBeWarlord: e.cannotBeWarlord,
          lore: e.lore,
          rules: e.rules,
          leader: null,
        })),
        stratagems: appDet.stratagems || [],
        restrictions: [...(appDet.restrictions || []), ...(detOverride?.restrictions || [])],
      });
    }
  });

  mergedDetachments.sort((a, b) => a.name.localeCompare(b.name));

  const merged: MergedFaction = {
    factionName: factionSlug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
    slug: factionSlug,
    version: 'SQLite Native',
    appRawList: dbUnits as unknown as Datasheet[],
    units: mergedUnits,
    detachments: mergedDetachments,
  };

  factionCache.set(factionSlug, merged);
  return merged;
}

