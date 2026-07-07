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
- **Warlord Flag & Supreme Commander:** Toggles a single Warlord crown icon on characters. Units possessing the *Supreme Commander* ability (e.g. Ghazghkull Thraka) are automatically flagged as the Warlord on list entry, which locks the checkbox controls and disables Warlord checkboxes for other character units with descriptive tooltips.
- **Detachment Point Budget & Selector Hiding:** Detachments are added to the list and cost Detachment Points (DP). The detachment select dropdown dynamically filters available options based on the remaining DP budget and automatically hides, displaying a `(Max budget reached)` text tag, when the budget limit is reached or all available options are selected.
- **Enhancements:** Renders enhancement options specific to the active detachment and attaches them to characters, appending points automatically.
- **Leader Attachment:** Users can attach a Character to a compatible Bodyguard unit. The component uses the `leads` string arrays from the database to validate compatibility. Attached leaders are styled as nested cards indented under the bodyguard unit.
- **Wargear Choice Sets:** Dynamically renders wargear option controls depending on SQLite limits, duplicates, and starting weapons:
  - **Standalone Checkboxes**: Unrestricted optional upgrades (where `limit >= choices.length` and duplicate selection is blocked, such as the Battlewagon's `Lobba` or `’Ard Case / Grabbin’ klaw / Wreckin’ ball`) collapse into clean individual checkboxes.
  - **Selection Dropdown**: Mutually exclusive choices or default replacements (such as `Deff Rolla vs Tracks and wheels` or `Kannon vs Killkannon vs Zzap Gun`) render as dropdowns. Default/starting equipment is resolved and filtered out of the selection list to avoid duplication and instead shown inside the default placeholder option label (e.g. `-- Default Loadout (Tracks and wheels) --` or `-- Default Loadout (None) --`).
  - **Restricted Checkbox List**: Sets that have `limit > 1` but block duplicates and contain more choices than the limit render as checklists where options disable once the limit is met.
  - **Counter List**: Option sets that permit duplicate selections (such as equipping multiple `Big shootas`) render with `-` and `+` adjusters.
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

### 4. Roster Import
The Import modal offers two paths that converge on the same matching pipeline (`applyParsedRoster`):

**a. Database roster import.** If the uploaded companion-app database contains the user's own saved rosters (`roster*` tables), the modal lists them ("Rosters Found In Your Database") with name, faction, points limit, and unit count. One click imports the roster via `getSavedDbRosters()` / `getDbRosterDetail()` from [src/utils/db.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/utils/db.ts). Because the DB rows share IDs with the catalog tables, this path recovers exact unit matches, model counts, wargear selections, enhancements, warlord state, allied units, and even leader→bodyguard attachments (which the text path cannot express). Importing a roster from another faction switches factions automatically. Empty rosters and DBs without roster tables are handled gracefully.

**b. Text import parser (`parseBattleForgeText`).** Parses raw text exports copy-pasted directly from the official Warhammer 40,000 app:
- Scans headers for faction names using `findFactionSlugByName` and auto-selects the appropriate database faction. Bypasses the switch confirmation prompt if the current workspace selection is "none".
- Parses lines using regular expressions to isolate unit names, total points, model counts, warlord state, and assigned enhancements.
- Handles quantity prefixes (e.g. `4x Squighog Boyz` or `10x Beast Snagga Boyz`) by cleaning them before running search matches.
- Automatically resolves multiple detachment matches in the detachment header (e.g. `Freebooter Krew and More Dakka!`) and resolves secondary upgrades correctly.
- Automatically groups attached leaders: units within `"Attached Unit X"` clusters are parsed so that characters are linked to the final bodyguard unit.
- If a unit or enhancement cannot be mapped confidently, the app pauses and prompts the user with an **Interactive Resolution Modal** to manually select the correct database matches. Candidates are sorted by length proximity to target name.

Both paths match units against the faction catalog **and** allied units by normalized name, pick the closest points/model-count cost tier (`findBestCostIndex`), and surface per-unit warnings for anything that couldn't be matched.

### 5. Print Layout Engine
The Roster Print Slate Engine supports two black-and-white print styles:
- **Tabular matched-play print sheet**: Outputs a layout suited for printing or PDF exports. Tabular sections (the Units Roster table, the Ranged Weapon Summary Profiles, and the Melee Weapon Summary Profiles) are separated by print-time page breaks (`break-before: page`), ensuring each summary section starts on a fresh page.
- **Datacards Print Grid**: Prints miniature datasheet statistics formatted as standard index cards with page-break boundaries preventing cards from cutting off.

---

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

---

## 🔗 Links to Other Views

- **[Dashboard](./dashboard.md):** The top navigation bar tabs allow switching back to the registry.
- **[Unit Details Modal](./unit_details.md):** Clicking a unit profile name opens the detailed overlay modal to check wargear profiles or run simulator calculations.
- **[Deep Analysis](./deep_analysis.md):** Top navigation tabs switch to the Mathhammer Playground.
