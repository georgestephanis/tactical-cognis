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

### 2. `faq` & `faq_config` — Errata and Rules Surfacing
**Effort: Small | Payoff: Medium**
* **Tables:** `faq` (~728 rows), `faq_config`
* **Objective:** Surface official GW rules clarifications, errata, and FAQs.
* **Scope:**
  - Query FAQs associated with active publications/datasheets.
  - Display FAQ entries as tooltips or notice panels in **Unit Details** or in **Roster Validation** warnings.

### Still-dormant tables (no roadmap yet)
Retained here so they aren't re-audited. See the "notably unused" note in
[DB.md](./DB.md) for the current view.
* **App / user state:** `favourite`, `entitlement`, `metadata` (beyond dashboard stats), `grdb_migrations`, `publication` detail bullets (`bullet_point`, `rule_container`, `rule_section`, `detachment_detail*`).
* **Play / battle:** `battle`, `battle_player*`, `roster_validation_state`.
* **Empty / vestigial:** `detachment_required_datasheet`, `keyword_ally_restricting_keyword`, `enhancement_keyword_points_cost`, `roster_unit_enhancement`, `army_rule_behaviour_type`, `faction_keyword_mandatory_allegiance_ability` (0 rows locally, but wired for schema-completeness where they feed an existing helper).

---

## Completed Database Integrations

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
