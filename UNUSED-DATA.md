# Unused Database Data — Audit

An audit of structured data present in the companion-app SQLite schema that
Tactical Cognis does **not** currently read, but arguably should. The trigger
for this audit was the `conditional_keyword` table (keyword grants from
detachment/warlord rules) — this file catalogues data of a similar character:
machine-readable game rules that today are either ignored or only visible as
free-text prose, and that could drive real army-building legality, validation,
points, or UI.

Method: cross-referenced every table in `public/40k.sqlite` against the tables
actually queried in [src/utils/db.ts](./src/utils/db.ts) (the only module that
talks to `sql.js`). Of ~145 tables, ~62 are queried and ~83 are untouched. Most
of the untouched ones are genuinely out of scope (see the last section); the
tables below are the ones with real army-building value.

> Row counts are from the local DB at audit time and vary by companion-app
> schema version. Anything wired up must be probed defensively (`PRAGMA
> table_info`) and degrade gracefully, per the existing `wargear_limit` pattern.

---

## Tier 1 — Legality & validation gaps (highest value)

These directly affect whether a roster is *legal*. We already validate points,
Rule-of-3, enhancement eligibility, and (now) conditional keywords — these are
the same class of rule, just not yet read.

### `detachment_excluded_datasheet` (23 rows)
**Purpose:** Datasheets that a specific detachment forbids you from taking at
all. The mirror image of the grants we just added.
**Example:** *Black Spear Task Force* (Deathwatch) excludes Watch Captain
Artemis, Watch Master, Deathwatch Kill Team, Corvus Blackstar, Devastator/Scout/
Tactical Squads, Terminator Assault Squad, etc.
**Extrapolated use:** In the Army Builder, grey out / block adding these units
while the detachment is selected, and flag them as a validation error on import.
Schema: `(detachmentId, datasheetId)`.

### `detachment_mandatory_warlord_miniature` (2 rows)
**Purpose:** Detachments that *require* a specific model to be your Warlord.
**Example:** *Devoted of Ynnead* requires Yvraine **or** Yncarne as Warlord.
**Extrapolated use:** Validation error ("This detachment requires Yvraine or
Yncarne as your Warlord") and a Warlord-picker hint. Schema:
`(detachmentId, miniatureId)` — multiple rows per detachment = an OR set.

### `detachment_granted_warlord_miniature` (1 row)
**Purpose:** A model that may be your Warlord *only* because this detachment is
selected (normally it couldn't be, e.g. not a Character/Epic Hero in the usual
sense).
**Example:** *Vanguard Onslaught* lets **Deathleaper** be the Warlord.
**Extrapolated use:** Expand the set of legal Warlord choices when this
detachment is active. Schema: `(detachmentId, miniatureId)`.

### `detachment_required_datasheet` (0 rows locally, but schema present)
**Purpose:** Units a detachment forces you to include. Empty in this DB version
but the table exists and should be handled if a future DB populates it.
**Extrapolated use:** "Detachment requires at least one X" validation.

### `keyword_restriction_group` + `keyword_restriction_group_keyword` (16 / 21 rows)
**Purpose:** Faction-wide caps on how many of a set of units you can field —
the structured version of "0-1 of the following per army." Columns:
`factionKeywordId`, `limit`, `requiresWarlordMiniatureId`,
`excludedFactionKeywordId`; the child table lists the keywords/units the cap
applies to.
**Examples:**
- *T'au Empire*: max **1** of {Commander Farsight, Ethereal}.
- *Astra Militarum*: max **1** of {Commissar Graves, Commissar Graves on Foot}
  (i.e. the two variants share a single slot).
- *Asuryani*: The Yncarne / Yvraine / The Visarch are **excluded** unless the
  `Ynnari` sub-faction is taken (`limit` 0 + `excludedFactionKeywordId`).
**Extrapolated use:** A whole class of "you took too many of these" validation
errors we don't currently catch, plus mutually-exclusive-variant handling.
Note the `requiresWarlordMiniatureId` / `excludedFactionKeywordId` conditions —
some of these can't be fully evaluated until sub-faction selection exists
(see Tier 3).

### `faction_keyword_excluded_datasheet` (23 rows)
**Purpose:** Units a given faction keyword forbids — typically Chapter/Legion
sub-factions that lock out generic units.
**Examples:** *Black Templars* exclude Librarian in Terminator/Phobos Armour,
Gladiator Reaper/Lancer, Repulsor/Repulsor Executioner, etc.; *Imperial Knights*
exclude Sir Hekhtur.
**Extrapolated use:** Same as `detachment_excluded_datasheet`, but keyed on the
army's faction keyword rather than the detachment.

### `restriction_group_detachment_limit` (7 rows)
**Purpose:** Per-detachment min/max overrides layered on a keyword restriction
group (`minRosterLimit` / `maxRosterLimit`).
**Extrapolated use:** Fine-tunes the Tier-1 caps above on a per-detachment
basis. Only meaningful once `keyword_restriction_group` is consumed.

---

## Tier 2 — Roster construction & display gaps

Not strictly legality, but they'd make the builder more accurate or more useful.

### `detachment_linked_datasheet` (107 rows)
**Purpose:** Detachment-specific "linked" datasheet variants — units that only
exist in the context of a detachment, often bundled counts.
**Examples:** *Drayden's Lance* → Drayden's Lance Attilan Rough Riders / Kasrkin
/ Command Squad; *Askar's Wolfpack* → Fyrri Askar + Wolf Guard Terminators +
Wulfen + Blood Claws (each `count` 1).
**Extrapolated use:** Surface these bundled/linked units when the detachment is
chosen, so the builder shows the right roster shell instead of the generic
datasheet list. `count` indicates how many are auto-included.

### `wargear_option_group` (3025 rows) + `wargear_rule` (1366 rows)
**Purpose:** The human-readable wargear-swap instructions. `wargear_option_group`
has `instructionText`, `displayOrder`, `isStaticWargear`, keyed per
datasheet/miniature; `wargear_rule` has `rulesText` (the "■ This model's bolt
pistol can be replaced with 1 plasma pistol." bullet prose).
**Example:** *Canoness* → "This model's hallowed chainsword can be replaced with
one of the following: ◦ 1 blessed blade …".
**Extrapolated use:** The builder currently drives wargear from the *structured*
choice tables (`loadout_choice*`, `limited_wargear_choice*`). Showing the
official instruction prose alongside the structured pickers would make the
wargear UI far more legible and let users cross-check the structured options
against the actual rules text. `isStaticWargear` also flags gear that's fixed
(not a choice) — useful for display.

### `datasheet_sub_ability` (52 rows)
**Purpose:** Sub-abilities nested under a datasheet ability — e.g. the specific
named effect of a wargear item that itself grants an aura.
**Example:** *Adepta Sororitas* Simulacra: "The Fiery Heart (Aura) — While a
friendly ADEPTA SORORITAS unit is within 6\" of this model…".
**Extrapolated use:** Richer ability text in Unit Details; we currently render
top-level abilities but drop these nested ones. Keyed via `datasheetAbilityId`.

### `enhancement_bodyguard_group` / `_datasheet` / `_keyword` (19 rows +)
**Purpose:** Some enhancements are only equippable by (or affect) a Leader/
Bodyguard relationship — `bodyguardType` = `leader`, scoped by faction keyword.
**Extrapolated use:** Tighten enhancement eligibility beyond the keyword-group
logic we have now (e.g. "only a model leading a unit"). Small but real accuracy
gain for attach-mechanic enhancements.

### `enhancement_datasheet_ability` (6 rows), `enhancement_required_wargear_item` (1 row)
**Purpose:** Enhancements that grant a named datasheet ability, or that require
the model to already have a specific wargear item.
**Extrapolated use:** Show what an enhancement actually *does* (granted ability)
and block it when the prerequisite wargear isn't equipped.

---

## Tier 3 — Sub-faction / allegiance system (a feature we lack entirely)

This is the biggest structural gap and the reason 307 `conditional_keyword`
rows are currently skipped (274 gated on an allegiance ability, 33 on a
roster-declared faction keyword). The app has **no concept** of selecting a
sub-faction/allegiance, so all of the following are dark.

### `allegiance_ability` (26 rows) + `allegiance_ability_group` (10 rows)
**Purpose:** Selectable sub-faction identities tied to a detachment, with
min/max pick counts. Columns of note: `allegiance_ability_group.detachmentId`,
`isMandatory`, `minRosterLimit`, `maxRosterLimit`.
**Examples:**
- *Pactbound Zealots* (CSM) → "Mark of Chaos" group, mandatory 1 of Khorne/
  Tzeentch/Nurgle/Slaanesh/Undivided.
- *Houndpack Lance* (Chaos Knights) → pick exactly 3 keywords.
- *Solar Spearhead* / *Subterranean Assault* / *Headhunter Task Force* → pick
  up to N keywords.
**Extrapolated use:** A sub-faction picker in the Army Builder. Implementing it
would unlock:
- the 274 + 33 skipped `conditional_keyword` grants (marks/allegiances that add
  keywords — Battleline, unit types, etc.);
- the `excludedFactionKeywordId` conditions in `keyword_restriction_group`
  (e.g. Ynnari unlocking Yvraine/Yncarne/Visarch);
- correct allegiance-conditional abilities and stratagem availability.

### `faction_keyword_mandatory_allegiance_ability` (0 rows locally)
**Purpose:** Faction keywords that force a specific allegiance choice. Empty
now but part of the same system.

### `army_rule` (98 rows) + `army_rule_faction_keyword` + `army_rule_behaviour_type`
**Purpose:** The army-wide special rules (Acts of Faith, Oath of Moment, The
Shadow of Chaos, Dark Pacts, Code Chivalric, Freeblades, etc.), linked to
faction keywords, with `behaviour_type` rule-engine metadata.
**Extrapolated use:** Display the army rule(s) for the selected faction (we show
detachment rules but not the army-level rule), and — via `behaviour_type` —
potentially feed the Mathhammer engine (e.g. an army rule that modifies
hit/wound). This is the bridge between the rules DB and the damage simulator.

---

## Tier 4 — Intentionally out of scope

Present in the DB but unrelated to army building/analysis; **no** action
recommended. Listed so future audits don't re-flag them:

- **Play/battle tracking:** `battle`, `battle_player*`, `roster_validation_state`.
- **Missions & deployment:** `mission_pack`, `mission_preset`, `mission_layout*`,
  `mission_deployment`, `mission_twist`, `primary_mission*`, `secondary_mission*`,
  `secondary_objective`, `objective`, `force_disposition*`,
  `detachment_force_disposition`. (This is a game-play companion feature; Tactical
  Cognis is a list-building/analysis tool.)
- **FAQ / errata:** `faq` (728 rows), `faq_config` — could arguably be surfaced
  as reference text someday, but it's not list-building data.
- **App/user state:** `favourite`, `entitlement`, `metadata`, `grdb_migrations`,
  `publication` (partly used already), `bullet_point`, `rule_container`,
  `rule_section`, `detachment_detail*`.
- **Empty / vestigial:** `keyword_ally_restricting_keyword`,
  `enhancement_keyword_points_cost`, `roster_unit_enhancement`,
  `roster_unit_allegiance_ability` (0 rows here — but note roster-import already
  reads enhancements at the *miniature* level via
  `roster_unit_miniature_enhancement`; watch for DBs that populate the unit-level
  table instead).

---

## Suggested priority order

1. **`detachment_excluded_datasheet` + `faction_keyword_excluded_datasheet`** —
   cheapest high-value win, mirrors the grants engine we just built, pure
   validation/display, no new UI concepts.
2. **`keyword_restriction_group` (+ `_keyword`, `restriction_group_detachment_limit`)** —
   catches "too many 0-1 units" errors; partial (the unconditional caps) can ship
   before the allegiance system exists.
3. **`detachment_mandatory_/granted_warlord_miniature`** — small, sharpens
   Warlord validation.
4. **`wargear_rule` / `wargear_option_group` prose** — big UX improvement for the
   wargear picker, no legality risk.
5. **Sub-faction/allegiance system (Tier 3)** — largest effort, but it's the key
   that unlocks 300+ dormant conditional-keyword rows and a swath of restriction
   conditions. Worth scoping as its own feature.
