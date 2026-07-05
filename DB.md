# 🗄️ The `40k.sqlite` Database — Schema Reference

Tactical Cognis runs entirely off a SQLite database extracted from the official
**Warhammer 40,000 companion app** (the app's own local data store). This document
describes the **structure** of that database — engine, conventions, table graph, and
which tables this app queries — so you can understand, verify, or extend the queries
in [`src/utils/db.ts`](./src/utils/db.ts).

> **What this file deliberately is not:** a copy of any database *contents*. Table and
> column names here are the functional structure of the app's store; the data inside
> (unit names, statlines, points, rules text, lore) is Games Workshop's IP and is never
> committed to this repo or shipped in its builds. See the hard rule in
> [`CLAUDE.md`](./CLAUDE.md). Example queries below use placeholder strings — substitute
> real values from your own extracted database.

## Getting a database

See the [README](./README.md#getting-a-database): `npm run db:find` (Mac), the manual
steps in [`manual-db-sqlite.md`](./manual-db-sqlite.md), or the in-browser upload
prompt. The file lives at `public/40k.sqlite` locally and is gitignored.

## Engine & metadata

- **GRDB / SQLite.** A plain SQLite file — open it with anything (`sqlite3`, DB Browser,
  Python's `sqlite3`).
- `metadata` — single row, single column `dataVersion` (an integer that increments with
  app data updates; the app surfaces it in the dashboard).
- `grdb_migrations` — GRDB's applied-migration ledger (schema version history).
- **145 tables, ~398 indexes, ~23 triggers** (stable across recent data versions).
- A copy extracted with `sqlite3 ... ".backup"` is fully checkpointed — no `-wal`/`-shm`
  sidecar files.

```bash
sqlite3 public/40k.sqlite 'SELECT dataVersion FROM metadata;'   # e.g. 886
sqlite3 public/40k.sqlite '.tables'                             # list all tables
sqlite3 public/40k.sqlite '.schema datasheet'                   # one table's DDL
```

## Conventions

- **Single locale, prose inlined.** This is the English store: human-readable text sits
  directly on rows as plain columns (`datasheet.name`, `datasheet_ability.rules`/`lore`,
  `stratagem.whenRules`/`targetRules`/`effectRules`/`restrictionRules`,
  `enhancement.rules`, …). Rules text may contain inline HTML (`<b>…</b>`).
- **Statlines live on `miniature`** as columns: `movement`, `toughness`, `save`,
  `wounds`, `leadership`, `objectiveControl` (a datasheet can have several miniatures,
  e.g. a leader model plus troopers).
- **Primary keys:** every entity table has `id` (UUID stored as `TEXT`).
- **Foreign keys:** a `somethingId` column references `something(id)` — `datasheetId` →
  `datasheet`, `miniatureId` → `miniature`, `publicationId` → `publication`, etc. Real
  FK constraints exist (`REFERENCES … ON DELETE …`) and most FK columns are indexed.
- **Join tables:** `a_b` (sometimes `a_b_c`) is a many-to-many link with a composite PK
  of the two FKs, usually plus `displayOrder` (e.g. `datasheet_datasheet_ability`,
  `miniature_keyword`, `datasheet_faction_keyword`).
- **Stat values are `TEXT`, not numbers** — they hold game notation: `"6+"`, `"D6"`,
  `"D6+1"`, `"-"`, and movement includes the inch mark (`'6"'`). Cast only when you know
  a column is clean. True integers exist where values are always numeric:
  `unit_composition.points`, `enhancement.basePointsCost`,
  `detachment.detachmentPointsCost`. Note `stratagem.cpCost` is `TEXT`.
- **Booleans** are `0`/`1` (`isDefault`, `isPsychic`, `isAura`, `isCombatPatrol`,
  `statlineHidden`, …).
- **Ordering:** respect `displayOrder` to reproduce the app's presentation order.

## Table map

Approximate row counts from data version 886 — they drift slowly between versions but
the shape doesn't.

### Datasheets & models — the unit core

| Table | ~Rows | Key columns / links |
|---|---|---|
| `datasheet` | 1,142 | `id`, `name`, `lore`, `baseSize`, `maxModelCount`, `unitComposition` (prose), `publicationId`, `isFreeFromEntitlements` |
| `miniature` | 1,569 | statline columns, `datasheetId`, `statlineHidden`, `isSupremeCommander`, `cannotBeWarlord`, `miniatureSlots` |
| `unit_composition` | 1,516 | `datasheetId`, **`points` (INTEGER)**, `isDefault` — one row per legal size/price tier |
| `unit_composition_miniature` | — | which miniatures (`min`/`max` of each) fill each tier |
| `datasheet_points_step` | — | `datasheetId`, `stepAt` (model count), `stepPoints` — stepped pricing for block-sold units |
| `datasheet_damage` | — | bracketed "damaged" statlines for vehicles/monsters |
| `invulnerable_save` | — | `datasheetId`/`miniatureId`, `save`/`meleeSave`/`rangedSave`, `rules` |
| `miniature_keyword` ↔ `keyword` (1,239) | — | per-model keywords |
| `datasheet_faction_keyword` ↔ `faction_keyword` (43) | — | faction keywords a datasheet carries — the practical "what army is this?" link |

### Wargear & loadouts

| Table | ~Rows | Key columns / links |
|---|---|---|
| `wargear_item` | 3,516 | `name`, `wargearType`, `ruleText` — names repeat; items are per-datasheet instances |
| `wargear_item_profile` | 3,712 | `wargearItemId`, `name`, `type` (ranged/melee), `range`, `attacks`, `ballisticSkill`/`weaponSkill`, `strength`, `armourPenetration`, `damage` |
| `wargear_ability` + `wargear_item_profile_wargear_ability` | — | weapon special rules and their links to profiles |
| `base_miniature_loadout` / `base_miniature_loadout_wargear_option` | — | baseline gear each miniature starts with |
| `loadout_choice_set` → `loadout_choice` → `loadout_choice_wargear_item` | — | default loadout + swap options (`limit`, `alternate`) |
| `wargear_option` / `wargear_option_group` | — | optional upgrades (`points`, `wargearItemId`) and grouping |
| `wargear_limit`, `limited_wargear_choice*`, `all_model_wargear_choice*`, `wargear_rule` | — | "X per N models" caps, one-per-unit constraints, conditional rules text |

### Abilities & rules

| Table | ~Rows | Key columns / links |
|---|---|---|
| `datasheet_ability` + `datasheet_datasheet_ability` | 2,025 | `name`, `abilityType` (`core`/`faction`/`datasheet`), `rules`, `isPsychic`/`isAura`, `armyRuleId`, `detachmentRuleId`; the link table carries `restriction` |
| `datasheet_sub_ability`, `datasheet_rule` | — | nested sub-abilities / per-datasheet rules |
| `army_rule` + `army_rule_faction_keyword` | — | faction-wide rules, keyword-gated |
| `allegiance_ability` / `allegiance_ability_group` | — | chapter/legion-style allegiance abilities |
| `rule_container` / `rule_container_component` | — | generic structured rules-text blocks (`title`, `textContent`, `detachmentRuleId`, …) the app renders |
| `behaviour_type`, `conditional_keyword` | — | rule-engine metadata and conditional keyword grants |

### Detachments, enhancements & stratagems

| Table | ~Rows | Key columns / links |
|---|---|---|
| `detachment` | 290 | `name`, **`detachmentPointsCost` (INTEGER)** — the base DP cost (1–3), `isCombatPatrol`, `publicationId` |
| `detachment_faction_detachment_points_cost` | ~4 | per-faction DP-cost **overrides**: `(detachmentId, factionKeywordId)` composite PK + `detachmentPointsCost`. When a detachment costs different DP for a specific faction, the override wins — `COALESCE(override, base)` |
| `detachment_rule` | — | `name`, `detachmentId`; rule text hangs off `rule_container_component.detachmentRuleId` |
| `detachment_faction_keyword` | — | which faction(s) a detachment belongs to |
| `detachment_unique_keyword` | — | keyword uniqueness restrictions within the detachment |
| `detachment_detail*`, `detachment_force_disposition`, `detachment_*_datasheet`, `detachment_*_warlord_miniature` | — | flavour bullets, force-disposition link, composition/warlord gating |
| `enhancement` | 957 | `name`, `rules`, `basePointsCost` (INTEGER), `detachmentId`, `enhancementType`, `cannotBeWarlord` |
| `enhancement_*` (keyword groups, bodyguard groups, required wargear) | — | which units may take each enhancement |
| `stratagem` | 1,432 | `name`, `cpCost` (TEXT), `category` (`battleTactic`/`epicDeed`/`strategicPloy`/…), `whenRules`/`targetRules`/`effectRules`/`restrictionRules`, `key`, `detachmentId` |
| `stratagem_phase` | — | phases each stratagem can fire in |

### Leader / bodyguard attachments

| Table | Key columns / links |
|---|---|
| `datasheet_bodyguard_group` | `datasheetId` (the **leader**), `factionKeywordId`, `requiredDetachmentId`, `excludedDetachmentId` |
| `datasheet_bodyguard_group_datasheet` | `datasheetBodyguardGroupId`, `datasheetId` (a **bodyguard** unit the leader may join) |
| `datasheet_bodyguard_group_keyword` | keyword-based bodyguard gating |

### Keywords, allies, missions, publications

- **Keywords:** `keyword` (~1,239), `faction_keyword` (~43), `conditional_keyword`,
  `keyword_restriction_group*`.
- **Allies:** `allied_faction` + a dozen `allied_faction_*` link tables (who can ally,
  contributed datasheets/keywords/warlords, points limits).
- **Missions** (not datasheet-linked): `primary_mission` (~49) →
  `primary_mission_objective` → `primary_mission_objective_scoring` (`victoryPoints`,
  `isCumulative`); `secondary_mission*` mirrors it; plus `force_disposition*`,
  `mission_pack`, `mission_layout*`, `mission_deployment`, `mission_twist`,
  `mission_preset`.
- **Game sizes**: `battle_size` (3 rows) — `name`, `pointsLimit`, and the army
  construction limits for that size: `detachmentPointsLimit`, `enhancementLimit`,
  `duplicateUnitLimit`. The authoritative source for "how many detachment points /
  enhancements / duplicate datasheets at this game size".
- **Publications & FAQ:** `publication` (~69) — most entities carry `publicationId`;
  `faq` / `faq_config` hold errata with text inline.

### App-runtime tables (not dataset content)

`roster*`, `battle*`, `favourite`, `entitlement`, `roster_validation_state` — the
app user's own saved armies, battle tracker, purchases and favourites. Empty or
near-empty in a fresh extraction; **ignore these when reading the dataset.**

## What Tactical Cognis actually queries

All SQL lives in [`src/utils/db.ts`](./src/utils/db.ts). Coverage today:

| Feature | Tables touched |
|---|---|
| Faction list (`getFactionList`) | `faction_keyword`, `datasheet_faction_keyword`, `detachment_faction_keyword` |
| Units per faction (`getUnitsByFaction`) | `datasheet`, `publication`, `datasheet_faction_keyword`, `miniature`, `miniature_keyword`, `keyword`, `unit_composition(_miniature)`, `datasheet_points_step`, `datasheet_datasheet_ability`, `datasheet_ability`, `datasheet_bodyguard_group(_datasheet/_keyword)`, `wargear_item`, `wargear_item_profile`, `wargear_item_profile_wargear_ability`, `wargear_ability`, `base_miniature_loadout(_wargear_option)`, `wargear_option`, `loadout_choice_set`, `loadout_choice`, `loadout_choice_wargear_item`, `limited_wargear_choice_set`, `limited_wargear_choice`, `limited_wargear_choice_wargear_item`, `wargear_limit` |
| Detachments per faction (`getDetachmentsByFaction`) | `detachment` (+ `detachment_faction_detachment_points_cost` for per-faction DP overrides), `detachment_faction_keyword`, `detachment_rule`, `rule_container_component`, `enhancement`, `stratagem`, `detachment_unique_keyword` |
| Army Builder game-size limits (`getBattleSizes`) | `battle_size` |
| Dashboard stats (`getDbStats`) | `metadata` + row counts of the headline tables |

Meta-factions (umbrella keywords that span several sub-faction keywords) are expanded
in code via `META_FACTION_MAP` in `db.ts`, then widened by following datasheets that
carry both a parent and child faction keyword.

Notably **unused so far**: the missions family (other than `battle_size`), `allied_faction*`, and `faq`. All
candidates for future features — see [`TODO.md`](./TODO.md) for the integration
assessment of each. (`invulnerable_save`, `datasheet_damage`, `loadout_choice*` swap options, and `wargear_limit*` are now queried and integrated inside `getUnitsByFaction` and the Army Builder rosters/validations.)

## Useful query shapes

Substitute the placeholder strings with names from your own database.

**Full statline for a datasheet** (several rows if the unit has multiple model types):

```sql
SELECT d.name, m.name AS model,
       m.movement AS M, m.toughness AS T, m.save AS Sv,
       m.wounds AS W, m.leadership AS Ld, m.objectiveControl AS OC
FROM datasheet d
JOIN miniature m ON m.datasheetId = d.id
WHERE d.name = '<unit name>'
ORDER BY m.displayOrder;
```

**Points — every legal size tier:**

```sql
SELECT d.name, uc.points, uc.isDefault
FROM datasheet d
JOIN unit_composition uc ON uc.datasheetId = d.id
WHERE d.name = '<unit name>'
ORDER BY uc.displayOrder;
-- Block-priced units: see datasheet_points_step (stepAt = model count, stepPoints = price).
```

**Weapon profiles (multi-profile weapons return several rows):**

```sql
SELECT wi.name AS weapon, p.name AS profile, p.type,
       p.range, p.attacks AS A, p.ballisticSkill AS BS, p.weaponSkill AS WS,
       p.strength AS S, p.armourPenetration AS AP, p.damage AS D
FROM wargear_item wi
JOIN wargear_item_profile p ON p.wargearItemId = wi.id
WHERE wi.name = '<weapon name>';
```

**Every datasheet in a faction** (via faction keyword):

```sql
SELECT d.name
FROM datasheet d
JOIN datasheet_faction_keyword dfk ON dfk.datasheetId = d.id
JOIN faction_keyword fk            ON fk.id = dfk.factionKeywordId
WHERE fk.name = '<faction keyword>'
ORDER BY d.name;
```

**A detachment's stratagems and enhancements:**

```sql
SELECT 'stratagem' AS kind, s.name, s.cpCost AS cost, s.category
FROM stratagem s JOIN detachment det ON det.id = s.detachmentId
WHERE det.name = '<detachment name>'
UNION ALL
SELECT 'enhancement', e.name, CAST(e.basePointsCost AS TEXT), e.enhancementType
FROM enhancement e JOIN detachment det ON det.id = e.detachmentId
WHERE det.name = '<detachment name>'
ORDER BY kind, name;
```

**Which units a leader can attach to:**

```sql
SELECT lead.name AS leader, bg.name AS bodyguard
FROM datasheet_bodyguard_group g
JOIN datasheet lead ON lead.id = g.datasheetId
JOIN datasheet_bodyguard_group_datasheet bgd ON bgd.datasheetBodyguardGroupId = g.id
JOIN datasheet bg ON bg.id = bgd.datasheetId
ORDER BY leader, bodyguard;
```

## Comparing data versions

Each extraction is a complete self-contained DB, so diffing two versions is easy:

```bash
for db in 40k.old.sqlite 40k.new.sqlite; do
  echo "== $db =="; sqlite3 "$db" "SELECT 'datasheets',count(*) FROM datasheet
    UNION ALL SELECT 'stratagems',count(*) FROM stratagem
    UNION ALL SELECT 'enhancements',count(*) FROM enhancement;"
done
```
