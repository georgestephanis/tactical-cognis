# Army Builder

The **Army Builder** view is a comprehensive roster-building workspace. It allows users to create, import, validate, save, and print competitive army lists. It implements live rules enforcement based on active Warhammer 40,000 Battle Forge mechanics.

---

## 📸 Component Reference

- **React Component:** [ArmyBuilder.tsx](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/components/ArmyBuilder.tsx)
- **Styling Hooks:** Styled using class definitions in [src/index.css](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/index.css) (classes: `.builder-layout`, `.builder-catalog`, `.builder-roster`, `.points-gauge`, `.points-progress-container`, `.points-progress-bar`, `.validation-alert-box`, `.roster-unit-card`, `.nested-leader-wrapper`, `.nested-leader-card`, `.catalog-item`).

---

## 🛠️ Methods & Rendering Logic

### 1. Database Limits & Battle Sizes
- Pulls game configuration limitations from the SQLite database via `getBattleSizes()` on mount.
- Roster sizes are categorized (e.g., Incursion - 1000 pts, Strike Force - 2000 pts, Grand Tournament - 3000 pts).
- The active points limit determines duplicate unit caps (usually max 3 duplicates, or 6 for Battleline units) and enhancement limits (max 3).

### 2. Roster Assembly & Nesting
- **Add/Remove:** Users browse a sidebar catalog of faction units, select points sizing levels, and click "Plus" to add them to the roster.
- **Allied Units:** When the database defines allies for the faction (`allied_faction*` tables), an "Allies" category appears in the catalog (e.g., Agents of the Imperium for Space Marines). Allied units live in `factionData.alliedUnits`, may be gated to specific detachments via `requiredDetachmentIds`, and are point-capped per the faction's `alliedLimits`.
- **Warlord Flag, Supreme Commander & Mandatory Warlords:** Toggles a single Warlord crown icon on characters. Units are auto-flagged as Warlord on list entry when they either possess the intrinsic *Supreme Commander* ability (e.g. Ghazghkull Thraka) **or** are named as a detachment's mandatory Warlord in the DB (`detachment_mandatory_warlord_miniature`, via `factionData.detachmentWarlordRules`) while that detachment is selected — the DB records are authoritative for Primarch/Ghazghkull-style rules. Auto-flagging locks the checkbox controls and disables Warlord checkboxes for other character units with descriptive tooltips.
- **Allegiance / Sub-faction:** When the faction has allegiance choices (`allegiance_ability_group` — Marks of Chaos, Daemonic Allegiance, etc.) or declarable sub-faction keywords (e.g. a Space Marine Chapter), selectors appear beside the detachment picker. Mandatory groups must be satisfied; single-pick groups render as dropdowns, multi-pick as checkboxes capped at the group's max. Detachment-scoped groups only appear once their detachment is selected. Declaring an allegiance unlocks the corresponding `conditional_keyword` grants (`factionData.conditionalKeywordGrants`, applied in `applyKeywordGrants`) and the choices/rules are persisted with the roster.
- **Detachment Point Budget & Selector Hiding:** Detachments are added to the list and cost Detachment Points (DP). The detachment select dropdown dynamically filters available options based on the remaining DP budget and automatically hides, displaying a `(Max budget reached)` text tag, when the budget limit is reached or all available options are selected. Each option label also appends the detachment's force disposition(s) (`MergedDetachment.forceDispositions`), and once a detachment is selected its chip shows the same disposition tag plus a hover/focus-triggered **hovercard** (`DetachmentHovercard.tsx`, CSS-only reveal via the `.detachment-chip`/`.detachment-hovercard` rules in `index.css`) listing its dispositions, enhancements, stratagems, and detachment rules — reusing `RulesText` to render rule prose — so the player can see what a detachment actually grants before committing to it.
- **Enhancements:** Renders enhancement options specific to the active detachment and attaches them to characters, appending points automatically.
- **Leader Attachment:** Users can attach a Character to a compatible Bodyguard unit. Compatibility (`checkCompatibility`) is true when either the character's datasheet-intrinsic `leads` list names the bodyguard (`datasheet_bodyguard_group*`), **or** the character's currently-equipped enhancement grants it (`AppEnhancement.grantsLeadership`, from `enhancement_bodyguard_group*` — e.g. the Orks' *Kaptin's Hat* letting its wearer additionally lead Flash Gitz). `canAttachCharacterToSquad`'s Leader/Support slot accounting reads the same enhancement grant, so a *support*-type grant (e.g. Necrons' *Murdermind*) is classified as Support rather than consuming the Leader slot. Attached leaders are styled as nested cards indented under the bodyguard unit.
- **Wargear Choice Sets:** Dynamically renders wargear option controls depending on SQLite limits, duplicates, and starting weapons:
  - **Standalone Checkboxes**: Unrestricted optional upgrades (where `limit >= choices.length` and duplicate selection is blocked, such as the Battlewagon's `Lobba` or `’Ard Case / Grabbin’ klaw / Wreckin’ ball`) collapse into clean individual checkboxes.
  - **Selection Dropdown**: Mutually exclusive choices or default replacements (such as `Deff Rolla vs Tracks and wheels` or `Kannon vs Killkannon vs Zzap Gun`) render as dropdowns. Default/starting equipment is resolved and filtered out of the selection list to avoid duplication and instead shown inside the default placeholder option label (e.g. `-- Default Loadout (Tracks and wheels) --` or `-- Default Loadout (None) --`).
  - **Restricted Checkbox List**: Sets that have `limit > 1` but block duplicates and contain more choices than the limit render as checklists where options disable once the limit is met.
  - **Counter List**: Option sets that permit duplicate selections (such as equipping multiple `Big shootas`) render with `-` and `+` adjusters.
- **Paid Wargear (11th edition):** Wargear can carry a points cost (`wargear_option.points`). A unit costs its composition points **plus the price of every item it is equipped with, defaults included**, so a tier's headline price (`getDatasheetCosts`) already folds in the default loadout's surcharge (`DerivedCost.wargearPoints`). The roster card then adds only the **delta** from the default loadout for the choices the player actually made (`getUnitWargearPoints`, negative when swapping a paid default for a free item) and shows it as a `(+N wargear)` tag. Picker options that cost points are annotated `(+N pts)` via `getChoicePoints`. Squad sizing for pricing resolves the tier's composition through `RosterUnit.compositionIndex` (not `selectedCostIndex`, which indexes the *filtered* cost list). All pricing logic lives in [src/utils/loadout.ts](../src/utils/loadout.ts) and is unit-tested in `tests/loadout.test.ts`. Datasheets without pricing data, and databases predating the column, are simply free.
- **Combat Squad Split:** Eligible squads expose a split toggle (`splitSquad` on the roster unit). Split squads render a badge, display half points per half, and count as two units in printed output.

### 3. Live Validation Engine
The UI audits the roster on every change and displays active warnings:
- **Points Overflow:** If total points exceed the point limit, progress bars shift to red (`.points-progress-danger`).
- **Warlord check:** Flagging if there is no Warlord, or if more than one Warlord is assigned.
- **Duplicate unit limit:** Validates datasheet occurrences. If non-battleline datasheets exceed the limit (e.g., more than 3 of a single unit), it flags an alert.
- **Stepped Duplicate-Unit Pricing:** Dynamically recalculates points values for duplicate units using stepped pricing rules if defined in the database (e.g., subsequent Stompa or Big Mek Dakkarig models costing progressively more).
- **Enhancement caps:** Limits detachment enhancement counts and prevents assigning enhancements to Epic Heroes.
- **Group Enhancement restriction:** Enforces the core rule that an attached character group (bodyguard + attached characters) can only contain a single enhancement total, gating both attachment commands and enhancement dropdowns accordingly.
- **Allied points caps:** Validates allied unit totals against the per-ally-faction points limits from `alliedLimits`.
- **Excluded datasheets:** Flags units barred from the whole faction (`faction_keyword_excluded_datasheet`) or from a selected detachment (`detachment_excluded_datasheet`), via `factionData.excludedDatasheets`.
- **Keyword restriction caps ("0-1 X"):** Counts roster units carrying a restriction group's keywords (`factionData.keywordRestrictionGroups`) and flags over/under the group's limit, honoring per-detachment min/max overrides, a Warlord gate, and a declared sub-faction keyword that lifts the cap (e.g. Ynnari).
- **Mandatory Warlord (detachment):** When a detachment names a mandatory Warlord unit, flags if that unit is absent or not designated Warlord.
- **Allegiance choices:** Flags unsatisfied mandatory allegiance groups and picks that violate a group's min/max.
- **Force disposition:** The army deploys under one force disposition, which, crossed with the opponent's, selects the primary mission and map presets. The options are the union of every selected detachment's dispositions (`collectArmyDispositions` in `utils/missionIntel.ts`); a single option is shown read-only, several render as a radio group (each labelled with the detachment(s) offering it) and the roster is flagged until one is picked. `resolveArmyDisposition` ignores a pick the current detachments no longer offer rather than falling back to an arbitrary one. The pick is persisted as `ArmyList.selectedForceDispositionId` (older saves' per-detachment `selectedForceDispositionIds` migrate on load) and carried through companion-app roster imports from `roster.forceDispositionId` when that column exists.
- **Mission Preview:** A collapsible panel under the disposition picker previews what the chosen disposition leads to — primary mission and recommended presets per opposing disposition (rules and scoring behind a nested toggle), deployment-map odds, and the full secondary deck (`MissionPreview.tsx`). Intel loads only while the panel or the print preview is open.
- **Warhammer Legends datasheets:** Flags any roster unit whose datasheet has `isLegends` set. Legends units are legal in open and narrative play but never in matched play, so they are surfaced as a validation error rather than blocked outright — they can still be added deliberately (or arrive via a roster import), and the error names each one.

The catalogue itself hides Combat Patrol datasheets, zero-points datasheets, and (behind an *Include Legends* toggle, shown only for factions that have any) Warhammer Legends datasheets. Legends units that are shown carry a `LEGENDS` badge.

### 4. Roster Import
The Import modal offers two paths that converge on the same matching pipeline (`applyParsedRoster`):

**a. Database roster import.** If the uploaded companion-app database contains the user's own saved rosters (`roster*` tables), the modal lists them ("Rosters Found In Your Database") with name, faction, points limit, and unit count. One click imports the roster via `getSavedDbRosters()` / `getDbRosterDetail()` from [src/utils/db.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/utils/db.ts). Because the DB rows share IDs with the catalog tables, this path recovers exact unit matches, model counts, wargear selections, enhancements, warlord state, declared allegiance abilities (`roster_unit_allegiance_ability`), allied units, and even leader→bodyguard attachments (which the text path cannot express). Importing a roster from another faction switches factions automatically. Empty rosters and DBs without roster tables are handled gracefully.

**b. Text import parser (`parseBattleForgeText`).** Parses raw text exports copy-pasted directly from the official Warhammer 40,000 app:
- Scans headers for faction names using `findFactionSlugByName` and auto-selects the appropriate database faction. Bypasses the switch confirmation prompt if the current workspace selection is "none".
- Parses lines using regular expressions to isolate unit names, total points, model counts, warlord state, and assigned enhancements.
- Handles quantity prefixes (e.g. `4x Squighog Boyz` or `10x Beast Snagga Boyz`) by cleaning them before running search matches.
- Automatically resolves multiple detachment matches in the detachment header (e.g. `Freebooter Krew and More Dakka!`) and resolves secondary upgrades correctly.
- Automatically groups attached leaders: units within `"Attached Unit X"` clusters are parsed so that characters are linked to the final bodyguard unit.
- If a unit or enhancement cannot be mapped confidently, the app pauses and prompts the user with an **Interactive Resolution Modal** to manually select the correct database matches. Candidates are sorted by length proximity to target name.

Both paths match units against the faction catalog **and** allied units by normalized name, pick the closest points/model-count cost tier (`findBestCostIndex`), and surface per-unit warnings for anything that couldn't be matched.

### 5. Print Layout Engine

**Print isolation.** The view's root element carries a `.view-root` marker class (see [faction_browser.md](./faction_browser.md) for the shared mechanism this fixed: a bug where builder-layout content was still visible underneath the print slate because `visibility: visible` on the ancestor chain re-showed the whole underlying tree, not just the slate).

**Section toggles.** Checkboxes in the preview header switch each optional section on or off: *Collapse Units*, *Detachment Rules*, *Stratagems*, *Disposition & Map Intel*, and *Secondary Missions*. They are component state only.

The Roster Print Slate Engine supports two black-and-white print styles:
- **Tabular matched-play print sheet**: Outputs a layout suited for printing or PDF exports. Tabular sections (the Units Roster table, the Ranged Weapon Summary Profiles, and the Melee Weapon Summary Profiles) are separated by print-time page breaks (`break-before: page`), ensuring each summary section starts on a fresh page.
- **Datacards Print Grid**: Prints datacards with page-break boundaries preventing cards from cutting off. The grid is centred on the page, so the left and right page margins are equal. Each card's weapons are rendered as a **table** — one row per weapon profile, with Range / A / Sk / S / AP / D columns — rather than a run-on string, and a conditional ("Hunter") profile is flagged with the keywords it requires.

**Card size.** A three-way toggle (`cardSize`, shown only on the datacard layout) picks the footprint, applied as a `cards-size-*` class on `.print-cards-grid`:

| Size | Footprint | Per row | Type scale |
| --- | --- | --- | --- |
| `id1` (default) | Exactly 85.60 × 53.98 mm — ISO/IEC 7810 ID-1, i.e. credit-card | 2 | 1× |
| `half` | Half the **printable width** of the sheet, min-height 70 mm | 2 | 1.45× |
| `full` | Full printable width, min-height 90 mm | 1 | 2× |

Two things make this more than a box resize:

- **`--card-scale`** is a custom property set by each size class, and every font size, padding and corner radius inside a card is a `calc()` against it. So a larger card buys legibility (weapon tables go from 5pt to 10pt at full width), not just whitespace.
- **Half and full are relative, not fixed.** They use `1fr` grid tracks rather than hardcoded millimetres, so they adapt to whatever paper size and page margins the browser is using. Only ID-1 is a fixed measurement, because it's a spec.

ID-1 keeps `overflow: hidden` and its exact height — content that doesn't fit is clipped, which is the trade-off for the spec size. The larger sizes exist precisely to *show* that content, so they switch to an auto height with a min-height, let long keyword and weapon text wrap instead of ellipsing, and pack content to the top rather than spreading it.

**Rules, stratagems and mission intel.** Beyond the roster itself, both layouts can print reference material for the selected detachments and the army's chosen force disposition (tabular: tables; datacards: one card each):

- **Detachment Rules** — every rule granted by the selected detachments (`getPrintableDetachmentRules`).
- **Stratagems** — every stratagem the selected detachments grant, with CP cost and timing (`getPrintableStratagems`). The Category column only prints when at least one listed stratagem has a category — 11th-edition detachments carry none.
- **Disposition & Map Intel** — for the army's active force disposition (the single one on offer, or the player's pick where the selected detachments offer several), `getDispositionIntel()` returns each opposing disposition's primary mission with its VP scoring, and the layout/deployment presets recommended for that pairing. `calculateDeploymentFrequencies()` then reports how often each deployment map appears across those presets, rated *Most Likely / Likely / Rare / Never* (`getDeploymentLikelihoodBadge`). The odds treat every opposing disposition as equally likely. Layout columns (A/B/C…) come from the preset names (`getPresetLetter`), not array position.
- Flavour **lore** text (on detachment rules, primary and secondary missions) is never printed — only rules text.
- **Secondary Missions** — the mission pack's full secondary deck (`getSecondaryMissions()`) with Fixed/Tactical type, first-turn scorability, scoring and actions. **Nothing in the database ties a secondary to a disposition**, so this is the same deck for every army; the print says so.

The row-to-result assembly for the last two lives in [src/utils/missionIntel.ts](../src/utils/missionIntel.ts) (pure, unit-tested in `tests/missionIntel.test.ts`); `db.ts` only runs the SQL. Mission data is fetched when the print preview opens and each query is guarded, so a database without these tables just omits the sections.

**Roster hierarchy on print.** Ordering comes from `groupAttachedEntries()` in [src/utils/rosterPrint.ts](../src/utils/rosterPrint.ts) (pure, unit-tested in `tests/rosterPrint.test.ts`). The **bodyguard squad is the top-level row**, with its attached Leader and Support characters indented beneath it — Leaders first, then Support. The squad is what attachments attach *to*, so it reads as the parent, and the ordering stays correct when a squad has a Support character but no Leader (which previously left the squad indented beneath nothing). Unattached units follow as independent rows. The same function serves both the collapsed and uncollapsed views, so the two can't drift.

---

### 6. Text Export Formats

`generateArmyListText(format)` emits three shareable text formats, selected by `shareFormat`:

| Format | Shape |
| --- | --- |
| `app` (default) | The companion app's own layout — one bullet per unit, with enhancement and wargear as sub-bullets. This is the round-trip format the text importer reads. |
| `standard` | Markdown, grouped into **CHARACTER** / **BATTLELINE** / **OTHER DATASHEETS** sections. |
| `wtc` | One flat `UNIT n: …` line per unit with an inline enhancement suffix. |

**Enhancements and Upgrades.** A detachment enhancement taken by a non-Character unit (an "Upgrade", gated by `enhancement.isEquipableByNonCharacterUnit`) is stored on the *same* `enhancementName` / `enhancementPoints` fields as a Character's enhancement. Every format therefore prints it, and non-Character ones are suffixed `(Upgrade)` to keep the distinction — a suffix the text importer strips, so exports still round-trip. The tabular print sheet labels the row `Upgrade:` rather than `Enhancement:` for the same reason.

Per-unit points in every format are `getUnitTotalPoints()` — `getUnitActualPoints()` (tier price and stepped duplicate pricing) **plus** wargear taken beyond the default loadout **plus** enhancement points — so the printed unit figures add up to the printed total. (The `standard` format previously omitted the enhancement line and its points for non-Character units entirely.)

## 🎨 Visual Design & Style Systems

The editor uses a split-screen grid layout:

| CSS Selector | Styling & Visual Effect |
| :--- | :--- |
| `.builder-layout` | Main grid dividing the screen into a 320px catalog sidebar and a flexible roster stream. |
| `.builder-catalog` | Scrollable catalog panel with search filters and category tags. |
| `.points-gauge` | Dashboard panel tracking points totals. The progress bar shifts from blue (`--accent-indigo`/`--accent-teal`) to yellow (`.points-progress-warn` near limit) and red (`.points-progress-danger` over limit). |
| `.nested-leader-wrapper` | Draws a dashed left border indentation connector showing character attachment. |

---

## 📊 Data Specifications

### Input Props
- `initialFactionSlug` (string | undefined): Pre-selects a faction.
- `onSelectFaction` (callback): Syncs faction choice up to the parent app routing state.

### Persistence
- Roster lists are saved as serialized JSON in the browser's `localStorage` under the key `'tactical_cognis_armies'`.
- Print-slate preferences (`printLayout`, `cardSize`, `collapseDuplicates`, and the `printInclude*` section toggles) are component state only — they are not persisted, and reset to Tabular / ID-1 / uncollapsed each session.

---

## 🔗 Links to Other Views

- **[Dashboard](./dashboard.md):** The top navigation bar tabs allow switching back to the registry.
- **[Unit Details Modal](./unit_details.md):** Clicking a unit profile name opens the detailed overlay modal to check wargear profiles or run simulator calculations.
- **[Deep Analysis](./deep_analysis.md):** Top navigation tabs switch to the Mathhammer Playground.
