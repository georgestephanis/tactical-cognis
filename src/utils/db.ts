import initSqlJs from 'sql.js';
import type * as SQL from 'sql.js';
import type { WargearChoiceSet, WargearChoiceItem, WeaponProfile, LimitedWargearChoiceSet, LimitedWargearChoice, WargearLimit } from '../types/data';

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
 * Maps a name to a slug (lowercase, dash-separated).
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
async function getFactionKeywordIds(slug: string): Promise<string[]> {
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

  // 1. Get datasheets that have ANY of the faction keywords in our list
  const datasheets = await query(`
    SELECT DISTINCT
      d.id, d.name, d.unitComposition as compositionRules, p.name as publication,
      d.lore, d.maxModelCount, d.isFreeFromEntitlements
    FROM datasheet d
    JOIN datasheet_faction_keyword dfk ON d.id = dfk.datasheetId
    LEFT JOIN publication p ON d.publicationId = p.id
    WHERE dfk.factionKeywordId IN (${idList})
  `);

  if (datasheets.length === 0) return [];
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

  // 2b. Fetch invulnerable saves. Rows are keyed on datasheetId with an optional
  // miniatureId; a miniature-specific row wins over the datasheet-wide fallback.
  const invulnSaves = await query(`
    SELECT datasheetId, miniatureId, save, meleeSave, rangedSave
    FROM invulnerable_save
    WHERE datasheetId IN (${dsIds})
  `);
  // ponytail: split melee/ranged invulns collapse to one value; ~1 datasheet uses the split.
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

  // 4. Fetch all compositions
  const compositions = await query(`
    SELECT id, datasheetId, points, isDefault
    FROM unit_composition
    WHERE datasheetId IN (${dsIds})
    ORDER BY displayOrder
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

  // 8. Fetch wargear and weapons
  const wargearItems = await query(`
    SELECT id, name, wargearType FROM wargear_item
  `);
  const wargearItemMap = new Map<string, Record<string, unknown>>();
  wargearItems.forEach(item => wargearItemMap.set(String(item.id), item));

  const allProfiles = await query(`
    SELECT id, wargearItemId, name, type, range, attacks, ballisticSkill, weaponSkill, strength, armourPenetration, damage
    FROM wargear_item_profile
    ORDER BY displayOrder
  `);
  const profileAbilities = await query(`
    SELECT wipwa.wargearItemProfileId, wa.name
    FROM wargear_item_profile_wargear_ability wipwa
    JOIN wargear_ability wa ON wipwa.wargearAbilityId = wa.id
  `);

  const allLoadouts = await query(`
    SELECT id, datasheetId, miniatureId FROM base_miniature_loadout WHERE datasheetId IN (${dsIds})
  `);
  const loadoutOptions = await query(`
    SELECT bmlwo.baseMiniatureLoadoutId, bmlwo.count, wo.wargearItemId
    FROM base_miniature_loadout_wargear_option bmlwo
    JOIN wargear_option wo ON bmlwo.wargearOptionId = wo.id
    WHERE bmlwo.baseMiniatureLoadoutId IN (SELECT id FROM base_miniature_loadout WHERE datasheetId IN (${dsIds}))
  `);

  // Assemble wargear/weapons for each model
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
        return {
          name: p.name || item.name,
          type: p.type,
          range: p.range,
          attacks: p.attacks,
          ballisticSkill: p.ballisticSkill,
          weaponSkill: p.weaponSkill,
          strength: p.strength,
          armourPenetration: p.armourPenetration,
          damage: p.damage,
          rules: rules,
        };
      });

      weapons.push({
        name: item.name,
        wargearType: item.wargearType,
        count: Number(opt.count),
        profiles: profiles,
      });
    });

    weapons.sort((a, b) => String((a as { name: string }).name).localeCompare(String((b as { name: string }).name)));
    miniWeaponsMap.set(String(loadout.miniatureId), weapons);
  });

  // 8b. Fetch wargear choice sets
  const choiceSets = await query(`
    SELECT id, datasheetId, miniatureId, "limit", allowDuplicates, alternate
    FROM loadout_choice_set
    WHERE datasheetId IN (${dsIds})
  `);
  const choiceSetIds = choiceSets.map(cs => `'${cs.id}'`).join(',');

  const choices = choiceSetIds ? await query(`
    SELECT id, loadoutChoiceSetId
    FROM loadout_choice
    WHERE loadoutChoiceSetId IN (${choiceSetIds})
  `) : [];
  const choiceIds = choices.map(c => `'${c.id}'`).join(',');

  const choiceItems = choiceIds ? await query(`
    SELECT lcwi.loadoutChoiceId, lcwi.wargearItemId, lcwi.count
    FROM loadout_choice_wargear_item lcwi
    WHERE lcwi.loadoutChoiceId IN (${choiceIds})
  `) : [];

  // Map choice sets by miniatureId or datasheetId
  const choiceSetMap = new Map<string, WargearChoiceSet[]>();
  choiceSets.forEach(cs => {
    const csChoices = choices.filter(c => c.loadoutChoiceSetId === cs.id).map(c => {
      const items = choiceItems.filter(ci => ci.loadoutChoiceId === c.id).map(ci => {
        const item = wargearItemMap.get(String(ci.wargearItemId));
        if (!item) return null;

        const profiles: WeaponProfile[] = allProfiles.filter(p => p.wargearItemId === ci.wargearItemId).map(p => {
          const rules = profileAbilities.filter(pa => pa.wargearItemProfileId === p.id).map(pa => String(pa.name));
          return {
            name: p.name ? String(p.name) : String(item.name),
            type: String(p.type),
            range: String(p.range),
            attacks: String(p.attacks),
            ballisticSkill: p.ballisticSkill ? String(p.ballisticSkill) : null,
            weaponSkill: p.weaponSkill ? String(p.weaponSkill) : null,
            strength: String(p.strength),
            armourPenetration: String(p.armourPenetration),
            damage: String(p.damage),
            rules: rules,
          };
        });

        return {
          wargearItemId: String(ci.wargearItemId),
          name: String(item.name),
          wargearType: String(item.wargearType),
          count: Number(ci.count),
          profiles: profiles,
        } as WargearChoiceItem;
      }).filter((item): item is WargearChoiceItem => item !== null);

      return {
        id: String(c.id),
        items: items,
      };
    }).filter(choice => choice.items.length > 0); // Only keep choices that resolved successfully

    const key = String(cs.miniatureId || cs.datasheetId);
    if (!choiceSetMap.has(key)) {
      choiceSetMap.set(key, []);
    }
    choiceSetMap.get(key)!.push({
      id: String(cs.id),
      limit: Number(cs.limit),
      allowDuplicates: !!cs.allowDuplicates,
      alternate: !!cs.alternate,
      choices: csChoices,
    });
  });

  // 9. Fetch points steps (if any)
  const datasheetPointsSteps = await query(`
    SELECT datasheetId, stepAt, stepPoints
    FROM datasheet_points_step
    WHERE datasheetId IN (${dsIds})
    ORDER BY stepAt
  `);

  // 9b. Fetch limited wargear choice sets
  const limitedSets = await query(`
    SELECT id, datasheetId, miniatureId, mandatory
    FROM limited_wargear_choice_set
    WHERE datasheetId IN (${dsIds})
  `);
  const limitedSetIds = limitedSets.map(ls => `'${ls.id}'`).join(',');

  const limitedChoices = limitedSetIds ? await query(`
    SELECT id, limitedWargearChoiceSetId
    FROM limited_wargear_choice
    WHERE limitedWargearChoiceSetId IN (${limitedSetIds})
  `) : [];
  const limitedChoiceIds = limitedChoices.map(lc => `'${lc.id}'`).join(',');

  const limitedChoiceItems = limitedChoiceIds ? await query(`
    SELECT lwcwi.limitedWargearChoiceId, lwcwi.wargearItemId, lwcwi.count
    FROM limited_wargear_choice_wargear_item lwcwi
    WHERE lwcwi.limitedWargearChoiceId IN (${limitedChoiceIds})
  `) : [];

  const limitedLimits = limitedSetIds ? await query(`
    SELECT limitedWargearChoiceSetId, modelCount, choiceLimit, duplicateLimit
    FROM wargear_limit
    WHERE limitedWargearChoiceSetId IN (${limitedSetIds})
  `) : [];

  // Group limited sets by datasheet
  const limitedSetsMap = new Map<string, LimitedWargearChoiceSet[]>();
  limitedSets.forEach(ls => {
    const lsChoices = limitedChoices
      .filter(lc => lc.limitedWargearChoiceSetId === ls.id)
      .map(lc => {
        const itemIds = limitedChoiceItems
          .filter(lci => lci.limitedWargearChoiceId === lc.id)
          .map(lci => String(lci.wargearItemId));
        return {
          id: String(lc.id),
          wargearItemIds: itemIds
        } as LimitedWargearChoice;
      })
      .filter(choice => choice.wargearItemIds.length > 0);

    const lsLimits = limitedLimits
      .filter(lim => lim.limitedWargearChoiceSetId === ls.id)
      .map(lim => ({
        modelCount: Number(lim.modelCount),
        choiceLimit: Number(lim.choiceLimit),
        duplicateLimit: lim.duplicateLimit != null ? Number(lim.duplicateLimit) : null
      }) as WargearLimit);

    const key = String(ls.datasheetId);
    if (!limitedSetsMap.has(key)) {
      limitedSetsMap.set(key, []);
    }
    limitedSetsMap.get(key)!.push({
      id: String(ls.id),
      miniatureId: ls.miniatureId ? String(ls.miniatureId) : null,
      mandatory: !!ls.mandatory,
      limits: lsLimits,
      choices: lsChoices
    });
  });

  // Assemble
  const miniMap = new Map<string, Record<string, unknown>>();
  miniatures.forEach(m => {
    const kws = miniKeywords.filter(k => k.miniatureId === m.id).map(k => String(k.name));
    const sets = choiceSetMap.get(String(m.id)) || choiceSetMap.get(String(m.datasheetId)) || [];
    miniMap.set(String(m.id), {
      id: m.id,
      name: m.name,
      statlineHidden: !!m.statlineHidden,
      stats: { M: m.M, T: m.T, Sv: m.Sv, W: m.W, Ld: m.Ld, OC: m.OC, Inv: invForMini(m.datasheetId, m.id) },
      keywords: kws,
      weapons: miniWeaponsMap.get(String(m.id)) || [],
      wargearChoiceSets: sets,
    });
  });

  const compMap = new Map<string, unknown[]>();
  compositions.forEach(c => {
    const models = compModels.filter(cm => cm.unitCompositionId === c.id).map(cm => ({
      miniature: cm.miniature,
      min: cm.min,
      max: cm.max,
    }));
    if (!compMap.has(String(c.datasheetId))) compMap.set(String(c.datasheetId), []);
    compMap.get(String(c.datasheetId))!.push({
      id: c.id,
      isDefault: !!c.isDefault,
      points: Number(c.points),
      models: models,
    });
  });

  const abilityMap = new Map<string, unknown[]>();
  abilities.forEach(a => {
    if (!abilityMap.has(String(a.datasheetId))) abilityMap.set(String(a.datasheetId), []);
    abilityMap.get(String(a.datasheetId))!.push({
      name: a.name,
      type: a.type,
      isAura: !!a.isAura,
      isPsychic: !!a.isPsychic,
      rules: a.rules,
    });
  });

  const bodyguardMap = new Map<string, string[]>();
  bodyguardGroups.forEach(bg => {
    const names = bgDatasheets
      .filter(d => d.datasheetBodyguardGroupId === bg.id)
      .map(d => String(d.name));
    const kws = bgKeywords
      .filter(k => k.datasheetBodyguardGroupId === bg.id)
      .map(k => String(k.name));

    if (!bodyguardMap.has(String(bg.datasheetId))) {
      bodyguardMap.set(String(bg.datasheetId), []);
    }
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
    factionKeywords: datasheetFactionKeywords
      .filter(dfk => dfk.datasheetId === ds.id)
      .map(dfk => String(dfk.name)),
    models: miniatures.filter(m => m.datasheetId === ds.id).map(m => miniMap.get(String(m.id))),
    compositions: compMap.get(String(ds.id)) || [],
    abilities: abilityMap.get(String(ds.id)) || [],
    pointsSteps: datasheetPointsSteps
      .filter(dps => dps.datasheetId === ds.id)
      .map(dps => ({ stepAt: dps.stepAt, stepPoints: dps.stepPoints })),
    damageProfiles: damageRows
      .filter(dr => dr.datasheetId === ds.id)
      .map(dr => ({ name: String(dr.name), damagedAt: dr.damagedAt != null ? String(dr.damagedAt) : null, rules: String(dr.rules ?? '') })),
    leads: bodyguardMap.get(String(ds.id)) || [],
    limitedWargearChoiceSets: limitedSetsMap.get(String(ds.id)) || [],
  }));
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
  const enhancements = await query(`
    SELECT id, detachmentId, name, basePointsCost as pointsCost, lore, rules, cannotBeWarlord
    FROM enhancement
    WHERE detachmentId IN (${detIds})
    ORDER BY displayOrder
  `);

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

  return detachments.map(det => {
    const restrictions = uniqueKeywords.filter(uk => uk.detachmentId === det.id).map(uk => `UNIQUE: ${String(uk.name).toUpperCase()}`);

    return {
      ...det,
      slug: slugify(String(det.name)),
      rules: rules.filter(r => r.detachmentId === det.id),
      enhancements: enhancements.filter(e => e.detachmentId === det.id).map(e => ({
        ...e,
        pointsCost: Number(e.pointsCost) || 0,
        cannotBeWarlord: !!e.cannotBeWarlord,
      })),
      stratagems: stratagems.filter(s => s.detachmentId === det.id),
      restrictions: restrictions,
    };
  });
};

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
