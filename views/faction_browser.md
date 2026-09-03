# Faction Browser

The **Faction Browser** view compiles intelligence profiles for a single selected Warhammer 40k faction. It acts as an interactive ledger divided into four main functional dashboards: Factions Units Registry, Combat Detachments, Faction Rules, and Point Yield efficiency rankings.

---

## 📸 Component Reference

- **React Component:** [FactionBrowser.tsx](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/components/FactionBrowser.tsx)
- **Styling Hooks:** Utilizes standard sub-navigation classes (`.nav-tabs`, `.tab-btn`), filter control badges, and custom print rules (`.print-cards-grid`, `.id1-datacard`).

---

## 🛠️ Methods & Rendering Logic

### 1. Data Merging & Synchronization
On mount or whenever `factionSlug` shifts, `loadAndMergeFaction(factionSlug)` runs a series of SQL queries to extract all datasheets, models, weapons, base wargear loadouts, rules, stratagems, and enhancements associated with that faction's keywords.

### 2. Multi-Tab Navigation
Users toggle between four workspace panels:
- **Units Registry (`units`):** Lists all profiles. Supports keyword filtering (Characters, Infantry, Vehicles, Monsters, Legends, etc.) and search filtering. Combat Patrol and Warhammer Legends datasheets are hidden by default behind *Include Combat Patrol* / *Include Legends* toggles; Legends units are badged where shown, and selecting the **Legends** role tab reveals them regardless of the toggle.
- **Bulk print selection:** *Select all shown (N)* adds every unit the filters are currently displaying to the print selection, which is the easy path to a whole faction's reference cards. Because it selects what's *shown*, the **Include Combat Patrol** and **Include Legends** toggles decide whether those units come along — so the same button covers "with" and "without" without needing separate controls. *Print datasheet cards (N)* opens the print slate straight onto the Datasheet Cards layout, and *Clear* empties the selection.
- **Detachments (`detachments`):** Lists army detachments. Uses an accordion toggle state `expandedDetachment` to show/hide rules, custom stratagem profiles, and enhancement point costs. Each detachment is badged with its force disposition, and a detachment offering a choice of dispositions is badged as such.
- **Faction Rules (`rules`):** Collects and displays army-wide rule modifications by filtering abilities marked with the `'faction'` keyword type across all loaded datasheets.
- **Yield Analysis (`yield`):** A custom points-efficiency matrix showing mathematical ratios: Wounds per Point (x100) and OC per Point (x100) calculated by dividing total unit counts by average composition prices.

### 3. Print Compilation & Layouts
Users can check cards to select units and open a **Print Preview Modal**:
- Compiles the selected units into a printable stylesheet layout.
- Supports two print layouts: **Skim** (compact reference tables) and **Cards** (prints standard ID1 pocket-sized datacards).
- Automatically triggers native browser print rules (`@media print`) which hide navigation bars, headers, and footer bars to generate pure black-and-white printouts.

**Print isolation.** The view's root element carries a `.view-root` marker class. In print, everything under `.view-root` is `display: none` except the print slate overlay (`.print-slate-overlay`), and only `#print-slate-root` (and its descendants) is set `visibility: visible`. Previously the whole `.app-container`/`main` ancestor chain was re-shown, which — because `visibility` inherits — also re-showed anything in the underlying view not covered by the hand-maintained `display: none` hide-list (e.g. the faction card grid, including its `.is-selected` glow, printed underneath the Quick Skim table). The `.view-root` marker makes isolation structural instead of enumerated: it covers any current or future view content without needing a new selector added here each time.

---

## 🎨 Visual Design & Style Systems

| CSS Selector | Styling & Visual Effect |
| :--- | :--- |
| `.tab-btn.active` | Highlights the active sub-tab with a gold background (`--accent-gold`) and glow box-shadow. |
| `.faction-card` | Displays name, publication origin, type tags (character, vehicle, infantry), and a quick-view grid of baseline stats (M, T, Sv, W, OC). |
| `.card-select-checkbox` | Absolute positioned checkbox in the upper right corner to compile print lists without triggering unit details modals. |
| `.print-cards-grid` | Arranges printable ID1 datacards into two-column grids matching standard physical formats (85.60mm x 53.98mm). |
| `.id1-datacard` | Highly structured, high-contrast pocket cards built with compact table stats (6.5pt font size) and weapons text truncation. |

---

## 📊 Data Specifications

### Input Props
- `factionSlug` (string): The lowercase faction slug (e.g., `'orks'`).
- `onBack: () => void`: Resets the workspace view to the dashboard.
- `onSelectUnit: (unit: MergedUnit) => void`: Callback triggered when clicking a unit card (opens the details modal).
- `appDataVersion` (number): App data sync code displayed in the header.

### Main State Variables
- `factionData` (`MergedFaction | null`): Holds units list, detachments list, faction names, and rules.
- `activeTab` (string): Current tab selected (`'units' | 'detachments' | 'rules' | 'yield'`).
- `selectedUnits` (`MergedUnit[]`): Accumulates checked units for custom print sheets.
- `expandedDetachment` (string | null): Active detachment ID shown in the accordion.
- `showCombatPatrol` / `showLegends` (boolean): Opt-in toggles for the two hidden-by-default datasheet classes.

---

## 🔗 Links to Other Views

- **[Dashboard](./dashboard.md):** Clicking "Registry" or triggering `onBack` returns the user to the lobby screen.
- **[Unit Details Modal](./unit_details.md):** Clicking any unit card triggers `onSelectUnit(unit)` which loads the overlay modal.
