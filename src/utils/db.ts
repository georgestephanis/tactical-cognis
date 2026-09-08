import initSqlJs from 'sql.js';
import type * as SQL from 'sql.js';
import type { CoreRuleSection, CoreRuleContainer, CoreRuleComponent, CoreRuleFaqEntry } from '../types/data';


// Handle cases where initSqlJs might be nested in a 'default' property due to Vite/ESM mismatch
const getInitSqlJs = () => {
  if (typeof initSqlJs === 'function') return initSqlJs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (initSqlJs as any).default || initSqlJs;
};

/**
 * Database access layer using SQL.js.
 * This provides a unified interface for querying the 40k.sqlite database.
 */

let db: SQL.Database | null = null;
let SQL_LIB: SQL.SqlJsStatic | null = null;

export interface QueryResult {
  columns: string[];
  values: (string | number | Uint8Array | null)[][];
}

/**
 * Checks if the SQLite database is currently initialized.
 */
export const isDbLoaded = (): boolean => {
  return db !== null;
};

/**
 * Initializes the SQLite database from a provided Uint8Array buffer in memory.
 */
export const initDatabaseFromBuffer = async (uint8: Uint8Array): Promise<SQL.Database> => {
  try {
    if (!SQL_LIB) {
      console.log('Initializing SQL.js...');
      console.log('Fetching WASM binary from /sql-wasm.wasm');
      const wasmRes = await fetch('/sql-wasm.wasm');
      if (!wasmRes.ok) throw new Error(`Could not fetch WASM: ${wasmRes.status}`);
      const wasmBinary = await wasmRes.arrayBuffer();

      const uint8Wasm = new Uint8Array(wasmBinary);
      if (uint8Wasm[0] === 0x3C && uint8Wasm[1] === 0x21) {
        throw new Error("WASM fetch returned HTML instead of binary. Check if the file exists in your public folder.");
      }

      const initEngine = getInitSqlJs();
      SQL_LIB = await initEngine({
        wasmBinary: uint8Wasm,
      });
    }

    if (!SQL_LIB) {
      throw new Error('Failed to initialize SQL.js library engine.');
    }

    db = new SQL_LIB.Database(uint8);
    columnCache.clear();
    return db;
  } catch (err) {
    console.error('Database buffer initialization error:', err);
    throw err;
  }
};

/**
 * Initializes the SQLite database.
 * @param dbUrl The path to the .sqlite file (e.g., /40k.sqlite)
 */
export const initDatabase = async (dbUrl: string = '/40k.sqlite'): Promise<SQL.Database | null> => {
  if (db) return db;

  try {
    if (!SQL_LIB) {
      console.log('Initializing SQL.js...');

      // Fetch the standard WASM binary
      console.log('Fetching WASM binary from /sql-wasm.wasm');
      const wasmRes = await fetch('/sql-wasm.wasm');
      if (!wasmRes.ok) throw new Error(`Could not fetch WASM: ${wasmRes.status}`);
      const wasmBinary = await wasmRes.arrayBuffer();

      const uint8Wasm = new Uint8Array(wasmBinary);
      if (uint8Wasm[0] === 0x3C && uint8Wasm[1] === 0x21) {
        throw new Error("WASM fetch returned HTML instead of binary. Check if the file exists in your public folder.");
      }

      const initEngine = getInitSqlJs();
      SQL_LIB = await initEngine({
        wasmBinary: uint8Wasm,
      });
    }

    if (!SQL_LIB) {
      throw new Error('Failed to initialize SQL.js library engine.');
    }

    console.log('Fetching database from:', dbUrl);
    const response = await fetch(dbUrl);
    if (!response.ok) {
      console.warn(`Local database not found at ${dbUrl}. Falling back to upload mode.`);
      return null;
    }
    const buffer = await response.arrayBuffer();

    // Safety check: verify this isn't an HTML fallback (starts with <!doctype or <html)
    const uint8 = new Uint8Array(buffer);
    if (uint8.length > 5 && uint8[0] === 0x3C && uint8[1] === 0x21) {
      console.warn('Database fetch returned HTML instead of binary. Falling back to upload mode.');
      return null;
    }

    db = new SQL_LIB.Database(uint8);
    columnCache.clear();
    return db;
  } catch (err) {
    console.warn('Database auto-initialization skipped or failed:', err);
    return null;
  }
};

/**
 * Executes a SQL query and returns the result as an array of objects.
 */
export const query = async (sql: string, params: (string | number | boolean | null)[] = []): Promise<Record<string, unknown>[]> => {
  if (!db) {
    const loadedDb = await initDatabase();
    if (!loadedDb) {
      throw new Error('Database is not initialized. Please load or upload an extracted SQLite database.');
    }
  }

  try {
    const stmt = db!.prepare(sql);
    // Using explicit cast to match BindParams which is string | number | Uint8Array | null | Record<string, ...> | ...
    stmt.bind(params as (string | number | Uint8Array | null)[]);

    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (err) {
    console.error(`[SQL Error] Query failed: "${sql}"`, err);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Database query failed: ${message}. Query: ${sql.slice(0, 100)}${sql.length > 100 ? '...' : ''}`, { cause: err });
  }
};

/**
 * Cache of `PRAGMA table_info` column-name lookups, keyed by table name.
 * Cleared whenever a new database is opened.
 */
const columnCache = new Map<string, Set<string>>();

/** SQLite identifiers we're willing to interpolate into a PRAGMA. */
const SAFE_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Returns true if `table` has a column named `column` in the currently open DB.
 *
 * Companion-app schema versions vary, so any column added by a newer app release
 * has to be probed before it can be selected — otherwise one missing column
 * fails the entire datasheet load. Results are cached per table.
 *
 * `PRAGMA` does not accept bound parameters, so the table name is interpolated.
 * It's rejected unless it's a plain identifier and then double-quoted, so a
 * malformed call fails loudly here instead of producing a confusing SQL error
 * somewhere downstream.
 *
 * SQLite identifiers are case-insensitive, so both names are compared
 * case-insensitively — `hasColumn('datasheet', 'islegends')` must not disagree
 * with `hasColumn('datasheet', 'isLegends')`.
 */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  if (!SAFE_IDENTIFIER_RE.test(table)) {
    console.warn(`hasColumn: refusing to probe unsafe table identifier "${table}"`);
    return false;
  }

  const cacheKey = table.toLowerCase();
  let cols = columnCache.get(cacheKey);
  if (!cols) {
    try {
      const info = await query(`PRAGMA table_info("${table}")`);
      cols = new Set(info.map(c => String(c.name).toLowerCase()));
    } catch (err) {
      console.warn(`Could not read schema for table "${table}":`, err);
      cols = new Set<string>();
    }
    columnCache.set(cacheKey, cols);
  }
  return cols.has(column.toLowerCase());
}

/**
 * Maps a name to a slug (lowercase, dash-separated).
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Parses `wargear_item_profile.hunterProfileKeyword` into a keyword list.
 *
 * The DB stores it as emphasised, slash-separated prose — e.g. the only value
 * present as of data version 946 is `**MONSTER/VEHICLE**`, meaning "applies
 * against a target that is a MONSTER *or* a VEHICLE". Returns `[]` when the
 * profile has no hunter condition (i.e. it is an ordinary profile).
 */
export function parseHunterKeywords(raw: unknown): string[] {
  if (raw == null) return [];
  return String(raw)
    .replace(/\*/g, '')
    .split('/')
    .map(k => k.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Normalizes a name for comparison (lowercased, alphanumeric only).
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Maps common meta-faction slugs to their constituent faction keywords.
 */
const META_FACTION_MAP: Record<string, string[]> = {
  'aeldari': ['asuryani', 'harlequins', 'ynnari'],
  'chaos-daemons': ['legiones-daemonica', 'blood-legions', 'plague-legions', 'scintillating-legions', 'legions-of-excess'],
  'space-marines': ['adeptus-astartes'],
  'chaos-space-marines': ['heretic-astartes'],
  'imperial-knights': ['imperial-knights'],
  'chaos-knights': ['chaos-knights'],
};

/**
 * Finding the faction keyword ID from a slug.
 * Also returns "child" faction IDs if the target is a known parent (e.g., Adeptus Astartes).
 */
export async function getFactionKeywordIds(slug: string): Promise<string[]> {
  const allFactions = await query("SELECT id, name FROM faction_keyword");

  // Expand meta-factions (like aeldari -> asuryani, harlequins)
  const slugsTosearch = META_FACTION_MAP[slug] || [slug];

  const targets = allFactions.filter(f => slugsTosearch.includes(slugify(String(f.name))));
  if (targets.length === 0) return [];

  const targetIds = targets.map(t => String(t.id));
  const idList = targetIds.map(id => `'${id}'`).join(',');

  // Check for dual-tagged children (e.g. Adeptus Astartes -> Blood Angels)
  // This automatically finds sub-factions if the units carry both tags.
  const relationships = await query(`
    SELECT DISTINCT dfk2.factionKeywordId
    FROM datasheet_faction_keyword dfk1
    JOIN datasheet_faction_keyword dfk2 ON dfk1.datasheetId = dfk2.datasheetId
    WHERE dfk1.factionKeywordId IN (${idList}) AND dfk2.factionKeywordId NOT IN (${idList})
  `);

  const results = new Set<string>(targetIds);
  relationships.forEach(r => results.add(String(r.factionKeywordId)));

  return Array.from(results);
}

/**
 * Specialized query for units in a specific faction.
 */
export const getUnitsByFaction = async (factionSlug: string): Promise<Record<string, unknown>[]> => {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];

  const idList = kwIds.map(id => `'${id}'`).join(',');

  // `datasheet.isLegends` and `publication.isCombatPatrol` arrived with the
  // 11th-edition data drop (Codex: Orks is the first book to ship Legends
  // datasheets); fall back to 0 so older companion DBs still load.
  const legendsCol = (await hasColumn('datasheet', 'isLegends')) ? 'd.isLegends' : '0 AS isLegends';
  const cpCol = (await hasColumn('publication', 'isCombatPatrol')) ? 'p.isCombatPatrol' : '0 AS isCombatPatrol';

  // 1. Get datasheets that have ANY of the faction keywords in our list
  const datasheets = await query(`
    SELECT DISTINCT
      d.id, d.name, d.unitComposition as compositionRules, p.name as publication,
      d.lore, d.maxModelCount, d.isFreeFromEntitlements,
      ${legendsCol}, ${cpCol}
    FROM datasheet d
    JOIN datasheet_faction_keyword dfk ON d.id = dfk.datasheetId
    LEFT JOIN publication p ON d.publicationId = p.id
    WHERE dfk.factionKeywordId IN (${idList})
  `);

  if (datasheets.length === 0) return [];
  return assembleDatasheets(datasheets);
};

/**
 * Assembles all related datasheet information (miniatures, saves, keywords, compositions,
 * weapons, abilities, bodyguard info, and limits) for a given array of datasheets.
 */
async function assembleDatasheets(datasheets: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const dsIds = datasheets.map(d => `'${d.id}'`).join(',');

  // 1b. Get ALL faction keywords for these datasheets (to show sub-faction tags)
  const datasheetFactionKeywords = await query(`
    SELECT dfk.datasheetId, fk.name
    FROM datasheet_faction_keyword dfk
    JOIN faction_keyword fk ON dfk.factionKeywordId = fk.id
    WHERE dfk.datasheetId IN (${dsIds})
  `);

  // 2. Fetch all miniatures for these datasheets
  const miniatures = await query(`
    SELECT
      m.id, m.name, m.datasheetId, m.statlineHidden,
      m.movement as M, m.toughness as T, m.save as Sv, m.wounds as W, m.leadership as Ld, m.objectiveControl as OC
    FROM miniature m
    WHERE m.datasheetId IN (${dsIds})
    ORDER BY m.displayOrder
  `);

  // 2b. Fetch invulnerable saves.
  const invulnSaves = await query(`
    SELECT datasheetId, miniatureId, save, meleeSave, rangedSave
    FROM invulnerable_save
    WHERE datasheetId IN (${dsIds})
  `);
  const invForMini = (datasheetId: unknown, miniatureId: unknown): string | null => {
    const rows = invulnSaves.filter(r => r.datasheetId === datasheetId);
    const row = rows.find(r => r.miniatureId === miniatureId) || rows.find(r => r.miniatureId == null);
    const val = row && (row.save ?? row.meleeSave ?? row.rangedSave);
    return val ? String(val) : null;
  };

  // 2c. Fetch damaged-bracket profiles for vehicles/monsters.
  const damageRows = await query(`
    SELECT datasheetId, name, damagedAt, rules
    FROM datasheet_damage
    WHERE datasheetId IN (${dsIds})
    ORDER BY displayOrder
  `);

  // 3. Fetch all keywords for these miniatures
  const miniKeywords = await query(`
    SELECT mk.miniatureId, k.name
    FROM miniature_keyword mk
    JOIN keyword k ON mk.keywordId = k.id
    WHERE mk.miniatureId IN (SELECT id FROM miniature WHERE datasheetId IN (${dsIds}))
  `);

  // 4. Fetch all compositions, including the grouping keyword name if set
  const compositions = await query(`
    SELECT uc.id, uc.datasheetId, uc.points, uc.isDefault, uc.referenceGroupingKeywordId, k.name AS referenceGroupingKeywordName
    FROM unit_composition uc
    LEFT JOIN keyword k ON uc.referenceGroupingKeywordId = k.id
    WHERE uc.datasheetId IN (${dsIds})
    ORDER BY uc.displayOrder
  `);

  // 4b. Fetch required faction keywords and required detachments for compositions
  const compRequiredFactions = await query(`
    SELECT unitCompositionId, factionKeywordId
    FROM unit_composition_required_faction_keyword
    WHERE unitCompositionId IN (SELECT id FROM unit_composition WHERE datasheetId IN (${dsIds}))
  `);

  const compRequiredDetachments = await query(`
    SELECT unitCompositionId, detachmentId
    FROM unit_composition_required_detachment
    WHERE unitCompositionId IN (SELECT id FROM unit_composition WHERE datasheetId IN (${dsIds}))
  `);

  // 5. Fetch composition models
  const compModels = await query(`
    SELECT ucm.unitCompositionId, m.name as miniature, ucm.min as min, ucm.max as max
    FROM unit_composition_miniature ucm
    JOIN miniature m ON ucm.miniatureId = m.id
    WHERE ucm.unitCompositionId IN (SELECT id FROM unit_composition WHERE datasheetId IN (${dsIds}))
  `);

  // 6. Fetch abilities
  const abilities = await query(`
    SELECT dda.datasheetId, da.name, da.abilityType as type, da.isAura, da.isPsychic, da.rules
    FROM datasheet_datasheet_ability dda
    JOIN datasheet_ability da ON dda.datasheetAbilityId = da.id
    WHERE dda.datasheetId IN (${dsIds})
    ORDER BY dda.displayOrder
  `);

  // 6b. Fetch datasheet rules
  const datasheetRules = await query(`
    SELECT datasheetId, name, rules
    FROM datasheet_rule
    WHERE datasheetId IN (${dsIds})
    ORDER BY displayOrder
  `);

  // 7. Fetch bodyguard/leader relationships
  const bodyguardGroups = await query(`
    SELECT dbg.id, dbg.datasheetId, dbg.bodyguardType
    FROM datasheet_bodyguard_group dbg
    WHERE dbg.datasheetId IN (${dsIds})
  `);
  const bgIds = bodyguardGroups.map(bg => `'${bg.id}'`).join(',');

  const bgDatasheets = bgIds ? await query(`
    SELECT dbgd.datasheetBodyguardGroupId, d.name
    FROM datasheet_bodyguard_group_datasheet dbgd
    JOIN datasheet d ON dbgd.datasheetId = d.id
    WHERE dbgd.datasheetBodyguardGroupId IN (${bgIds})
  `) : [];

  const bgKeywords = bgIds ? await query(`
    SELECT dbgk.datasheetBodyguardGroupId, k.name
    FROM datasheet_bodyguard_group_keyword dbgk
    JOIN keyword k ON dbgk.keywordId = k.id
    WHERE dbgk.datasheetBodyguardGroupId IN (${bgIds})
  `) : [];

  // 8. Fetch wargear items and profiles
  const wargearItems = await query(`SELECT id, name, wargearType FROM wargear_item`);
  const wargearItemMap = new Map<string, Record<string, unknown>>();
  wargearItems.forEach(item => wargearItemMap.set(String(item.id), item));

  // `hunterProfileKeyword` arrived with the 11th-edition data (Codex: Orks). It
  // marks a conditional "Hunter" statline that only applies against targets with
  // the listed keywords — probe for it so older DBs still load.
  const hunterCol = (await hasColumn('wargear_item_profile', 'hunterProfileKeyword'))
    ? 'hunterProfileKeyword'
    : `NULL AS hunterProfileKeyword`;
  const allProfiles = await query(`
    SELECT id, wargearItemId, name, type, range, attacks, ballisticSkill, weaponSkill, strength, armourPenetration, damage,
      ${hunterCol}
    FROM wargear_item_profile
    ORDER BY displayOrder
  `);
  const profileAbilities = await query(`
    SELECT wipwa.wargearItemProfileId, wa.name
    FROM wargear_item_profile_wargear_ability wipwa
    JOIN wargear_ability wa ON wipwa.wargearAbilityId = wa.id
  `);

  const allLoadouts = await query(`SELECT id, datasheetId, miniatureId FROM base_miniature_loadout WHERE datasheetId IN (${dsIds})`);
  const loadoutOptions = await query(`
    SELECT bmlwo.baseMiniatureLoadoutId, bmlwo.count, wo.wargearItemId
    FROM base_miniature_loadout_wargear_option bmlwo
    JOIN wargear_option wo ON bmlwo.wargearOptionId = wo.id
    WHERE bmlwo.baseMiniatureLoadoutId IN (SELECT id FROM base_miniature_loadout WHERE datasheetId IN (${dsIds}))
  `);

  const miniWeaponsMap = new Map<string, unknown[]>();
  allLoadouts.forEach(loadout => {
    const options = loadoutOptions.filter(opt => opt.baseMiniatureLoadoutId === loadout.id);
    const weapons: unknown[] = [];
    const seenItems = new Set();
    options.forEach(opt => {
      if (seenItems.has(opt.wargearItemId)) return;
      seenItems.add(opt.wargearItemId);
      const item = wargearItemMap.get(String(opt.wargearItemId));
      if (!item) return;
      const profiles = allProfiles.filter(p => p.wargearItemId === opt.wargearItemId).map(p => {
        const rules = profileAbilities.filter(pa => pa.wargearItemProfileId === p.id).map(pa => String(pa.name));
        return { name: p.name || item.name, type: p.type, range: p.range, attacks: p.attacks, ballisticSkill: p.ballisticSkill, weaponSkill: p.weaponSkill, strength: p.strength, armourPenetration: p.armourPenetration, damage: p.damage, rules: rules, hunterKeywords: parseHunterKeywords(p.hunterProfileKeyword) };
      });
      weapons.push({ name: item.name, wargearType: item.wargearType, count: Number(opt.count), profiles: profiles });
    });
    miniWeaponsMap.set(String(loadout.miniatureId), weapons);
  });

  // 8b. Fetch wargear choice sets
  const choiceSets = await query(`
    SELECT id, datasheetId, miniatureId, "limit", allowDuplicates, alternate
    FROM loadout_choice_set
    WHERE datasheetId IN (${dsIds})
  `);
  const choiceSetIds = choiceSets.map(cs => `'${cs.id}'`).join(',');
  const choices = choiceSetIds ? await query(`SELECT id, loadoutChoiceSetId FROM loadout_choice WHERE loadoutChoiceSetId IN (${choiceSetIds})`) : [];
  const choiceIds = choices.map(c => `'${c.id}'`).join(',');
  const choiceWargearItems = choiceIds ? await query(`
    SELECT lcwi.loadoutChoiceId, lcwi.count, lcwi.wargearItemId
    FROM loadout_choice_wargear_item lcwi
    WHERE lcwi.loadoutChoiceId IN (${choiceIds})
  `) : [];

  const choiceMap = new Map<string, unknown[]>();
  choices.forEach(c => {
    const items = choiceWargearItems.filter(ci => ci.loadoutChoiceId === c.id).map(ci => {
      const item = wargearItemMap.get(String(ci.wargearItemId));
      const profiles = allProfiles.filter(p => p.wargearItemId === ci.wargearItemId).map(p => {
        const rules = profileAbilities.filter(pa => pa.wargearItemProfileId === p.id).map(pa => String(pa.name));
        return { name: p.name || item?.name, type: p.type, range: p.range, attacks: p.attacks, ballisticSkill: p.ballisticSkill, weaponSkill: p.weaponSkill, strength: p.strength, armourPenetration: p.armourPenetration, damage: p.damage, rules: rules };
      });
      return { name: String(item?.name), wargearType: String(item?.wargearType), count: Number(ci.count), profiles: profiles };
    });
    if (!choiceMap.has(String(c.loadoutChoiceSetId))) choiceMap.set(String(c.loadoutChoiceSetId), []);
    choiceMap.get(String(c.loadoutChoiceSetId))!.push({ id: c.id, items: items });
  });

  const choiceSetsMap = new Map<string, unknown[]>();
  choiceSets.forEach(cs => {
    if (!choiceSetsMap.has(String(cs.datasheetId))) choiceSetsMap.set(String(cs.datasheetId), []);
    choiceSetsMap.get(String(cs.datasheetId))!.push({ id: cs.id, miniatureId: cs.miniatureId ? String(cs.miniatureId) : null, limit: Number(cs.limit), allowDuplicates: !!cs.allowDuplicates, alternate: !!cs.alternate, choices: choiceMap.get(String(cs.id)) || [] });
  });

  // 8c. Fetch limited wargear choice sets
  const limitedSets = await query(`
    SELECT id, datasheetId, "limit"
    FROM limited_wargear_choice_set
    WHERE datasheetId IN (${dsIds})
  `);
  const limitedSetIds = limitedSets.map(ls => `'${ls.id}'`).join(',');
  const limitedChoices = limitedSetIds ? await query(`SELECT id, limitedWargearChoiceSetId FROM limited_wargear_choice WHERE limitedWargearChoiceSetId IN (${limitedSetIds})`) : [];
  const limitedChoiceIds = limitedChoices.map(lc => `'${lc.id}'`).join(',');
  const limitedWargearItems = limitedChoiceIds ? await query(`
    SELECT lwcwi.limitedWargearChoiceId, lwcwi.count, lwcwi.wargearItemId
    FROM limited_wargear_choice_wargear_item lwcwi
    WHERE lwcwi.limitedWargearChoiceId IN (${limitedChoiceIds})
  `) : [];

  const limitedChoiceMap = new Map<string, unknown[]>();
  limitedChoices.forEach(lc => {
    const items = limitedWargearItems.filter(ci => ci.limitedWargearChoiceId === lc.id).map(ci => {
      const item = wargearItemMap.get(String(ci.wargearItemId));
      const profiles = allProfiles.filter(p => p.wargearItemId === ci.wargearItemId).map(p => {
        const rules = profileAbilities.filter(pa => pa.wargearItemProfileId === p.id).map(pa => String(pa.name));
        return { name: p.name || item?.name, type: p.type, range: p.range, attacks: p.attacks, ballisticSkill: p.ballisticSkill, weaponSkill: p.weaponSkill, strength: p.strength, armourPenetration: p.armourPenetration, damage: p.damage, rules: rules };
      });
      return { name: String(item?.name), wargearType: String(item?.wargearType), count: Number(ci.count), profiles: profiles };
    });
    if (!limitedChoiceMap.has(String(lc.limitedWargearChoiceSetId))) {
      limitedChoiceMap.set(String(lc.limitedWargearChoiceSetId), []);
    }
    limitedChoiceMap.get(String(lc.limitedWargearChoiceSetId))!.push({
      id: lc.id,
      wargearItemIds: limitedWargearItems.filter(ci => ci.limitedWargearChoiceId === lc.id).map(ci => String(ci.wargearItemId)),
      wargearItems: items
    });
  });

  const limitedSetsMap = new Map<string, unknown[]>();
  limitedSets.forEach(ls => {
    if (!limitedSetsMap.has(String(ls.datasheetId))) limitedSetsMap.set(String(ls.datasheetId), []);
    limitedSetsMap.get(String(ls.datasheetId))!.push({ id: ls.id, limit: Number(ls.limit), choices: limitedChoiceMap.get(String(ls.id)) || [] });
  });

  // 8d. Fetch wargear limits. Older companion-app DBs have a wargear_limit
  // table with a different shape (keyed by limitedWargearChoiceSetId, no
  // datasheetId) — skip limits entirely for those rather than failing the load.
  let wargearLimits: Record<string, unknown>[] = [];
  try {
    const limitCols = await query(`PRAGMA table_info(wargear_limit)`);
    if (limitCols.some(c => String(c.name) === 'datasheetId')) {
      wargearLimits = await query(`
        SELECT datasheetId, wargearItemId, limitCount, ratioModelCount
        FROM wargear_limit
        WHERE datasheetId IN (${dsIds})
      `);
    }
  } catch (err) {
    console.warn('Skipping wargear limits (incompatible wargear_limit schema):', err);
  }
  const limitsMap = new Map<string, unknown[]>();
  wargearLimits.forEach(wl => {
    if (!limitsMap.has(String(wl.datasheetId))) limitsMap.set(String(wl.datasheetId), []);
    limitsMap.get(String(wl.datasheetId))!.push({ wargearItemId: String(wl.wargearItemId), wargearItemName: String(wargearItemMap.get(String(wl.wargearItemId))?.name || ''), limitCount: Number(wl.limitCount), ratioModelCount: wl.ratioModelCount != null ? Number(wl.ratioModelCount) : null });
  });

  // 9. Fetch points steps
  const datasheetPointsSteps = await query(`SELECT datasheetId, stepAt, stepPoints FROM datasheet_points_step WHERE datasheetId IN (${dsIds}) ORDER BY stepAt`);

  // 9b. Fetch human-readable wargear-option prose ("■ This model's bolt pistol can
  // be replaced with 1 plasma pistol"). Plain text (bullet chars + newlines), no
  // HTML markup. Probed defensively — older DBs may lack the table.
  let wargearRuleRows: Record<string, unknown>[] = [];
  try {
    wargearRuleRows = await query(`
      SELECT datasheetId, rulesText
      FROM wargear_rule
      WHERE datasheetId IN (${dsIds})
      ORDER BY displayOrder
    `);
  } catch (err) {
    console.warn('Skipping wargear rules (table missing or incompatible):', err);
  }
  const wargearRulesMap = new Map<string, string[]>();
  wargearRuleRows.forEach(wr => {
    const id = String(wr.datasheetId);
    if (!wargearRulesMap.has(id)) wargearRulesMap.set(id, []);
    wargearRulesMap.get(id)!.push(String(wr.rulesText));
  });

  const miniMap = new Map();
  miniatures.forEach(m => {
    const kws = miniKeywords.filter(k => k.miniatureId === m.id).map(k => String(k.name));
    miniMap.set(String(m.id), { id: m.id, name: m.name, statlineHidden: !!m.statlineHidden, stats: { M: String(m.M), T: String(m.T), Sv: String(m.Sv), W: String(m.W), Ld: String(m.Ld), OC: String(m.OC), Inv: invForMini(m.datasheetId, m.id) }, keywords: kws, weapons: miniWeaponsMap.get(String(m.id)) || [], wargearChoiceSets: ((choiceSetsMap.get(String(m.datasheetId)) || []) as { miniatureId: string | null }[]).filter(cs => cs.miniatureId === m.id) });
  });

  const compMap = new Map<string, unknown[]>();
  compositions.forEach(c => {
    const models = compModels.filter(cm => cm.unitCompositionId === c.id).map(cm => ({ miniature: cm.miniature, min: cm.min, max: cm.max }));
    const reqFactionIds = compRequiredFactions.filter(rf => rf.unitCompositionId === c.id).map(rf => String(rf.factionKeywordId));
    const reqDetachmentIds = compRequiredDetachments.filter(rd => rd.unitCompositionId === c.id).map(rd => String(rd.detachmentId));
    if (!compMap.has(String(c.datasheetId))) compMap.set(String(c.datasheetId), []);
    compMap.get(String(c.datasheetId))!.push({ id: c.id, isDefault: !!c.isDefault, points: Number(c.points), models: models, referenceGroupingKeywordId: c.referenceGroupingKeywordId ? String(c.referenceGroupingKeywordId) : null, referenceGroupingKeywordName: c.referenceGroupingKeywordName ? String(c.referenceGroupingKeywordName) : null, requiredFactionKeywordIds: reqFactionIds, requiredDetachmentIds: reqDetachmentIds });
  });

  const abilityMap = new Map<string, unknown[]>();
  abilities.forEach(a => {
    if (!abilityMap.has(String(a.datasheetId))) abilityMap.set(String(a.datasheetId), []);
    abilityMap.get(String(a.datasheetId))!.push({ name: a.name, type: a.type, isAura: !!a.isAura, isPsychic: !!a.isPsychic, rules: a.rules });
  });

  const rulesMap = new Map<string, unknown[]>();
  datasheetRules.forEach(r => {
    if (!rulesMap.has(String(r.datasheetId))) rulesMap.set(String(r.datasheetId), []);
    rulesMap.get(String(r.datasheetId))!.push({ name: String(r.name), rules: String(r.rules) });
  });

  const bodyguardMap = new Map<string, string[]>();
  bodyguardGroups.forEach(bg => {
    const names = bgDatasheets.filter(d => d.datasheetBodyguardGroupId === bg.id).map(d => String(d.name));
    const kws = bgKeywords.filter(k => k.datasheetBodyguardGroupId === bg.id).map(k => String(k.name));
    if (!bodyguardMap.has(String(bg.datasheetId))) bodyguardMap.set(String(bg.datasheetId), []);
    bodyguardMap.get(String(bg.datasheetId))!.push(...names, ...kws);
  });

  return datasheets.map(ds => ({
    id: ds.id,
    name: ds.name,
    slug: slugify(String(ds.name)),
    publication: ds.publication,
    lore: ds.lore,
    maxModelCount: ds.maxModelCount,
    isFreeFromEntitlements: !!ds.isFreeFromEntitlements,
    isLegends: !!ds.isLegends,
    isCombatPatrol: !!ds.isCombatPatrol,
    factionKeywords: datasheetFactionKeywords.filter(dfk => dfk.datasheetId === ds.id).map(dfk => String(dfk.name)),
    models: miniatures.filter(m => m.datasheetId === ds.id).map(m => miniMap.get(String(m.id))),
    compositions: compMap.get(String(ds.id)) || [],
    abilities: abilityMap.get(String(ds.id)) || [],
    rules: rulesMap.get(String(ds.id)) || [],
    pointsSteps: datasheetPointsSteps.filter(dps => dps.datasheetId === ds.id).map(dps => ({ stepAt: dps.stepAt, stepPoints: dps.stepPoints })),
    damageProfiles: damageRows.filter(dr => dr.datasheetId === ds.id).map(dr => ({ name: String(dr.name), damagedAt: dr.damagedAt != null ? String(dr.damagedAt) : null, rules: String(dr.rules ?? '') })),
    leads: bodyguardMap.get(String(ds.id)) || [],
    limitedWargearChoiceSets: limitedSetsMap.get(String(ds.id)) || [],
    wargearLimits: limitsMap.get(String(ds.id)) || [],
    wargearRules: wargearRulesMap.get(String(ds.id)) || [],
  }));
}

/**
 * Fetches allied units (datasheets) for a specific faction, optionally filtered by detachment rules.
 */
export const getAlliedUnitsForFaction = async (
  factionSlug: string
): Promise<Record<string, unknown>[]> => {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');
  const alliedFactions = await query(`SELECT alliedFactionId FROM faction_keyword_allied_faction WHERE factionKeywordId IN (${idList})`);
  if (alliedFactions.length === 0) return [];

  const afIds = alliedFactions.map(af => `'${af.alliedFactionId}'`).join(',');

  // Fetch all allowed datasheets for these allied factions, along with any required detachments
  const alliedDatasheets = await query(`
    SELECT DISTINCT afd.datasheetId, afrd.detachmentId
    FROM allied_faction_datasheet afd
    LEFT JOIN allied_faction_required_detachment afrd ON afd.alliedFactionId = afrd.alliedFactionId
    WHERE afd.alliedFactionId IN (${afIds})
  `);
  if (alliedDatasheets.length === 0) return [];

  // Group by datasheetId to collect required detachment IDs
  const dsDetMap = new Map<string, string[]>();
  alliedDatasheets.forEach(ad => {
    const dsId = String(ad.datasheetId);
    if (!dsDetMap.has(dsId)) dsDetMap.set(dsId, []);
    if (ad.detachmentId) {
      dsDetMap.get(dsId)!.push(String(ad.detachmentId));
    }
  });

  const dsIdList = Array.from(dsDetMap.keys()).map(id => `'${id}'`).join(',');

  const legendsCol = (await hasColumn('datasheet', 'isLegends')) ? 'd.isLegends' : '0 AS isLegends';
  const cpCol = (await hasColumn('publication', 'isCombatPatrol')) ? 'p.isCombatPatrol' : '0 AS isCombatPatrol';

  const datasheets = await query(`
    SELECT d.id, d.name, d.unitComposition as compositionRules, p.name as publication, d.lore, d.maxModelCount, d.isFreeFromEntitlements,
      ${legendsCol}, ${cpCol}
    FROM datasheet d
    LEFT JOIN publication p ON d.publicationId = p.id
    WHERE d.id IN (${dsIdList})
  `);

  if (datasheets.length === 0) return [];
  const assembled = await assembleDatasheets(datasheets);

  return assembled.map(ds => ({
    ...ds,
    requiredDetachmentIds: dsDetMap.get(String(ds.id)) || [],
  }));
};

/**
 * Fetches slot/count limits for all allied factions linked to a specific faction.
 */
export const getAlliedLimitsForFaction = async (factionSlug: string): Promise<Record<string, unknown>[]> => {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');
  const alliedFactions = await query(`SELECT alliedFactionId FROM faction_keyword_allied_faction WHERE factionKeywordId IN (${idList})`);
  if (alliedFactions.length === 0) return [];
  const afList = alliedFactions.map(af => `'${af.alliedFactionId}'`).join(',');

  const keywordLimits = await query(`
    SELECT afk.alliedFactionId, k.name AS keyword, afk.limitCount, bs.name AS battleSize
    FROM allied_faction_keyword afk
    JOIN keyword k ON afk.keywordId = k.id
    LEFT JOIN battle_size bs ON afk.battleSizeId = bs.id
    WHERE afk.alliedFactionId IN (${afList})
  `);

  const pointsLimits = await query(`
    SELECT afpl.alliedFactionId, 'Points' AS keyword, afpl.pointsLimit AS limitCount, bs.name AS battleSize
    FROM allied_faction_points_limit afpl
    LEFT JOIN battle_size bs ON afpl.battleSizeId = bs.id
    WHERE afpl.alliedFactionId IN (${afList})
  `);

  return [...keywordLimits, ...pointsLimits];
};

/**
 * Specialized query for detachments in a specific faction.
 */
export const getDetachmentsByFaction = async (factionSlug: string): Promise<Record<string, unknown>[]> => {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];

  const idList = kwIds.map(id => `'${id}'`).join(',');

  // detachment_faction_detachment_points_cost holds rare per-faction DP-cost
  // overrides; prefer one scoped to a faction keyword in play over the base cost.
  const detachments = await query(`
    SELECT
      det.id, det.name, det.isCombatPatrol,
      COALESCE(MIN(ovr.detachmentPointsCost), det.detachmentPointsCost) AS detachmentPointsCost
    FROM detachment det
    JOIN detachment_faction_keyword dfk ON det.id = dfk.detachmentId
    LEFT JOIN detachment_faction_detachment_points_cost ovr
      ON ovr.detachmentId = det.id AND ovr.factionKeywordId = dfk.factionKeywordId
    WHERE dfk.factionKeywordId IN (${idList})
    GROUP BY det.id
  `);

  if (detachments.length === 0) return [];
  const detIds = detachments.map(d => `'${d.id}'`).join(',');

  // Fetch rules
  const rules = await query(`
    SELECT
      dr.detachmentId,
      dr.name,
      rcc.title as lore,
      rcc.textContent as rules
    FROM detachment_rule dr
    JOIN rule_container_component rcc ON dr.id = rcc.detachmentRuleId
    WHERE dr.detachmentId IN (${detIds})
    ORDER BY dr.displayOrder, rcc.displayOrder
  `);

  // Fetch enhancements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let enhancements: any[] = [];
  try {
    const enhCols = await query(`PRAGMA table_info(enhancement)`);
    const hasNewCols = enhCols.some(c => String(c.name) === 'isEquipableByNonCharacterUnit');
    if (hasNewCols) {
      enhancements = await query(`
        SELECT id, detachmentId, name, basePointsCost as pointsCost, lore, rules, cannotBeWarlord, isEquipableByNonCharacterUnit, isEquipableByEpicHero, [limit], isIncludedInEnhancementLimit
        FROM enhancement
        WHERE detachmentId IN (${detIds})
        ORDER BY displayOrder
      `);
    } else {
      enhancements = await query(`
        SELECT id, detachmentId, name, basePointsCost as pointsCost, lore, rules, cannotBeWarlord
        FROM enhancement
        WHERE detachmentId IN (${detIds})
        ORDER BY displayOrder
      `);
    }
  } catch (err) {
    console.error('Error fetching enhancements:', err);
    // Fallback to basic query
    enhancements = await query(`
      SELECT id, detachmentId, name, basePointsCost as pointsCost, lore, rules, cannotBeWarlord
      FROM enhancement
      WHERE detachmentId IN (${detIds})
      ORDER BY displayOrder
    `);
  }

  // Fetch required keywords for enhancements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let requiredKeywords: any[] = [];
  try {
    requiredKeywords = await query(`
      SELECT 
        erkg.enhancementId, 
        erkg.id as groupId, 
        k.name as keywordName
      FROM enhancement_required_keyword_group erkg
      JOIN enhancement_required_keyword_group_keyword erkgk ON erkg.id = erkgk.enhancementRequiredKeywordGroupId
      JOIN keyword k ON erkgk.keywordId = k.id
      WHERE erkg.enhancementId IN (
        SELECT id FROM enhancement WHERE detachmentId IN (${detIds})
      )
    `);
  } catch (err) {
    console.warn("Could not fetch required keywords for enhancements:", err);
  }

  // Fetch excluded keywords for enhancements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let excludedKeywords: any[] = [];
  try {
    excludedKeywords = await query(`
      SELECT 
        eek.enhancementId, 
        k.name as keywordName
      FROM enhancement_excluded_keyword eek
      JOIN keyword k ON eek.keywordId = k.id
      WHERE eek.enhancementId IN (
        SELECT id FROM enhancement WHERE detachmentId IN (${detIds})
      )
    `);
  } catch (err) {
    console.warn("Could not fetch excluded keywords for enhancements:", err);
  }

  // Fetch enhancement-granted leadership (`enhancement_bodyguard_group*`) — lets an
  // enhancement's wearer additionally lead/support a squad on top of their intrinsic
  // `leads` list (e.g. Kaptin's Hat → Flash Gitz). Guarded: older DBs lack the table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let enhancementBodyguardGrants: any[] = [];
  try {
    const byDatasheet = await query(`
      SELECT ebg.enhancementId, ebg.bodyguardType, d.name AS targetName
      FROM enhancement_bodyguard_group ebg
      JOIN enhancement_bodyguard_group_datasheet ebgd ON ebgd.enhancementBodyguardGroupId = ebg.id
      JOIN datasheet d ON d.id = ebgd.datasheetId
      WHERE ebg.enhancementId IN (
        SELECT id FROM enhancement WHERE detachmentId IN (${detIds})
      )
    `);
    const byKeyword = await query(`
      SELECT ebg.enhancementId, ebg.bodyguardType, k.name AS targetName
      FROM enhancement_bodyguard_group ebg
      JOIN enhancement_bodyguard_group_keyword ebgk ON ebgk.enhancementBodyguardGroupId = ebg.id
      JOIN keyword k ON k.id = ebgk.keywordId
      WHERE ebg.enhancementId IN (
        SELECT id FROM enhancement WHERE detachmentId IN (${detIds})
      )
    `);
    enhancementBodyguardGrants = [...byDatasheet, ...byKeyword];
  } catch (err) {
    console.warn('Skipping enhancement-granted leadership (table missing):', err);
  }

  // Fetch stratagems
  const stratagems = await query(`
    SELECT id, detachmentId, name, lore, whenRules as "when", targetRules as "target", effectRules as "effect", restrictionRules as "restrictions", cpCost, key, category
    FROM stratagem
    WHERE detachmentId IN (${detIds})
    ORDER BY displayOrder
  `);

  // Fetch unique keyword restrictions
  const uniqueKeywords = await query(`
    SELECT duk.detachmentId, k.name
    FROM detachment_unique_keyword duk
    JOIN keyword k ON duk.keywordId = k.id
    WHERE duk.detachmentId IN (${detIds})
  `);

  // Fetch force dispositions. A detachment's disposition, crossed with the
  // opponent's, selects the primary mission (`force_disposition_mission`).
  // Almost every detachment has exactly one, but a detachment may offer several
  // for the player to choose between — guarded, since older DBs lack the table.
  let forceDispositions: Record<string, unknown>[] = [];
  try {
    forceDispositions = await query(`
      SELECT dfd.detachmentId, fd.id, fd.name
      FROM detachment_force_disposition dfd
      JOIN force_disposition fd ON fd.id = dfd.forceDispositionId
      WHERE dfd.detachmentId IN (${detIds})
      ORDER BY fd.name
    `);
  } catch (err) {
    console.warn('Skipping force dispositions (table missing):', err);
  }

  return detachments.map(det => {
    const restrictions = uniqueKeywords.filter(uk => uk.detachmentId === det.id).map(uk => `UNIQUE: ${String(uk.name).toUpperCase()}`);

    return {
      ...det,
      slug: slugify(String(det.name)),
      rules: rules.filter(r => r.detachmentId === det.id),
      enhancements: enhancements.filter(e => e.detachmentId === det.id).map(e => {
        // Group required keywords by groupId
        const reqKws = requiredKeywords.filter(rk => rk.enhancementId === e.id);
        const groupsMap = new Map<string, string[]>();
        reqKws.forEach(rk => {
          if (!groupsMap.has(rk.groupId)) groupsMap.set(rk.groupId, []);
          groupsMap.get(rk.groupId)!.push(String(rk.keywordName));
        });
        const requiredKeywordGroups = Array.from(groupsMap.values());

        const exclKws = excludedKeywords.filter(ek => ek.enhancementId === e.id).map(ek => String(ek.keywordName));

        const grantsLeadership = enhancementBodyguardGrants
          .filter(g => g.enhancementId === e.id)
          .map(g => ({ targetName: String(g.targetName), bodyguardType: String(g.bodyguardType) }));

        return {
          ...e,
          pointsCost: Number(e.pointsCost) || 0,
          cannotBeWarlord: !!e.cannotBeWarlord,
          isEquipableByNonCharacterUnit: e.isEquipableByNonCharacterUnit !== undefined ? !!e.isEquipableByNonCharacterUnit : false,
          isEquipableByEpicHero: e.isEquipableByEpicHero !== undefined ? !!e.isEquipableByEpicHero : false,
          limit: e.limit !== undefined && e.limit !== null ? Number(e.limit) : 1,
          isIncludedInEnhancementLimit: e.isIncludedInEnhancementLimit !== undefined ? !!e.isIncludedInEnhancementLimit : true,
          requiredKeywordGroups,
          excludedKeywords: exclKws,
          grantsLeadership,
        };
      }),
      stratagems: stratagems.filter(s => s.detachmentId === det.id),
      restrictions: restrictions,
      forceDispositions: forceDispositions
        .filter(fd => fd.detachmentId === det.id)
        .map(fd => ({ id: String(fd.id), name: String(fd.name) })),
    };
  });
};

/**
 * Some rules grant a keyword to a unit purely via rule text (detachment ability,
 * allegiance/sub-faction choice, or a specific model's Warlord-conditional ability)
 * rather than as a native datasheet keyword. The `conditional_keyword` table is the
 * DB's structured record of these grants. Every gate is now surfaced with a
 * human-readable name so the builder can evaluate it against the current roster:
 *   - `requiredDetachmentName` — only while that detachment is selected.
 *   - `requiredAllegianceAbilityName` — only while that allegiance ability is
 *     declared (see the allegiance selector; previously these rows were dropped).
 *   - `requiredRosterFactionKeywordName` — only while the roster declares that
 *     sub-faction keyword (e.g. a Space Marine Chapter).
 *   - `requiredWarlordUnitName` — only trusted when the required miniature is the
 *     sole miniature on its datasheet, since `RosterUnit.isWarlord` is tracked per
 *     unit, not per-model-within-a-squad, so we can't resolve which specific model
 *     in a multi-model unit holds Warlord status. Multi-model warlord gates are
 *     still filtered out.
 * Rows whose allegiance/roster-keyword gate isn't satisfied simply won't match in
 * `applyKeywordGrants`, so returning them is backward-compatible.
 */
export async function getConditionalKeywordGrants(factionSlug: string): Promise<Record<string, unknown>[]> {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');

  return await query(`
    SELECT
      d.name as datasheetName,
      k.name as keywordName,
      det.name as requiredDetachmentName,
      m.name as requiredWarlordUnitName,
      aa.name as requiredAllegianceAbilityName,
      rfk.name as requiredRosterFactionKeywordName
    FROM conditional_keyword ck
    JOIN datasheet d ON d.id = ck.datasheetId
    JOIN keyword k ON k.id = ck.keywordId
    LEFT JOIN detachment det ON det.id = ck.requiredDetachmentId
    LEFT JOIN miniature m ON m.id = ck.requiredWarlordMiniatureId
    LEFT JOIN allegiance_ability aa ON aa.id = ck.requiredAllegianceAbilityId
    LEFT JOIN faction_keyword rfk ON rfk.id = ck.requiredRosterFactionKeywordId
    WHERE ck.datasheetId IN (
        SELECT datasheetId FROM datasheet_faction_keyword WHERE factionKeywordId IN (${idList})
      )
      AND (
        ck.requiredWarlordMiniatureId IS NULL
        OR (SELECT COUNT(*) FROM miniature m2 WHERE m2.datasheetId = m.datasheetId) = 1
      )
  `);
}

/**
 * Allegiance / sub-faction choices for a faction. Two mechanisms feed the builder's
 * allegiance selector:
 *   1. `allegiance_ability_group` — structured choice-sets (e.g. "Mark of Chaos",
 *      "Daemonic Allegiance"). Each group is `isMandatory` (must pick) with
 *      min/max picks, optionally scoped to a detachment. Detachment-scoped groups
 *      link to the faction via detachment→faction keyword; faction-wide groups
 *      (no detachmentId) link via any of their abilities being referenced by one of
 *      the faction's `conditional_keyword` rows.
 *   2. Declarable sub-faction keywords — the distinct `faction_keyword`s referenced
 *      by this faction's `conditional_keyword.requiredRosterFactionKeywordId` (e.g.
 *      a Space Marine Chapter). Returned as a synthetic optional group so a single
 *      selector drives both grant gates.
 * All tables probed defensively.
 */
export async function getAllegianceGroups(factionSlug: string): Promise<Record<string, unknown>[]> {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');
  const results: Record<string, unknown>[] = [];

  try {
    const groups = await query(`
      SELECT g.id, g.name, g.isMandatory, g.minRosterLimit, g.maxRosterLimit, det.name AS detachmentName
      FROM allegiance_ability_group g
      LEFT JOIN detachment det ON det.id = g.detachmentId
      WHERE
        g.detachmentId IN (
          SELECT det2.id FROM detachment det2
          JOIN detachment_faction_keyword dfk ON dfk.detachmentId = det2.id
          WHERE dfk.factionKeywordId IN (${idList})
        )
        OR (g.detachmentId IS NULL AND g.id IN (
          SELECT a.allegianceAbilityGroupId
          FROM allegiance_ability a
          JOIN conditional_keyword ck ON ck.requiredAllegianceAbilityId = a.id
          WHERE ck.datasheetId IN (
            SELECT datasheetId FROM datasheet_faction_keyword WHERE factionKeywordId IN (${idList})
          )
        ))
    `);

    if (groups.length > 0) {
      const groupIds = groups.map(g => `'${g.id}'`).join(',');
      const abilities = await query(`
        SELECT id, allegianceAbilityGroupId AS groupId, name, rules
        FROM allegiance_ability
        WHERE allegianceAbilityGroupId IN (${groupIds})
        ORDER BY displayOrder
      `);
      groups.forEach(g => {
        results.push({
          id: String(g.id),
          name: String(g.name),
          kind: 'ability',
          isMandatory: !!g.isMandatory,
          minRosterLimit: g.minRosterLimit != null ? Number(g.minRosterLimit) : null,
          maxRosterLimit: g.maxRosterLimit != null ? Number(g.maxRosterLimit) : null,
          detachmentName: g.detachmentName ? String(g.detachmentName) : null,
          abilities: abilities
            .filter(a => a.groupId === g.id)
            .map(a => ({ id: String(a.id), name: String(a.name), rules: a.rules ? String(a.rules) : null })),
        });
      });
    }
  } catch (err) {
    console.warn('Skipping allegiance ability groups (table missing or incompatible):', err);
  }

  // Declarable sub-faction keywords (roster-faction-keyword gated grants).
  try {
    const subfactions = await query(`
      SELECT DISTINCT rfk.id, rfk.name
      FROM conditional_keyword ck
      JOIN faction_keyword rfk ON rfk.id = ck.requiredRosterFactionKeywordId
      WHERE ck.requiredRosterFactionKeywordId IS NOT NULL
        AND ck.datasheetId IN (
          SELECT datasheetId FROM datasheet_faction_keyword WHERE factionKeywordId IN (${idList})
        )
      ORDER BY rfk.name
    `);
    if (subfactions.length > 0) {
      results.push({
        id: 'subfaction-keyword',
        name: 'Sub-faction',
        kind: 'factionKeyword',
        isMandatory: false,
        minRosterLimit: null,
        maxRosterLimit: 1,
        detachmentName: null,
        abilities: subfactions.map(s => ({ id: `fk:${s.name}`, name: String(s.name), rules: null })),
      });
    }
  } catch (err) {
    console.warn('Skipping declarable sub-factions (table missing or incompatible):', err);
  }

  return results;
}

/**
 * Army-wide special rules for a faction (`army_rule` + `army_rule_faction_keyword`),
 * e.g. Oath of Moment, Acts of Faith. Display-only; `army_rule_behaviour_type`
 * rule-engine metadata is intentionally ignored. Probed defensively.
 */
export async function getArmyRules(factionSlug: string): Promise<Record<string, unknown>[]> {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');
  try {
    // Rule prose lives in rule_container_component.armyRuleId (same pattern as
    // detachment rules). Concatenate a rule's components in display order.
    const rows = await query(`
      SELECT ar.id, ar.name, ar.displayOrder AS ruleOrder,
             rcc.title, rcc.textContent, rcc.displayOrder AS compOrder
      FROM army_rule ar
      JOIN army_rule_faction_keyword arfk ON arfk.armyRuleId = ar.id
      LEFT JOIN rule_container_component rcc ON rcc.armyRuleId = ar.id
      WHERE arfk.factionKeywordId IN (${idList})
        AND ar.hiddenFromCommandBunker = 0
      ORDER BY ar.displayOrder, rcc.displayOrder
    `);

    const byRule = new Map<string, { name: string; parts: string[] }>();
    rows.forEach(r => {
      const id = String(r.id);
      if (!byRule.has(id)) byRule.set(id, { name: String(r.name), parts: [] });
      const text = r.textContent ? String(r.textContent) : '';
      if (text) byRule.get(id)!.parts.push(text);
    });
    return Array.from(byRule.entries()).map(([id, v]) => ({
      id,
      name: v.name,
      rules: v.parts.join('\n\n'),
    }));
  } catch (err) {
    console.warn('Skipping army rules (table missing or incompatible):', err);
    return [];
  }
}

/**
 * Datasheets that cannot legally be taken in a given context. Two DB tables feed
 * this: `detachment_excluded_datasheet` (barred while a specific detachment is
 * selected) and `faction_keyword_excluded_datasheet` (barred from the faction
 * outright). Resolves ids to human-readable names so the builder can match on the
 * roster unit's own name, mirroring `getConditionalKeywordGrants`. Both tables are
 * probed defensively — a companion-app DB without them degrades to no exclusions
 * rather than failing the whole faction load.
 */
export async function getExcludedDatasheets(factionSlug: string): Promise<Record<string, unknown>[]> {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');

  // Only this faction's own datasheets can appear in the roster, so scope both
  // exclusion lists to datasheets carrying one of the faction's keywords.
  const dsScope = `
    SELECT datasheetId FROM datasheet_faction_keyword WHERE factionKeywordId IN (${idList})
  `;

  const results: Record<string, unknown>[] = [];

  try {
    const detachmentExclusions = await query(`
      SELECT d.name AS datasheetName, det.name AS detachmentName
      FROM detachment_excluded_datasheet x
      JOIN datasheet d ON d.id = x.datasheetId
      JOIN detachment det ON det.id = x.detachmentId
      WHERE x.detachmentId IN (
        SELECT det2.id FROM detachment det2
        JOIN detachment_faction_keyword dfk ON dfk.detachmentId = det2.id
        WHERE dfk.factionKeywordId IN (${idList})
      )
      AND x.datasheetId IN (${dsScope})
    `);
    results.push(...detachmentExclusions);
  } catch (err) {
    console.warn('Skipping detachment exclusions (table missing or incompatible):', err);
  }

  try {
    const factionExclusions = await query(`
      SELECT d.name AS datasheetName, NULL AS detachmentName
      FROM faction_keyword_excluded_datasheet x
      JOIN datasheet d ON d.id = x.datasheetId
      WHERE x.factionKeywordId IN (${idList})
      AND x.datasheetId IN (${dsScope})
    `);
    results.push(...factionExclusions);
  } catch (err) {
    console.warn('Skipping faction exclusions (table missing or incompatible):', err);
  }

  return results;
}

/**
 * Per-roster caps on units carrying certain keywords (`keyword_restriction_group`),
 * e.g. "0-1 Shadowseer". Each group scopes to a faction keyword, lists the unit
 * keywords it governs, an optional base `limit`, an optional Warlord gate
 * (`requiresWarlordMiniatureId` — resolved to a unit name only when that miniature
 * is the sole model on its datasheet, matching the guard in
 * `getConditionalKeywordGrants`), and an optional faction keyword that lifts the cap
 * (`excludedFactionKeywordId`). `restriction_group_detachment_limit` supplies
 * per-detachment min/max overrides. All tables probed defensively.
 */
export async function getKeywordRestrictionGroups(factionSlug: string): Promise<Record<string, unknown>[]> {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');

  try {
    const groups = await query(`
      SELECT
        g.id,
        g."limit" AS baseLimit,
        xfk.name AS excludedFactionKeywordName,
        CASE
          WHEN g.requiresWarlordMiniatureId IS NOT NULL
            AND (SELECT COUNT(*) FROM miniature m2 WHERE m2.datasheetId = wm.datasheetId) = 1
          THEN wd.name
          ELSE NULL
        END AS requiredWarlordUnitName
      FROM keyword_restriction_group g
      LEFT JOIN faction_keyword xfk ON xfk.id = g.excludedFactionKeywordId
      LEFT JOIN miniature wm ON wm.id = g.requiresWarlordMiniatureId
      LEFT JOIN datasheet wd ON wd.id = wm.datasheetId
      WHERE g.factionKeywordId IN (${idList})
    `);
    if (groups.length === 0) return [];
    const groupIds = groups.map(g => `'${g.id}'`).join(',');

    const groupKeywords = await query(`
      SELECT gk.keywordRestrictionGroupId AS groupId, k.name AS keyword
      FROM keyword_restriction_group_keyword gk
      JOIN keyword k ON k.id = gk.keywordId
      WHERE gk.keywordRestrictionGroupId IN (${groupIds})
    `);

    let detachmentLimits: Record<string, unknown>[] = [];
    try {
      detachmentLimits = await query(`
        SELECT l.restrictionGroupId AS groupId, det.name AS detachmentName,
               l.minRosterLimit AS min, l.maxRosterLimit AS max
        FROM restriction_group_detachment_limit l
        JOIN detachment det ON det.id = l.detachmentId
        WHERE l.restrictionGroupId IN (${groupIds})
      `);
    } catch (err) {
      console.warn('Skipping restriction detachment limits (table missing or incompatible):', err);
    }

    return groups.map(g => ({
      keywords: groupKeywords.filter(gk => gk.groupId === g.id).map(gk => String(gk.keyword)),
      limit: g.baseLimit != null ? Number(g.baseLimit) : null,
      requiredWarlordUnitName: g.requiredWarlordUnitName ? String(g.requiredWarlordUnitName) : null,
      excludedFactionKeywordName: g.excludedFactionKeywordName ? String(g.excludedFactionKeywordName) : null,
      detachmentLimits: detachmentLimits
        .filter(l => l.groupId === g.id)
        .map(l => ({
          detachmentName: String(l.detachmentName),
          min: l.min != null ? Number(l.min) : null,
          max: l.max != null ? Number(l.max) : null,
        })),
    }));
  } catch (err) {
    console.warn('Skipping keyword restriction groups (table missing or incompatible):', err);
    return [];
  }
}

/**
 * Detachment-scoped Warlord constraints. `detachment_mandatory_warlord_miniature`
 * forces a specific unit to be the Warlord while its detachment is selected (the
 * DB-driven, authoritative version of intrinsic "Supreme Commander" auto-designation,
 * and the correct source for Primarch/Ghazghkull-style rules);
 * `detachment_granted_warlord_miniature` merely permits a unit to be Warlord. Both
 * tables resolve miniature -> datasheet name and are probed defensively.
 */
export async function getDetachmentWarlordRules(factionSlug: string): Promise<Record<string, unknown>[]> {
  const kwIds = await getFactionKeywordIds(factionSlug);
  if (kwIds.length === 0) return [];
  const idList = kwIds.map(id => `'${id}'`).join(',');
  const detScope = `
    SELECT det.id FROM detachment det
    JOIN detachment_faction_keyword dfk ON dfk.detachmentId = det.id
    WHERE dfk.factionKeywordId IN (${idList})
  `;

  const fetchRule = async (table: string): Promise<Record<string, unknown>[]> => {
    try {
      return await query(`
        SELECT det.name AS detachmentName, d.name AS datasheetName
        FROM ${table} w
        JOIN detachment det ON det.id = w.detachmentId
        JOIN miniature m ON m.id = w.miniatureId
        JOIN datasheet d ON d.id = m.datasheetId
        WHERE w.detachmentId IN (${detScope})
      `);
    } catch (err) {
      console.warn(`Skipping ${table} (table missing or incompatible):`, err);
      return [];
    }
  };

  const mandatory = await fetchRule('detachment_mandatory_warlord_miniature');
  const granted = await fetchRule('detachment_granted_warlord_miniature');

  const byDetachment = new Map<string, { detachmentName: string; mandatory: Set<string>; granted: Set<string> }>();
  const ensure = (name: string) => {
    if (!byDetachment.has(name)) byDetachment.set(name, { detachmentName: name, mandatory: new Set(), granted: new Set() });
    return byDetachment.get(name)!;
  };
  mandatory.forEach(r => ensure(String(r.detachmentName)).mandatory.add(String(r.datasheetName)));
  granted.forEach(r => ensure(String(r.detachmentName)).granted.add(String(r.datasheetName)));

  return Array.from(byDetachment.values()).map(v => ({
    detachmentName: v.detachmentName,
    mandatoryWarlordDatasheets: Array.from(v.mandatory),
    grantedWarlordDatasheets: Array.from(v.granted),
  }));
}

/**
 * Returns a list of all playable factions for the dashboard.
 */
export const getFactionList = async () => {
  // We'll use the core faction keywords as our base, filtered for those we want to display
  // or those that have units.
  const factions = await query(`
    SELECT DISTINCT
      fk.name as faction,
      fk.id
    FROM faction_keyword fk
    JOIN datasheet_faction_keyword dfk ON fk.id = dfk.factionKeywordId
    ORDER BY fk.name
  `);

  const results = await Promise.all(factions.map(async f => {
    const slug = slugify(String(f.faction));

    // For the dashboard preview, we can get actual counts from the DB
    const kwIds = await getFactionKeywordIds(slug);
    if (kwIds.length === 0) return null;
    const idList = kwIds.map(id => `'${id}'`).join(',');

    const unitCount = await query(`SELECT COUNT(DISTINCT datasheetId) as count FROM datasheet_faction_keyword WHERE factionKeywordId IN (${idList})`);
    const detCount = await query(`SELECT COUNT(DISTINCT detachmentId) as count FROM detachment_faction_keyword WHERE factionKeywordId IN (${idList})`);

    return {
      faction: String(f.faction),
      slug: slug,
      units: Number(unitCount[0]?.count) || 0,
      detachments: Number(detCount[0]?.count) || 0,
    };
  }));

  // Filter out meta-factions that shouldn't be top-level or are empty
  const blacklist = ['asuryani', 'harlequins', 'ynnari', 'legiones-daemonica', 'heretic-astartes', 'blood-legions', 'plague-legions', 'scintillating-legions', 'legions-of-excess'];

  return results.filter(f => f !== null && !blacklist.includes(f.slug)) as { faction: string; slug: string; units: number; detachments: number }[];
};

export interface BattleSize {
  name: string;
  pointsLimit: number;
  detachmentPointsLimit: number;
  enhancementLimit: number;
  duplicateUnitLimit: number;
}

/**
 * Per-game-size army construction limits, smallest game first.
 */
export const getBattleSizes = async (): Promise<BattleSize[]> => {
  const rows = await query(`
    SELECT name, pointsLimit, detachmentPointsLimit, enhancementLimit, duplicateUnitLimit
    FROM battle_size
    ORDER BY pointsLimit
  `);
  return rows.map(r => ({
    name: String(r.name),
    pointsLimit: Number(r.pointsLimit),
    detachmentPointsLimit: Number(r.detachmentPointsLimit),
    enhancementLimit: Number(r.enhancementLimit),
    duplicateUnitLimit: Number(r.duplicateUnitLimit),
  }));
};

/**
 * Faction keyword slugs that don't appear in the app's faction list directly
 * (they're folded into a meta-faction — the inverse of META_FACTION_MAP).
 */
const ROSTER_FACTION_SLUG_MAP: Record<string, string> = {
  'asuryani': 'aeldari',
  'harlequins': 'aeldari',
  'ynnari': 'aeldari',
  'legiones-daemonica': 'chaos-daemons',
  'blood-legions': 'chaos-daemons',
  'plague-legions': 'chaos-daemons',
  'scintillating-legions': 'chaos-daemons',
  'legions-of-excess': 'chaos-daemons',
  'heretic-astartes': 'chaos-space-marines',
};

export interface SavedDbRosterSummary {
  id: string;
  name: string;
  factionName: string;
  factionSlug: string;
  battleSizeName: string | null;
  pointsLimit: number | null;
  unitCount: number;
  modifiedAt: string;
}

export interface DbRosterUnitDetail {
  rosterUnitId: string;
  datasheetName: string;
  allyType: string;
  isWarlord: boolean;
  modelsCount: number;
  modelCounts: { name: string; count: number }[];
  wargearCounts: { name: string; count: number }[];
  enhancementName: string | null;
  /** roster_unit id of the bodyguard unit this unit is attached to (leaders/support). */
  attachedToRosterUnitId: string | null;
}

export interface DbRosterDetail {
  id: string;
  name: string;
  factionName: string;
  factionSlug: string;
  detachmentName: string | null;
  pointsLimit: number | null;
  units: DbRosterUnitDetail[];
  /** Distinct allegiance ability ids declared across the roster's units, if any. */
  allegianceAbilityIds: string[];
}

const rosterFactionSlug = (factionName: string): string => {
  const slug = slugify(factionName);
  return ROSTER_FACTION_SLUG_MAP[slug] || slug;
};

/**
 * Lists army rosters saved in the companion-app database, if any.
 * Not every uploaded DB has these tables/rows — returns [] instead of throwing.
 */
export const getSavedDbRosters = async (): Promise<SavedDbRosterSummary[]> => {
  try {
    const hasTable = await query("SELECT name FROM sqlite_master WHERE type='table' AND name='roster'");
    if (hasTable.length === 0) return [];

    const rows = await query(`
      SELECT r.id, r.name, r.modifiedAt,
             fk.name AS factionName,
             bs.name AS battleSizeName, bs.pointsLimit,
             (SELECT COUNT(*) FROM roster_unit ru WHERE ru.rosterId = r.id) AS unitCount
      FROM roster r
      LEFT JOIN faction_keyword fk ON fk.id = r.factionKeywordId
      LEFT JOIN battle_size bs ON bs.id = r.battleSizeId
      ORDER BY r.modifiedAt DESC
    `);

    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      factionName: String(r.factionName || ''),
      factionSlug: rosterFactionSlug(String(r.factionName || '')),
      battleSizeName: r.battleSizeName ? String(r.battleSizeName) : null,
      pointsLimit: r.pointsLimit != null ? Number(r.pointsLimit) : null,
      unitCount: Number(r.unitCount) || 0,
      modifiedAt: String(r.modifiedAt || ''),
    }));
  } catch (err) {
    console.warn('Could not read saved rosters from database:', err);
    return [];
  }
};

/**
 * Loads the full contents of one saved companion-app roster:
 * units, per-model counts, wargear selections, enhancements, and leader attachments.
 */
export const getDbRosterDetail = async (rosterId: string): Promise<DbRosterDetail | null> => {
  const rosterRows = await query(`
    SELECT r.id, r.name, fk.name AS factionName, bs.pointsLimit
    FROM roster r
    LEFT JOIN faction_keyword fk ON fk.id = r.factionKeywordId
    LEFT JOIN battle_size bs ON bs.id = r.battleSizeId
    WHERE r.id = ?
  `, [rosterId]);
  if (rosterRows.length === 0) return null;
  const rosterRow = rosterRows[0];

  const detachmentRows = await query(`
    SELECT det.name
    FROM roster_detachment rd
    JOIN detachment det ON det.id = rd.detachmentId
    WHERE rd.rosterId = ?
  `, [rosterId]);

  const unitRows = await query(`
    SELECT ru.id, ru.allyType, d.name AS datasheetName
    FROM roster_unit ru
    JOIN datasheet d ON d.id = ru.datasheetId
    WHERE ru.rosterId = ?
  `, [rosterId]);

  const miniatureRows = await query(`
    SELECT rum.rosterUnitId, m.name, SUM(rum.count) AS count, MAX(rum.isWarlord) AS isWarlord
    FROM roster_unit_miniature rum
    JOIN miniature m ON m.id = rum.miniatureId
    JOIN roster_unit ru ON ru.id = rum.rosterUnitId
    WHERE ru.rosterId = ?
    GROUP BY rum.rosterUnitId, m.name
  `, [rosterId]);

  // Wargear chosen at the unit level and at the per-miniature level both
  // resolve to wargear_item names; merge them into one name -> count map per unit.
  const unitWargearRows = await query(`
    SELECT ruwo.rosterUnitId, wi.name, SUM(ruwo.count) AS count
    FROM roster_unit_wargear_option ruwo
    JOIN wargear_option wo ON wo.id = ruwo.wargearOptionId
    JOIN wargear_item wi ON wi.id = wo.wargearItemId
    JOIN roster_unit ru ON ru.id = ruwo.rosterUnitId
    WHERE ru.rosterId = ?
    GROUP BY ruwo.rosterUnitId, wi.name
  `, [rosterId]);

  const miniatureWargearRows = await query(`
    SELECT rum.rosterUnitId, wi.name, SUM(rumwo.count) AS count
    FROM roster_unit_miniature_wargear_option rumwo
    JOIN roster_unit_miniature rum ON rum.id = rumwo.rosterUnitMiniatureId
    JOIN wargear_option wo ON wo.id = rumwo.wargearOptionId
    JOIN wargear_item wi ON wi.id = wo.wargearItemId
    JOIN roster_unit ru ON ru.id = rum.rosterUnitId
    WHERE ru.rosterId = ?
    GROUP BY rum.rosterUnitId, wi.name
  `, [rosterId]);

  const enhancementRows = await query(`
    SELECT rum.rosterUnitId, e.name
    FROM roster_unit_miniature_enhancement rume
    JOIN roster_unit_miniature rum ON rum.id = rume.rosterUnitMiniatureId
    JOIN enhancement e ON e.id = rume.enhancementId
    JOIN roster_unit ru ON ru.id = rum.rosterUnitId
    WHERE ru.rosterId = ?
  `, [rosterId]);

  const attachmentRows = await query(`
    SELECT raur.rosterAttachedUnitId, raur.rosterUnitId, raur.attachmentType
    FROM roster_attached_unit_roster_unit raur
    JOIN roster_attached_unit rau ON rau.id = raur.rosterAttachedUnitId
    WHERE rau.rosterId = ?
  `, [rosterId]);

  // Within each attached-unit group, leaders and support units attach to the bodyguard unit.
  const attachedToMap = new Map<string, string>();
  const groups = new Map<string, { bodyguardId: string | null; others: string[] }>();
  attachmentRows.forEach(row => {
    const groupId = String(row.rosterAttachedUnitId);
    if (!groups.has(groupId)) groups.set(groupId, { bodyguardId: null, others: [] });
    const group = groups.get(groupId)!;
    if (String(row.attachmentType) === 'bodyguard') {
      group.bodyguardId = String(row.rosterUnitId);
    } else {
      group.others.push(String(row.rosterUnitId));
    }
  });
  groups.forEach(group => {
    if (group.bodyguardId) {
      group.others.forEach(id => attachedToMap.set(id, group.bodyguardId!));
    }
  });

  const units: DbRosterUnitDetail[] = unitRows.map(u => {
    const unitId = String(u.id);
    const minis = miniatureRows.filter(m => String(m.rosterUnitId) === unitId);
    const wargearByName = new Map<string, number>();
    [...unitWargearRows, ...miniatureWargearRows]
      .filter(w => String(w.rosterUnitId) === unitId)
      .forEach(w => {
        const name = String(w.name);
        wargearByName.set(name, (wargearByName.get(name) || 0) + Number(w.count));
      });
    const enhancement = enhancementRows.find(e => String(e.rosterUnitId) === unitId);

    return {
      rosterUnitId: unitId,
      datasheetName: String(u.datasheetName),
      allyType: String(u.allyType || 'native'),
      isWarlord: minis.some(m => Number(m.isWarlord) === 1),
      modelsCount: minis.reduce((sum, m) => sum + Number(m.count), 0),
      modelCounts: minis.map(m => ({ name: String(m.name), count: Number(m.count) })),
      wargearCounts: Array.from(wargearByName.entries()).map(([name, count]) => ({ name, count })),
      enhancementName: enhancement ? String(enhancement.name) : null,
      attachedToRosterUnitId: attachedToMap.get(unitId) || null,
    };
  });

  // Declared allegiance abilities (per-unit in the companion schema; deduped to an
  // army-level set). Table may be absent/empty — degrade to none.
  let allegianceAbilityIds: string[] = [];
  try {
    const rows = await query(`
      SELECT DISTINCT rua.allegianceAbilityId AS id
      FROM roster_unit_allegiance_ability rua
      JOIN roster_unit ru ON ru.id = rua.rosterUnitId
      WHERE ru.rosterId = ?
    `, [rosterId]);
    allegianceAbilityIds = rows.map(r => String(r.id));
  } catch (err) {
    console.warn('Could not read roster allegiance abilities:', err);
  }

  const factionName = String(rosterRow.factionName || '');
  return {
    id: String(rosterRow.id),
    name: String(rosterRow.name),
    factionName,
    factionSlug: rosterFactionSlug(factionName),
    detachmentName: detachmentRows.length > 0 ? String(detachmentRows[0].name) : null,
    pointsLimit: rosterRow.pointsLimit != null ? Number(rosterRow.pointsLimit) : null,
    units,
    allegianceAbilityIds,
  };
};

export const getDbStats = async () => {
  const tableCount = await query("SELECT count(*) as count FROM sqlite_master WHERE type='table'");
  const datasheetCount = await query("SELECT count(*) as count FROM datasheet");
  const miniatureCount = await query("SELECT count(*) as count FROM miniature");
  const wargearItemCount = await query("SELECT count(*) as count FROM wargear_item");
  const stratagemCount = await query("SELECT count(*) as count FROM stratagem");
  const enhancementCount = await query("SELECT count(*) as count FROM enhancement");
  const detachmentCount = await query("SELECT count(*) as count FROM detachment");
  const metadata = await query("SELECT dataVersion FROM metadata LIMIT 1");

  const version = Number(metadata[0]?.dataVersion) || 0;

  return {
    dataVersion: version,
    extractedAt: 'Companion App v' + version,
    counts: {
      tables: Number(tableCount[0]?.count) || 0,
      datasheets: Number(datasheetCount[0]?.count) || 0,
      miniatures: Number(miniatureCount[0]?.count) || 0,
      wargearItems: Number(wargearItemCount[0]?.count) || 0,
      stratagems: Number(stratagemCount[0]?.count) || 0,
      enhancements: Number(enhancementCount[0]?.count) || 0,
      detachments: Number(detachmentCount[0]?.count) || 0,
    }
  };
};

/**
 * The full Core Rules book (movement, phases, terrain, stratagem timing, etc.),
 * extracted from `rule_section` → `rule_container` → `rule_container_component`
 * under the `publication` row named "Core Rules". Looked up by name rather than a
 * hardcoded id since companion-app schema versions vary. Probed defensively —
 * degrades to an empty array if the publication or any of these tables are missing.
 */
export async function getCoreRules(): Promise<CoreRuleSection[]> {
  try {
    const pubs = await query("SELECT id FROM publication WHERE name = 'Core Rules' LIMIT 1");
    if (pubs.length === 0) return [];
    const pubId = String(pubs[0].id);

    const sections = await query(
      `SELECT id, name FROM rule_section WHERE publicationId = ? ORDER BY displayOrder`,
      [pubId]
    );
    if (sections.length === 0) return [];
    const sectionIdList = sections.map(s => `'${s.id}'`).join(',');

    const containers = await query(
      `SELECT id, ruleSectionId, title, subtitle, containerType
       FROM rule_container WHERE ruleSectionId IN (${sectionIdList}) ORDER BY displayOrder`
    );

    let components: Record<string, unknown>[] = [];
    let bulletPoints: Record<string, unknown>[] = [];
    if (containers.length > 0) {
      const containerIdList = containers.map(c => `'${c.id}'`).join(',');
      components = await query(
        `SELECT id, ruleContainerId, type, title, subtitle, textContent, trigger, effect, imageUrl
         FROM rule_container_component WHERE ruleContainerId IN (${containerIdList}) ORDER BY displayOrder`
      );

      // type 'bullets' components store their actual list text in `bullet_point`,
      // not `textContent` (which just holds a placeholder for those rows).
      const componentIdList = components.map(c => `'${c.id}'`).join(',');
      if (componentIdList.length > 0) {
        bulletPoints = await query(
          `SELECT ruleContainerComponentId, text
           FROM bullet_point WHERE ruleContainerComponentId IN (${componentIdList}) ORDER BY displayOrder`
        );
      }
    }

    const bulletsByComponent = new Map<string, string[]>();
    bulletPoints.forEach(b => {
      const componentId = String(b.ruleContainerComponentId);
      const list = bulletsByComponent.get(componentId) ?? [];
      list.push(String(b.text));
      bulletsByComponent.set(componentId, list);
    });

    const componentsByContainer = new Map<string, CoreRuleComponent[]>();
    components.forEach(c => {
      const containerId = String(c.ruleContainerId);
      const list = componentsByContainer.get(containerId) ?? [];
      list.push({
        id: String(c.id),
        type: String(c.type),
        title: c.title != null ? String(c.title) : null,
        subtitle: c.subtitle != null ? String(c.subtitle) : null,
        textContent: c.textContent != null ? String(c.textContent) : null,
        trigger: c.trigger != null ? String(c.trigger) : null,
        effect: c.effect != null ? String(c.effect) : null,
        imageUrl: c.imageUrl != null ? String(c.imageUrl) : null,
        bulletPoints: bulletsByComponent.get(String(c.id)) ?? [],
      });
      componentsByContainer.set(containerId, list);
    });

    const containersBySection = new Map<string, CoreRuleContainer[]>();
    containers.forEach(c => {
      const sectionId = String(c.ruleSectionId);
      const list = containersBySection.get(sectionId) ?? [];
      list.push({
        id: String(c.id),
        title: c.title != null ? String(c.title) : null,
        subtitle: c.subtitle != null ? String(c.subtitle) : null,
        containerType: String(c.containerType),
        components: componentsByContainer.get(String(c.id)) ?? [],
      });
      containersBySection.set(sectionId, list);
    });

    return sections.map(s => ({
      id: String(s.id),
      name: String(s.name),
      containers: containersBySection.get(String(s.id)) ?? [],
    }));
  } catch (err) {
    console.warn('Skipping core rules (publication/tables missing or incompatible):', err);
    return [];
  }
}

/**
 * Hover-glossary source for bracketed core-ability keywords (e.g. `[DEVASTATING
 * WOUNDS]`, `[SUSTAINED HITS]`) referenced throughout rules text as `<k>[X]</k>`.
 * Pulled from the Core Rules book's "24. Core Abilities" chapter — each container
 * there is titled with the bracketed keyword and its components hold the actual
 * definition prose. Keyed by the bracket contents, normalized (trimmed, uppercased,
 * brackets stripped) so callers can look up by the keyword text alone. Probed
 * defensively like `getCoreRules`.
 */
export async function getCoreAbilityGlossary(): Promise<Record<string, string>> {
  try {
    const sections = await query("SELECT id FROM rule_section WHERE name = '24. Core Abilities' LIMIT 1");
    if (sections.length === 0) return {};
    const sectionId = String(sections[0].id);

    const containers = await query(
      `SELECT id, title FROM rule_container WHERE ruleSectionId = ? AND title IS NOT NULL`,
      [sectionId]
    );
    if (containers.length === 0) return {};
    const containerIdList = containers.map(c => `'${c.id}'`).join(',');

    const components = await query(
      `SELECT ruleContainerId, textContent, trigger, effect
       FROM rule_container_component WHERE ruleContainerId IN (${containerIdList}) ORDER BY displayOrder`
    );

    const partsByContainer = new Map<string, string[]>();
    components.forEach(c => {
      const containerId = String(c.ruleContainerId);
      const parts = partsByContainer.get(containerId) ?? [];
      if (c.textContent) parts.push(String(c.textContent));
      if (c.trigger) parts.push(String(c.trigger));
      if (c.effect) parts.push(String(c.effect));
      partsByContainer.set(containerId, parts);
    });

    const glossary: Record<string, string> = {};
    containers.forEach(c => {
      const key = String(c.title).replace(/^\[|\]$/g, '').trim().toUpperCase();
      const parts = partsByContainer.get(String(c.id)) ?? [];
      if (key && parts.length > 0) glossary[key] = parts.join('\n\n');
    });
    return glossary;
  } catch (err) {
    console.warn('Skipping core ability glossary (table missing or incompatible):', err);
    return {};
  }
}

/**
 * FAQ / rules-commentary entries attached to specific Core Rules containers, via
 * `faq_config.ruleContainerId`. Keyed by container id so the Core Rules view can
 * render them as an aside under the relevant subsection. Scoped to the "Core
 * Rules" publication's own FAQ set (rather than datasheet/stratagem FAQs, which
 * share the same `faq` table but link via other `faq_config` columns). Probed
 * defensively like `getCoreRules`.
 */
export async function getCoreRulesFaqs(): Promise<Record<string, CoreRuleFaqEntry[]>> {
  try {
    const pubs = await query("SELECT id FROM publication WHERE name = 'Core Rules' LIMIT 1");
    if (pubs.length === 0) return {};
    const pubId = String(pubs[0].id);

    const rows = await query(
      `SELECT fc.id, fc.ruleContainerId, f.question, f.answer, f.errataHeader, f.errataText
       FROM faq_config fc
       JOIN faq f ON f.id = fc.faqId
       WHERE fc.ruleContainerId IS NOT NULL AND f.publicationId = ?
       ORDER BY f.displayOrder`,
      [pubId]
    );

    const byContainer: Record<string, CoreRuleFaqEntry[]> = {};
    rows.forEach(r => {
      const containerId = String(r.ruleContainerId);
      const list = byContainer[containerId] ?? (byContainer[containerId] = []);
      list.push({
        id: String(r.id),
        question: r.question != null ? String(r.question) : null,
        answer: r.answer != null ? String(r.answer) : null,
        errataHeader: r.errataHeader != null ? String(r.errataHeader) : null,
        errataText: r.errataText != null ? String(r.errataText) : null,
      });
    });
    return byContainer;
  } catch (err) {
    console.warn('Skipping core rules FAQ/errata (table missing or incompatible):', err);
    return {};
  }
}
