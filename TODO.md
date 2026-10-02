# TODO — Database Integrations Roadmap & Log

This is the single source for leveraging the companion-app SQLite schema: what's
still worth building, and what's already integrated. It absorbed the old
`UNUSED-DATA.md` audit — the authoritative list of which tables the app actually
reads now lives in the coverage table in [DB.md](./DB.md).

---

## Remaining roadmap

### 1. Missions & Scoring Tracker (Gameplay Battle Mode)
**Effort: Large | Payoff: Very High**
* **Tables:** `primary_mission`, `secondary_mission`, `mission_preset`, `mission_layout`, `mission_twist`, `objective`, `force_disposition` (several of these are now read for the print export's mission intel — see Completed; this item is the interactive *tracker*)
* **Objective:** A "Battle Mode" tab for live gameplay score tracking.
* **Scope:**
  - Tournament mission generator (Primary Mission + Deployment Map layout + Twist).
  - Secondary objective selection/drawing (Tactical vs. Fixed cards).
  - Interactive turn-by-turn Victory Point (VP) tracker during a match.

### Content-integration gaps

Items 2-9 (the whole priority matrix from the previous audit) shipped 2026-09-08 —
see Completed below for what each turned into. One follow-up remains:

#### 8b. Interactive "apply to whole unit" wargear picker
**Effort: Medium-Large | Payoff: Medium**
* **Tables:** `all_model_wargear_choice(_set/_wargear_item)` (65 / 29 / 71 rows) — already queried and shown as read-only prose (see Completed).
* **Objective:** The real UX win item 8 was chasing — an actual "give this loadout to every model in the unit" control in the Army Builder wargear picker, instead of setting each model individually.
* **Scope:** Deliberately deferred from the 2026-09-08 pass: this needs new `RosterUnit` state, print-output changes, and interaction design, not just a data join — the display-only version shipped first is lower-risk and already surfaces the previously-invisible content.

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

### 2026-09-08 — Content-integration gaps batch (former priority-matrix items 2-9)
All display-only or additive — none change how an existing, already-passing roster
validates. `enhancement_required_keyword_group_faction_keyword` and the `allied_faction`
pair below are the two that do change validation outcomes (closing gaps that were
previously silently unenforced), called out specifically.
* **#2 Enhancement faction-sub-keyword gate** ✅ `enhancement_required_keyword_group_faction_keyword` (650 rows) folds into the same `AppEnhancement.requiredKeywordGroups` groups as ordinary unit-keyword requirements (confirmed via the DB that a group can mix both, AND-within-group — e.g. *Osseus Key* requires "Watch Master or Techmarine" AND "Adeptus Astartes"). `isUnitEligibleForEnhancement`'s three call sites now also feed the unit's `Datasheet.factionKeywords` into the keyword pool, not just model keywords. **Legality-affecting**: previously an enhancement scoped to a declared sub-faction keyword was unenforced.
* **#3 Stratagem phase tags** ✅ `stratagem_phase` (2,016 rows, full coverage) → `AppStratagem.phases`, humanized (`chargePhase` → "Charge Phase") and shown as badges on Faction Browser's stratagem cards.
* **#4 Detachment "why take this" bullets** ✅ `detachment_detail` + `_bullet_point` → `MergedDetachment.details`, rendered in Faction Browser under Detachment Rules and in the Army Builder's `DetachmentHovercard`.
* **#5 Detachment linked/bundled datasheets** ✅ `detachment_linked_datasheet` → `MergedDetachment.linkedDatasheets`, shown as a "Comes With" list in Faction Browser and the hovercard. `detachment_required_datasheet` rides along guarded but is still 0 rows locally. Display-only, as scoped — auto-including bundled units in the builder roster remains a follow-up if ever wanted.
* **#6 Datasheet sub-abilities** ✅ `datasheet_sub_ability` (56 of 59 rows actually reachable through a real datasheet — 3 are orphaned in the DB itself) → `Ability.subAbilities`, nested under the parent ability in Unit Details and Faction Browser's print datacard. Fixes abilities like "Relics of the Matriarchs" that previously rendered with no indication of which named relics they actually offer.
* **#7 Allied-faction edge cases** ✅ Two independent mechanisms: (a) `allied_faction_parent_faction_keyword` labels each allied catalog unit with its source faction name (e.g. "(Adeptus Mechanicus)") in the Army Builder — pure display. (b) `allied_faction_keyword_slotless_keyword_group(_donor_keyword)` — **legality-affecting**: confirmed via the DB that caps like Agents of the Imperium's "Retinue" reference a keyword ("Retinue") that no datasheet ever carries natively, so that cap was silently unenforced; a unit carrying a registered *donor* keyword (e.g. "Inquisitor") now counts toward it. `AlliedLimit.donorKeywords` carries the substitution.
* **#8 All-model wargear "apply to whole unit"** ⚠️ Partial by design — see item 8b above. `all_model_wargear_choice(_set/_wargear_item)` synthesized into readable prose ("All models in this unit can be equipped with...") and shown in Unit Details; the interactive bulk-apply builder control is deliberately deferred.
* **#9 `wargear_option_group` scoping spike, resolved** ✅ Confirmed by diffing against `loadout_choice*`/`base_miniature_loadout_wargear_option`: no FK links the two systems, and `instructionText` is the companion app's own human-readable rendering of the *same* rules `loadout_choice*` already resolves structurally (`isStaticWargear` is always false locally, an unreliable signal) — not a separate legality mechanism. Shown as descriptive prose alongside the existing wargear picker in Unit Details, filtered to skip the literal "Default Wargear" placeholder rows.

### 2026-09-08 — Detachment info hovercard + enhancement-granted leadership
* **Detachment dropdown + hovercard** ✅ The Army Builder's "Add Detachment" `<select>` now appends each detachment's force disposition(s) to the option label, and each selected-detachment chip carries a hover/focus card (`DetachmentHovercard.tsx`, CSS-only reveal in `index.css`) listing its dispositions, enhancements, stratagems, and detachment rules — reusing the existing `RulesText` renderer for rule prose. Pure UI; no new queries needed, since `MergedDetachment` already carried all of this data.
* **`enhancement_bodyguard_group` + `_datasheet` + `_keyword`** ✅ Previously entirely unqueried (flagged in item 2 below under the wrong hypothesis — "restricted to a named bodyguard datasheet"). Investigating a user report that Ork's *Kaptin's Hat* should let its wearer lead Flash Gitz confirmed the real mechanic: this table mirrors `datasheet_bodyguard_group` (the table that already powers `Datasheet.leads`) but scoped to an equipped enhancement instead of being intrinsic to the datasheet — i.e. some enhancements *grant* their wearer the ability to lead/support a squad they otherwise couldn't. 22 rows locally, spanning Orks, Astra Militarum, Thousand Sons, World Eaters, Adepta Sororitas, Necrons (Murdermind → *support*, not *leader*), Chaos Space Marines, and Space Wolves. Wired into `db.ts` (`getDetachmentsByFaction` → `AppEnhancement.grantsLeadership`), `dataMapper.ts`, and `ArmyBuilder.tsx`'s `checkCompatibility`/`canAttachCharacterToSquad` (also correctly classifies enhancement-granted *support* attachments, not just *leader*, so they don't consume the leader slot). Verified against the live DB that Kaptin's Hat → Flash Gitz (`leader`) round-trips correctly.

### 2026-09-30 — Paid wargear and print-slate mission intel
* **`wargear_option.points`** ✅ 11th edition's points-costed wargear. Projected onto `Datasheet.wargearOptionPoints` (schema-probed), folded into each `getDatasheetCosts` tier, and charged as a delta for loadout changes in the Army Builder (`utils/loadout.ts`). Tiers carry `compositionIndex` so a filtered cost list still resolves the right squad size.
* **`force_disposition_mission` / `_recommended_preset`, `mission_preset`, `mission_layout`, `mission_deployment`, `primary_mission_objective*`** ✅ Read for the print export's disposition intel: per-matchup primary mission and scoring, recommended layouts, and deployment-map odds (`getDispositionIntel`, assembled in `utils/missionIntel.ts`). Still read-only — the Battle Mode tracker in roadmap item 1 is not built.
* **`secondary_mission`, `_objective`, `_action`** ✅ The secondary deck printed in full (`getSecondaryMissions`). The schema links no secondary to a disposition, so there is no per-army subset to show.

### 11th edition / Legends support (data version 946)
* **`datasheet.isLegends`** ✅ New column shipped with `Codex: Orks`, the first 11th-edition book. All 12 flagged rows live in the `Legends: Orks` publication and carry normal faction keywords and points, so they previously appeared as ordinary codex units. Now surfaced through `getUnitsByFaction`/`getAlliedUnitsForFaction` onto `MergedUnit.isLegends`: hidden by default behind an "Include Legends" toggle in both the Faction Browser and the Army Builder catalogue, badged where shown, excluded from Deep Analysis transport/embark lists, and raised as a matched-play roster validation error if one is in the list.
* **`publication.isCombatPatrol`** ✅ Combat Patrol detection now reads the real column instead of string-matching `"combat patrol"` in the publication name. The name check and the zero-points check remain as fallbacks for older uploaded databases.
* **`hasColumn()` schema probe** ✅ Cached `PRAGMA table_info` helper in `db.ts`, so columns added by newer companion-app releases can be selected conditionally rather than failing the whole datasheet load on older DBs. Verified against both v946 and a copy with both columns dropped.
* **`wargear_item_profile.hunterProfileKeyword`** ✅ New column, and a new *mechanic*: a conditional "Hunter" statline usable only against listed target keywords, paired with a `Standard` line. 6 profiles across 5 weapons, all `Codex: Orks`, all gated on `**MONSTER/VEHICLE**`. Parsed by `parseHunterKeywords()` onto `WeaponProfile.hunterKeywords`; selection logic lives in the pure engine (`profileAppliesToTarget`, `selectProfilesForTarget`) with unit tests. **Fixed a latent correctness bug:** Deep Analysis summed every profile of a weapon, which double-counted Hunter weapons — it now fires only the profile applicable to the active target preset. Unit Details badges the condition and greys out presets the profile can't legally target.
* **`detachment_force_disposition` / `force_disposition`** ✅ A detachment's force disposition, crossed with the opponent's, selects the primary mission (`force_disposition_mission`). Surfaced as `MergedDetachment.forceDispositions`, badged in the Faction Browser, and — critically — the Army Builder now handles **detachments that offer a choice**: a selector appears, the pick persists on the saved roster, and validation flags the roster until one is chosen. Of 294 detachments, 293 offer exactly one and none offer zero; exactly one detachment, added by the 11th-edition codex, offers a choice between two.
* **Still open:** `army_rule_behaviour_type` and the new `Surge Move` / `Ingress Move` `behaviour_type` rows remain unqueried; the `Legends: Orks` "Warhammer Legends" and "Legendary Proxies" rule sections render via the generic Core Rules path but aren't linked from datasheets. (`force_disposition_mission(_recommended_preset)` now drives the Army Builder's Mission Preview panel as well as the print export.)

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
