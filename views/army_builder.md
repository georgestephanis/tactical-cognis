# Army Builder

The **Army Builder** view is a comprehensive roster-building workspace. It allows users to create, import, validate, save, and print competitive army lists. It implements live rules enforcement based on active Warhammer 40,000 Battle Forge mechanics.

---

## 📸 Component Reference

- **React Component:** [ArmyBuilder.tsx](file:///Users/georgestephanis/code/tactical-cognis/src/components/ArmyBuilder.tsx)
- **Styling Hooks:** Styled using class definitions in [src/index.css](file:///Users/georgestephanis/code/tactical-cognis/src/index.css) (classes: `.builder-layout`, `.builder-catalog`, `.builder-roster`, `.points-gauge`, `.points-progress-container`, `.points-progress-bar`, `.validation-alert-box`, `.roster-unit-card`, `.nested-leader-wrapper`, `.nested-leader-card`, `.catalog-item`).

---

## 🛠️ Methods & Rendering Logic

### 1. Database Limits & Battle Sizes
- Pulls game configuration limitations from the SQLite database via `getBattleSizes()` on mount.
- Roster sizes are categorized (e.g., Incursion - 1000 pts, Strike Force - 2000 pts, Grand Tournament - 3000 pts).
- The active points limit determines duplicate unit caps (usually max 3 duplicates, or 6 for Battleline units) and enhancement limits (max 3).

### 2. Roster Assembly & Nesting
- **Add/Remove:** Users browse a sidebar catalog of faction units, select points sizing levels, and click "Plus" to add them to the roster.
- **Warlord Flag:** Toggles a single Warlord crown icon on characters.
- **Enhancements:** Renders enhancement options specific to the active detachment and attaches them to characters, appending points automatically.
- **Leader Attachment:** Users can attach a Character to a compatible Bodyguard unit. The component uses the `leads` string arrays from the database to validate compatibility. Attached leaders are styled as nested cards indented under the bodyguard unit.

### 3. Live Validation Engine
The UI audits the roster on every change and displays active warnings:
- **Points Overflow:** If total points exceed the point limit, progress bars shift to red (`.points-progress-danger`).
- **Warlord check:** Flagging if there is no Warlord, or if more than one Warlord is assigned.
- **Duplicate unit limit:** Validates datasheet occurrences. If non-battleline datasheets exceed the limit (e.g., more than 3 of a single unit), it flags an alert.
- **Enhancement caps:** Limits detachment enhancement counts and prevents assigning enhancements to Epic Heroes.

### 4. Roster Import Parser (`parseBattleForgeText`)
A text parser parses raw text exports copy-pasted directly from the official Warhammer 40,000 app:
- Scans headers for faction names using `findFactionSlugByName` and auto-selects the appropriate database faction.
- Parses lines using regular expressions to isolate unit names, total points, model counts, warlord state, and assigned enhancements.
- Instantiates a clean working roster matching the imported list.

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
