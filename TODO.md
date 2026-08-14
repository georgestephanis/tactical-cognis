# TODO — Database Integrations Roadmap & Log

This is the single source for leveraging the companion-app SQLite schema: what's
still worth building, and what's already integrated. It absorbed the old
`UNUSED-DATA.md` audit — the authoritative list of which tables the app actually
reads now lives in the coverage table in [DB.md](./DB.md).

---

## Remaining roadmap

### 1. Missions & Scoring Tracker (Gameplay Battle Mode)
**Effort: Large | Payoff: Very High**
* **Tables:** `primary_mission`, `secondary_mission`, `mission_preset`, `mission_layout`, `mission_twist`, `objective`, `force_disposition`
* **Objective:** A "Battle Mode" tab for live gameplay score tracking.
* **Scope:**
  - Tournament mission generator (Primary Mission + Deployment Map layout + Twist).
  - Secondary objective selection/drawing (Tactical vs. Fixed cards).
  - Interactive turn-by-turn Victory Point (VP) tracker during a match.

### Content-integration gaps — priority matrix

Everything below is content-integration debt, not the missions/scoring cluster
above — see [DB.md](./DB.md)'s "Unused tables" section for how these were found
and grouped. Row counts are from the local companion-app export and are the main
signal behind each Payoff rating: a table with 0-2 live rows has nothing to show
even once wired up, no matter how sound the schema link is.

| # | Item | Payoff | Effort | Live rows |
|---|------|--------|--------|-----------|
| 2 | Enhancement legality gaps | High | Small | 650 + 21 |
| 3 | Stratagem phase tags | Medium-High | Small | 2,016 |
| 4 | Detachment "why take this" bullets | Medium | Small | 55 / 64 |
| 5 | Detachment linked/bundled datasheets | Medium-High | Small–Medium | 107 |
| 6 | Datasheet sub-abilities | Medium | Medium | 52 |
| 7 | Allied-faction slot/parent-keyword edge cases | Medium | Medium | 25 + 42 |
| 8 | All-model wargear "apply to whole unit" shortcut | Medium | Medium-Large | 65 / 29 / 71 |
| 9 | `wargear_option_group` instruction text | Unknown — needs a scoping spike | ? | 3,037 |
| — | Near-empty tables (defer) | Low | — | 0–2 each |

#### 2. Enhancement legality gaps
**Effort: Small | Payoff: High**
* **Tables:** `enhancement_required_keyword_group_faction_keyword` (650 rows), `enhancement_bodyguard_group` + `enhancement_bodyguard_group_datasheet` (21 rows each)
* **Objective:** Close a real roster-legality hole — some enhancements are scoped to a specific faction sub-keyword or restricted to a named "bodyguard" datasheet, and the builder currently doesn't check either.
* **Scope:** Extend the existing enhancement-eligibility resolver (which already handles `enhancement_required_keyword_group`/`_keyword`, see Completed below) with these two additional gates. Same shape as work already done — lowest-risk, highest-value item on this list.

#### 3. Stratagem phase tags
**Effort: Small | Payoff: Medium-High**
* **Tables:** `stratagem_phase` (2,016 rows — full coverage, every stratagem)
* **Objective:** Show which phase(s) a stratagem can be used in (e.g. "Fight phase") as a badge in **Faction Browser**'s stratagem list.
* **Scope:** One join query, one badge/tag added to the existing stratagem card render. Pure display, no legality logic.

#### 4. Detachment "why take this" bullets
**Effort: Small | Payoff: Medium**
* **Tables:** `detachment_detail` (55 rows), `detachment_detail_bullet_point` (64 rows)
* **Objective:** Surface the companion app's short "why take this detachment" bullet list in the detachment picker — flavor/decision-support content, same shape as the Core Rules `bullets` handling just added.
* **Scope:** Query + render as a small bullet list under each detachment in **Faction Browser**.

#### 5. Detachment linked/bundled datasheets
**Effort: Small–Medium | Payoff: Medium-High**
* **Tables:** `detachment_linked_datasheet` (107 rows — `count`, `isWarlord` columns)
* **Objective:** Some detachments come bundled with a specific unit (sometimes as Warlord). Currently invisible to roster validation.
* **Scope:** Display-only pass first (show the linked unit(s) on the detachment card) is a quick win; validating/auto-including them in the builder is a follow-up once the display step confirms the data reads cleanly. `detachment_required_datasheet` (0 rows locally) rides along for free if wired the same way, but has nothing to show yet.

#### 6. Datasheet sub-abilities
**Effort: Medium | Payoff: Medium**
* **Tables:** `datasheet_sub_ability` (52 rows, `name`/`rules` nested under a `datasheet_ability`)
* **Objective:** Some abilities currently rendered in **Unit Details**/**Faction Browser** may be missing nested sub-effects that live in this table.
* **Scope:** Fetch alongside `datasheet_ability` and nest under the parent ability wherever it's already rendered — touches a few render sites, so more integration surface than items 2-4.

#### 7. Allied-faction slot/parent-keyword edge cases
**Effort: Medium | Payoff: Medium**
* **Tables:** `allied_faction_parent_faction_keyword` (25 rows), `allied_faction_keyword_slotless_keyword_group` + `_donor_keyword` + `_receiver_keyword` (12/18/12 rows)
* **Objective:** Narrow but real ally-legality edge cases — e.g. an allied unit counting toward a battlefield-role slot "for free," or a meta-faction parent-keyword resolution the current allied logic doesn't cover.
* **Scope:** Extend `getAlliedUnitsForFaction`/`getAlliedLimitsForFaction` carefully — needs testing against existing ally rosters to avoid regressing what's already working.

#### 8. All-model wargear "apply to whole unit" shortcut
**Effort: Medium-Large | Payoff: Medium**
* **Tables:** `all_model_wargear_choice` (65 rows), `all_model_wargear_choice_set` (29 rows), `all_model_wargear_choice_wargear_item` (71 rows)
* **Objective:** A UX convenience — "give this loadout to every model in the unit" instead of setting each model's wargear individually.
* **Scope:** New UI affordance in the Army Builder wargear picker, parallel to (not replacing) the existing `loadout_choice*`/`wargear_limit*` system. Real payoff for large-squad UX, but needs new interaction design, not just a data join.

#### 9. `wargear_option_group` instruction text — needs scoping first
**Effort: Unknown | Payoff: Unknown**
* **Tables:** `wargear_option_group` (3,037 rows — the single largest unused table)
* **Objective:** Unclear yet whether this is the authoritative source for wargear-picker instruction text (e.g. "Choose one of the following") that isn't currently shown, or a legacy/parallel structure already superseded by the integrated `loadout_choice*`/`wargear_limit*` system.
* **Scope:** Before committing effort — diff a few `datasheetId`s against what the builder already resolves via `loadout_choice*` to see whether this table adds new information or just duplicates it.

### Near-empty tables (defer)
0-2 live rows locally — nothing to show even if wired up. Revisit only if a future
companion-app data update populates them:
`enhancement_keyword_points_cost`, `enhancement_required_wargear_item` (1 row),
`enhancement_wargear_item_profile` (2 rows), `enhancement_bodyguard_group_keyword`,
`allied_faction_allegiance_ability`, `allied_faction_allowed_warlord_miniature`,
`detachment_required_datasheet`, `keyword_ally_restricting_keyword`,
`faction_keyword_mandatory_allegiance_ability`, `roster_unit_enhancement`.

### Not prioritized — app state, not gameplay content
`favourite`, `entitlement`, `grdb_migrations` — companion-app account state, no
relevance to a reference/builder tool. `roster_validation_state` (4 rows) and
`behaviour_type` (19 rows, structured movement-behavior fields like
`maximumDistance`/`setupDistance`) are speculative/niche rather than clearly
valuable — worth another look if a concrete use case comes up, not roadmapped now.

---

## Completed Database Integrations

### Core Rules reference page
* **`publication` / `rule_section` / `rule_container` / `rule_container_component` / `bullet_point`** ✅ Full Core Rules book extracted and rendered as a browsable, printable page (`getCoreRules`), including proper list rendering for `bullets`-type components via `bullet_point`.
* **`rule_section`/`rule_container`/`rule_container_component` (scoped to "24. Core Abilities")** ✅ Hover-glossary definitions for bracketed keywords like `[DEVASTATING WOUNDS]`, referenced anywhere `<k>` markup appears app-wide (`getCoreAbilityGlossary`).
* **`faq` & `faq_config`** ✅ Rules commentary/errata surfaced as collapsible asides on the Core Rules page, scoped to `faq.publicationId = 'Core Rules'` joined via `faq_config.ruleContainerId` (`getCoreRulesFaqs`). Datasheet/stratagem-scoped FAQ rows (same `faq` table, different `faq_config` join columns) are still unqueried — a candidate for a future Unit Details/Roster Validation pass.

### List-legality & allegiance (from the `UNUSED-DATA.md` audit)
* **`detachment_excluded_datasheet` / `faction_keyword_excluded_datasheet`** ✅ Units barred from a detachment or the whole faction are flagged in roster validation (`getExcludedDatasheets`).
* **`keyword_restriction_group*` & `restriction_group_detachment_limit`** ✅ "0-1 X"-style caps validated, honoring per-detachment min/max overrides, a Warlord gate, and a declared sub-faction keyword that lifts the cap (`getKeywordRestrictionGroups`).
* **`detachment_mandatory_warlord_miniature` / `detachment_granted_warlord_miniature`** ✅ Detachment-scoped mandatory Warlords drive auto-Warlord assignment and validation, reconciled with the intrinsic *Supreme Commander* rule — the DB records are authoritative for Primarch/Ghazghkull-style rules (`getDetachmentWarlordRules`).
* **`allegiance_ability*` — sub-faction / allegiance system** ✅ An allegiance selector (Marks of Chaos, Daemonic Allegiance, declarable Chapters) with mandatory/min/max enforcement, persisted with the roster and carried through DB import (`getAllegianceGroups`).
* **`conditional_keyword` (allegiance / roster-keyword gates)** ✅ The previously-skipped 307 allegiance- and roster-faction-keyword-gated grant rows now resolve once an allegiance is declared (`getConditionalKeywordGrants` + `applyKeywordGrants`).
* **`army_rule` + `army_rule_faction_keyword`** ✅ Army-wide rules (Oath of Moment, Acts of Faith) displayed with prose from `rule_container_component` (`getArmyRules`). Display-only; `army_rule_behaviour_type` metadata intentionally skipped.
* **`wargear_rule`** ✅ Official "you may replace X with Y" wargear prose (`rulesText`) surfaced in the Army Builder wargear picker and Unit Details.
* **`detachment_unique_keyword`** ✅ Keyword-uniqueness restrictions within a detachment queried and applied.

### Earlier integrations
* **`invulnerable_save`** ✅ Joined and rendered in UnitDetails.
* **`datasheet_damage`** ✅ Damaged-vehicle brackets parsed and rendered.
* **`loadout_choice*` & `wargear_limit*`** ✅ Custom wargear swaps and squad limits mapped and validated in the builder. (`wargear_limit` is schema-probed via `PRAGMA table_info` — older DB versions without `datasheetId` skip limits gracefully.)
* **`allied_faction*`** ✅ Allies in ArmyBuilder: "Allies" catalog category via `getAlliedUnitsForFaction`, detachment gating via `allied_faction_required_detachment`, and points caps validated via `getAlliedLimitsForFaction`.
* **`roster*`** ✅ Saved-roster import: the Import modal lists army lists found in the uploaded companion-app DB (`getSavedDbRosters`/`getDbRosterDetail`) and imports them with exact units, model counts, wargear, enhancements, warlord, declared allegiance, allies, and leader attachments.
* **`enhancement` schema columns & `enhancement_*` constraints** ✅ Mapped `isIncludedInEnhancementLimit`, `isEquipableByNonCharacterUnit`, `duplicateLimit` columns along with keyword and wargear constraint tables to validate enhancement eligibility.
* **`datasheet_points_step`** ✅ Mapped stepped pricing for duplicate units (e.g. Stompa, Big Mek Dakkarig) to dynamically adjust point costs.
* **`Supreme Commander` & `isWarlord`** ✅ Automatic warlord enforcement for units possessing the Supreme Commander ability (now complemented by DB-driven mandatory-warlord records — see above).
* **`Attached Unit` grouping** ✅ Text-import boundary parsing of Attached Unit blocks, automatically grouping characters and bodyguard squads on list load.
* **`Interactive resolution`** ✅ Modal resolver for unresolved catalog units and enhancements during text list imports, with candidate sorting based on name-length proximity.
* **`Wargear Layout Logic`** ✅ Contextual selection elements (standalone checkboxes, dropdown selectors, multi-select checkboxes, and adjusters) determined automatically from SQLite limits and duplicate/exclusivity rules.
* **`Print Page Breaks`** ✅ Print-preview page-break utilities to divide tabular roster and profile summary sheets across separate pages.
