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
sqlite3 public/40k.sqlite 'SELECT dataVersion FROM metadata;'   # e.g. 946
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
| `datasheet` | 1,155 | `id`, `name`, `lore`, `baseSize`, `maxModelCount`, `unitComposition` (prose), `publicationId`, `isFreeFromEntitlements`, **`isLegends`** |
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
| `wargear_item_profile` | 3,246 | `wargearItemId`, `name`, `type` (ranged/melee), `range`, `attacks`, `ballisticSkill`/`weaponSkill`, `strength`, `armourPenetration`, `damage`, **`hunterProfileKeyword`** (conditional profile — see [Hunter profiles](#conditional-hunter-weapon-profiles)) |
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
- **Publications & FAQ:** `publication` (~70) — most entities carry `publicationId`;
  `faq` / `faq_config` hold errata with text inline. `isCombatPatrol` (24 rows true)
  marks the `Combat Patrol: X` boxed-set books; `combatPatrolName` and `errataDate`
  are optional labels.

### App-runtime tables (not dataset content)

`roster*`, `battle*`, `favourite`, `entitlement`, `roster_validation_state` — the
app user's own saved armies, battle tracker, purchases and favourites. Empty or
near-empty in a fresh extraction; ignore these when reading the *dataset* — but
the `roster*` family is no longer ignored by the app: the Army Builder's Import
modal reads any saved army lists it finds there (see `getSavedDbRosters` /
`getDbRosterDetail` below) so users can pull their companion-app rosters straight
into the builder.

## Sanitizing a database for sharing

`npm run db:sanitize` writes a **copy** with the companion app's user state removed
(saved rosters, battle-tracker rows, favourites, and `entitlement` — the store /
subscription rows), then `VACUUM`s the result. The source database is never
modified; the script refuses to run if input and output are the same path.

```bash
npm run db:sanitize                                   # public/40k.sqlite → public/40k-scrubbed.sqlite
npm run db:sanitize -- ~/db.sqlite                    # any input → ~/db-scrubbed.sqlite alongside it
npm run db:sanitize -- in.sqlite out.sqlite --force   # explicit paths, overwrite existing output
npm run db:sanitize -- --drop-unused                  # also drop tables db.ts never queries
```

`npm run refresh` (Mac only) chains the two: `db:find` re-pulls the companion app's
current `db.sqlite` into `public/40k.sqlite`, then `db:sanitize --force` regenerates
`public/40k-scrubbed.sqlite` over the previous one. Both the source's modification
time and its `metadata.dataVersion` are printed, so a pull that didn't actually
pick up anything new is visible — `db:find` exits 0 when it finds no companion
database, and `refresh` will happily re-scrub the existing (stale) copy in that case.

`battle_size` is gameplay content and is always kept, despite the `battle` prefix.
`--drop-unused` derives its list from `src/utils/db.ts` at runtime (the same diff as
the `comm` recipe under [Unused tables](#unused-tables)), so it tracks coverage
automatically — but it also removes the mission/scoring tables the roadmap wants,
for only a couple of MB, so the default leaves them in place.

Dropping the `roster*` family disables the Army Builder's "import from database"
list; `getSavedDbRosters` probes `sqlite_master` first and returns nothing rather
than erroring. Sanitizing removes *your* data — it does not make Games Workshop's
game data yours to redistribute.

## What Tactical Cognis actually queries

All SQL lives in [`src/utils/db.ts`](./src/utils/db.ts). Coverage today:

| Feature | Tables touched |
|---|---|
| Faction list (`getFactionList`) | `faction_keyword`, `datasheet_faction_keyword`, `detachment_faction_keyword` |
| Units per faction (`getUnitsByFaction`) | `datasheet`, `publication`, `datasheet_faction_keyword`, `miniature`, `miniature_keyword`, `keyword`, `unit_composition(_miniature)`, `datasheet_points_step`, `datasheet_datasheet_ability`, `datasheet_ability`, `datasheet_bodyguard_group(_datasheet/_keyword)`, `wargear_item`, `wargear_item_profile`, `wargear_item_profile_wargear_ability`, `wargear_ability`, `base_miniature_loadout(_wargear_option)`, `wargear_option`, `loadout_choice_set`, `loadout_choice`, `loadout_choice_wargear_item`, `limited_wargear_choice_set`, `limited_wargear_choice`, `limited_wargear_choice_wargear_item`, `wargear_limit` |
| Detachments per faction (`getDetachmentsByFaction`) | `detachment` (+ `detachment_faction_detachment_points_cost` for per-faction DP overrides), `detachment_faction_keyword`, `detachment_rule`, `rule_container_component`, `enhancement` (+ `enhancement_required_keyword_group`, `enhancement_required_keyword`, `enhancement_excluded_keyword`, `enhancement_required_bodyguard_group`, `enhancement_required_bodyguard_datasheet`, `enhancement_required_wargear`), `stratagem`, `detachment_unique_keyword`, `detachment_force_disposition`, `force_disposition` |
| Army Builder game-size limits (`getBattleSizes`) | `battle_size` |
| Allied units + caps (`getAlliedUnitsForFaction`, `getAlliedLimitsForFaction`) | `faction_keyword_allied_faction`, `allied_faction_datasheet`, `allied_faction_required_detachment`, `allied_faction_keyword`, `allied_faction_points_limit`, `battle_size`, `keyword`, `datasheet`, `publication` |
| Conditional keyword grants (`getConditionalKeywordGrants`) | `conditional_keyword`, `datasheet`, `keyword`, `detachment`, `miniature`, `allegiance_ability`, `faction_keyword` — including allegiance- and roster-keyword-gated rows, resolved in the Army Builder once an allegiance is declared |
| Excluded datasheets (`getExcludedDatasheets`) | `detachment_excluded_datasheet`, `faction_keyword_excluded_datasheet`, `detachment`, `datasheet` |
| Keyword restriction groups / 0-1 caps (`getKeywordRestrictionGroups`) | `keyword_restriction_group`, `keyword_restriction_group_keyword`, `restriction_group_detachment_limit`, `keyword`, `faction_keyword`, `detachment`, `miniature` |
| Mandatory/granted Warlord (`getDetachmentWarlordRules`) | `detachment_mandatory_warlord_miniature`, `detachment_granted_warlord_miniature`, `detachment`, `miniature`, `datasheet` |
| Allegiance / sub-faction (`getAllegianceGroups`) | `allegiance_ability_group`, `allegiance_ability`, `detachment`, `conditional_keyword`, `faction_keyword` |
| Army-wide rules (`getArmyRules`) | `army_rule`, `army_rule_faction_keyword`, `rule_container_component` |
| Wargear prose (part of `getUnitsByFaction`) | `wargear_rule` (per-datasheet `rulesText`) |
| Saved-roster import (`getSavedDbRosters`, `getDbRosterDetail`) | `roster`, `roster_detachment`, `roster_unit`, `roster_unit_miniature`, `roster_unit_wargear_option`, `roster_unit_miniature_wargear_option`, `roster_unit_miniature_enhancement`, `roster_unit_allegiance_ability`, `roster_attached_unit(_roster_unit)`, plus joins to `datasheet`, `miniature`, `wargear_option`, `wargear_item`, `enhancement`, `detachment`, `faction_keyword`, `battle_size` |
| Core Rules book (`getCoreRules`) | `publication`, `rule_section`, `rule_container`, `rule_container_component`, `bullet_point` |
| Core-ability hover glossary (`getCoreAbilityGlossary`) | `rule_section`, `rule_container`, `rule_container_component` (scoped to the "24. Core Abilities" chapter) |
| Core Rules FAQ/commentary asides (`getCoreRulesFaqs`) | `faq`, `faq_config` (scoped to `faq.publicationId = 'Core Rules'`, joined on `faq_config.ruleContainerId`) |
| Dashboard stats (`getDbStats`) | `metadata` + row counts of the headline tables |

Meta-factions (umbrella keywords that span several sub-faction keywords) are expanded
in code via `META_FACTION_MAP` in `db.ts`, then widened by following datasheets that
carry both a parent and child faction keyword.

### Unused tables

Regenerate this list anytime with `comm -23 <(sqlite3 public/40k.sqlite '.tables' | tr -s ' ' '\n' | sort) <(grep -oE '\b[a-z_][a-z0-9_]*\b' src/utils/db.ts | sort -u)` —
it diffs every table name in the live schema against every identifier `db.ts`
actually references. As of this writing, 61 of the DB's 145 tables are untouched
(`detachment_force_disposition` and `force_disposition` are now queried — see
[Force dispositions](#force-dispositions-detachment_force_disposition)).
Most are **not** scorekeeping/match-tracking — they're content-integration gaps in
areas the app already partially covers:

- **Missions & live battle tracking** (the one cluster that actually is
  scorekeeping — not wired up, and arguably out of scope for a reference/builder
  app): `mission_pack`, `mission_preset`, `mission_layout(_linked_deployment)`,
  `mission_deployment`, `mission_twist`, `primary_mission(_action/_objective*)`,
  `secondary_mission(_action/_objective*/_restricted_secondary_mission)`,
  `secondary_objective`, `objective`, `force_disposition_mission(_recommended_preset)`, `battle`,
  `battle_player(_detachment/_secondary_mission/_turn*)`.
- **Enhancement eligibility edge cases** (which units/detachments can take which
  enhancement, beyond what `getDetachmentsByFaction` already resolves):
  `enhancement_bodyguard_group(_datasheet/_keyword)`, `enhancement_datasheet_ability`,
  `enhancement_keyword_points_cost`, `enhancement_required_keyword_group_faction_keyword`,
  `enhancement_required_wargear_item`, `enhancement_wargear_item_profile`.
- **Allied-faction edge cases** beyond what `getAlliedUnitsForFaction`/`getAlliedLimitsForFaction`
  cover: the `allied_faction` base table itself (only its child join tables are
  queried — `canTakeEnhancements`/`requiredWarlordMiniatureId`/`isSiblingFaction`
  aren't surfaced), `allied_faction_allegiance_ability`,
  `allied_faction_allowed_warlord_miniature`,
  `allied_faction_keyword_slotless_keyword_group(_donor_keyword/_receiver_keyword)`,
  `allied_faction_parent_faction_keyword`.
- **Detachment/wargear flavor & structure**: `detachment_detail(_bullet_point)`
  (the companion app's "why take this detachment" bullet list),
  `detachment_linked_datasheet`, `detachment_required_datasheet`, `wargear_option_group`,
  `all_model_wargear_choice(_set/_wargear_item)`, `datasheet_sub_ability`.
- **Narrow legality edge cases**: `keyword_ally_restricting_keyword`,
  `faction_keyword_mandatory_allegiance_ability`,
  `army_rule_excluded_from_command_bunker_faction_keyword`, `behaviour_type`
  (datasheet movement behaviors like Fly/Deep Strike), `stratagem_phase` (which
  phases a stratagem can be used in — not currently surfaced in `FactionBrowser`).
- **Roster sub-detail**: `roster_unit_enhancement`, `roster_validation_state` (the
  `roster*` family is otherwise integrated — see the roster-import row above).
- **App/user-state** (not gameplay content at all — companion-app account state):
  `favourite`, `entitlement`, `grdb_migrations`.

All candidates for future features — see [TODO.md](./TODO.md) for the integration
roadmap and log.

**Schema versions vary between companion-app releases.** Example: in newer DBs
`wargear_limit` carries `datasheetId`/`wargearItemId`/`limitCount`/`ratioModelCount`;
in older ones it's keyed by `limitedWargearChoiceSetId` with `modelCount`/`choiceLimit`
columns instead. `db.ts` probes the live schema with `PRAGMA table_info` before
querying version-sensitive tables and degrades gracefully (skips the feature) on a
mismatch rather than failing the load.

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

## 11th edition / Legends (data version ~946)

`Codex: Orks` is the first 11th-edition book in the dataset, and it introduced
schema and content the earlier 10th-edition data never exercised.

**`datasheet.isLegends`** (BOOLEAN, default 0) — new column. Marks a
[Warhammer Legends](https://www.warhammer-community.com/warhammer-legends/)
datasheet: still playable in open and narrative games, but **not legal in matched
play**. As of v946 exactly **12 rows** are flagged, all belonging to a single
`Legends: <faction>` publication. Every other publication is `isLegends = 0`.
(Run the query below against your own database to see which datasheets those are.)

These datasheets carry the normal `ORKS` faction keyword and real costed
`unit_composition` rows, so **they are indistinguishable from codex units unless
you read the flag** — they will otherwise pad the faction list, the Army Builder
catalogue and the points-efficiency matrix. Tactical Cognis hides them by default
behind an "Include Legends" toggle and raises a roster validation error if one is
present (see `src/utils/dataMapper.ts` and `src/components/ArmyBuilder.tsx`).

```sql
SELECT p.name, count(*) FROM datasheet d
JOIN publication p ON p.id = d.publicationId
WHERE d.isLegends = 1 GROUP BY p.name;
```

The `Legends: <faction>` publication also carries two `rule_section` rows explaining
the Legends system and proxying rules; they are picked up by the Core Rules view like
any other rule section.

### Conditional "Hunter" weapon profiles

**`wargear_item_profile.hunterProfileKeyword`** (TEXT, nullable) — new column, and
a genuinely new *mechanic* rather than just new content.

A weapon with this set has two mutually exclusive statlines: a `Hunter` profile
that applies **only** against targets carrying the listed keywords, and a
`Standard` profile used against everything else. This is unlike an ordinary
multi-profile weapon (a combi-weapon, say), where every profile is simultaneously
available — so **summing all of a weapon's profiles is wrong here** and roughly
doubles its output.

As of v946 there are **6 such profiles across 5 weapons**, confined to one codex,
and every one stores the same value: `**MONSTER/VEHICLE**`. In each case the weapon
carries exactly two profiles — one named `Hunter` (gated) and one named `Standard`
(ungated) — with the Hunter line the stronger of the two against qualifying
targets. Use the query below to inspect the actual statlines in your own database.

**Value format:** emphasised, slash-separated prose — `**` is markdown emphasis to
be stripped, and `/` means **OR**. `src/utils/db.ts` exports `parseHunterKeywords()`
which normalises `**MONSTER/VEHICLE**` to `['MONSTER', 'VEHICLE']` onto
`WeaponProfile.hunterKeywords`; an ordinary profile gets `[]`.

There is **no rules text** anywhere in the DB explaining the mechanic — it is
expressed purely structurally by this column, so a consumer that ignores the
column has no other signal that the profile is conditional.

Selection logic lives in `src/utils/mathhammer.ts` (pure, unit-tested):

```ts
profileAppliesToTarget(profile, targetKeywords)   // may this profile be used?
selectProfilesForTarget(weapon.profiles, target.keywords)  // which to actually fire
```

`selectProfilesForTarget` returns the Hunter profile alone against a matching
target, the unconditional profile(s) otherwise, and every profile unchanged for
weapons that have no Hunter profile.

```sql
SELECT wi.name, wip.name, wip.strength, wip.armourPenetration, wip.damage, wip.hunterProfileKeyword
FROM wargear_item_profile wip JOIN wargear_item wi ON wi.id = wip.wargearItemId
WHERE wip.hunterProfileKeyword IS NOT NULL AND wip.hunterProfileKeyword <> '';
```

### Force dispositions (`detachment_force_disposition`)

A **force disposition** is the posture an army deploys under. Crossed with the
*opponent's* disposition it selects the primary mission you play, via
`force_disposition_mission` (`friendlyForceDispositionId` × `oppositionForceDispositionId`
→ `primaryMissionId`). There are 5 dispositions, so that table holds all 5×5 = 25
pairings, and `force_disposition_mission_recommended_preset` adds 75 recommended
mission presets on top.

| Table | Rows | Purpose |
| --- | --- | --- |
| `force_disposition` | 5 | The five deployment postures (names live in your own database) |
| `detachment_force_disposition` | 295 | Which disposition(s) a detachment may deploy under |
| `force_disposition_mission` | 25 | (friendly × opposition) → primary mission |
| `force_disposition_mission_recommended_preset` | 75 | Recommended mission presets per pairing |

The companion app records the player's pick on `roster.forceDispositionId` and
`battle_player.forceDispositionId`.

**The case worth handling:** a detachment usually maps to exactly one disposition,
but *may offer several for the player to choose between*. As of v946, of 294
detachments **293 offer exactly one and none offer zero** — a single detachment
(introduced in the 11th-edition codex) offers a choice between two. That choice is a
real strategic decision: it swaps the entire row of primary missions the army can
end up playing, so it cannot be modelled as a single value.

```sql
-- detachments that offer a CHOICE of disposition
SELECT det.name, group_concat(fd.name, ' / ')
FROM detachment_force_disposition dfd
JOIN detachment det ON det.id = dfd.detachmentId
JOIN force_disposition fd ON fd.id = dfd.forceDispositionId
GROUP BY dfd.detachmentId HAVING count(*) > 1;
```

Tactical Cognis surfaces the disposition on each detachment (`MergedDetachment.forceDispositions`);
the Army Builder shows a single disposition read-only, renders a selector when a
detachment offers more than one, persists the pick per detachment id on the saved
roster (`ArmyList.selectedForceDispositionIds`), and raises a validation error while
the choice is outstanding. The query is `try/catch`-guarded, so a database without
the table degrades to no dispositions rather than failing the detachment load.

**Other 11th-edition additions worth knowing:**

- `behaviour_type` gained **Surge Move** and **Ingress Move**; the new
  `army_rule_behaviour_type` join table links army rules to movement/shooting/
  fighting behaviours (2 rows, both under "Special Move Types").
- Core Rules gained *"21. Flying and Surging"* and a *"Universal Rules Updates"*
  section.
- The 11th-edition codex adds a new faction-wide `army_rule` row and 16 detachments,
  one of which is its Combat Patrol detachment.

**Data-shape caveat:** `Codex: Orks` datasheets almost entirely lack `lore` — 1 of
67 Ork rows is populated, versus ~90% (974/1,088) everywhere else. 11 of the 54
`Codex: Orks` datasheets also have no `baseSize`. Render these as optional.

### Handling schema drift

Companion-app releases add columns, and users upload databases of varying age. Any
column added by a newer release must be probed before it is selected, or one
missing column fails the whole load. `src/utils/db.ts` exports a cached
`hasColumn(table, column)` helper for this:

```ts
const legendsCol = (await hasColumn('datasheet', 'isLegends'))
  ? 'd.isLegends'
  : '0 AS isLegends';
```

Combat Patrol detection follows the same shape, falling back to the
`Combat Patrol: X` publication-name heuristic when `publication.isCombatPatrol`
is absent.

## Comparing data versions

Each extraction is a complete self-contained DB, so diffing two versions is easy:

```bash
for db in 40k.old.sqlite 40k.new.sqlite; do
  echo "== $db =="; sqlite3 "$db" "SELECT 'datasheets',count(*) FROM datasheet
    UNION ALL SELECT 'stratagems',count(*) FROM stratagem
    UNION ALL SELECT 'enhancements',count(*) FROM enhancement;"
done
```
