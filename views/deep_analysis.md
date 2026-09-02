# Deep Analysis (Mathhammer Playground & Points Matrix)

The **Deep Analysis** view is a global sandbox workspace. It allows users to run custom Mathhammer calculations, compare points efficiency metrics across an entire faction, and coordinate troop transport embarkation synergies.

---

## 📸 Component Reference

- **React Component:** [DeepAnalysis.tsx](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/components/DeepAnalysis.tsx)
- **Styling Hooks:** Uses standard dashboard panels, sub-tab navigators (`.nav-tabs`, `.tab-btn`), inline grid form controls (`.input-group`, `.input-control`), and custom flexbar elements for visual data charts (`.custom-bar-chart`, `.chart-bar-fill`).

---

## 🛠️ Methods & Rendering Logic

### 1. Multi-Mode Analysis
Users choose between three primary analysis workspaces:
- **Mathhammer Playground (`mathhammer`):** A custom weapon and target designer. Users input custom weapon profiles (attacks, BS/WS, strength, AP, damage) and select special weapon traits (Blast, Torrent, Lethal Hits, Twin-Linked, Devastating Wounds, Sustained Hits). They customize target defenses (Toughness, Saves, Invulnerable Saves, Feel No Pain, Unit Size) to simulate expected damage distributions.
- **Points Efficiency Matrix (`efficiency`):** Computes point-yield ratios for every unit in the selected faction against a target preset. Ranks units based on:
  - *Wounds per 100 pts:* Raw durability efficiency.
  - *OC per 100 pts:* Objective control efficiency.
  - *Damage per 100 pts:* Combat output efficiency (simulates all weapons in a unit firing at the selected target preset and scales damage vs points).
- **Synergy & Transport Planner (`synergy`):** Plans troop transport details. The user selects a vehicle with the `TRANSPORT` keyword. The component reads transport rules from the database (e.g., `"This vehicle has a transport capacity of 12 models"`), parses the integer limit, and checks the occupancy of embarked infantry.

### 2. Calculations & Dice Parsing
- Uses `calculateExpectedDamage(mathInput, target)` (defined in [src/utils/mathhammer.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/utils/mathhammer.ts)).
- Parses variable dice expressions (e.g. `'D6'`, `'2D6+3'`, `'D3'`) using mathematical averages (e.g., D6 = 3.5, D3 = 2, 2D6+3 = 10) to support fractional expected damage calculations.
- Evaluates keywords: **Blast** increases attacks based on target unit size; **Lethal Hits** skip wound rolls; **Devastating Wounds** skip saving throws; **Sustained Hits** award bonus hits on roll checks of 6; **Twin-Linked** permits full wound re-rolls.
- Selects conditional weapon profiles via `selectProfilesForTarget(weapon.profiles, target.keywords)`. A weapon with a `Hunter` profile has two mutually exclusive statlines, so only the one applicable to the active target preset is fired — summing both would roughly double that weapon's rated output. Weapons without a Hunter profile keep every profile, as before.
- Evaluates transport occupancy: If embarked models carry `MEGA ARMOUR` or `TERMINATOR` keywords, they count as 2 models toward the vehicle's capacity.
- Excludes Combat Patrol and Warhammer Legends units from the transport/embark pickers.

---

## 🎨 Visual Design & Style Systems

The dashboard uses flex columns and interactive charts:

| CSS Selector | Styling & Visual Effect |
| :--- | :--- |
| `.mathhammer-grid` | 50/50 split dashboard layout dividing weapon configurations and target properties from the results panel. |
| `.custom-bar-chart` | A vertical flex chart showing points-efficiency ratios. |
| `.chart-bar-track` | Progress bar tracks styled with solid backgrounds (`var(--bg-tertiary)`) representing 100% maximum scale. |
| `.chart-bar-fill` | Fills the chart tracks using a gradient indicator (`linear-gradient(90deg, var(--accent-indigo)...)`) matching the ratio scale. |

---

## 📊 Data Specifications

### Input Props
- This view receives no inputs directly, but initializes `/40k.sqlite` on mount to pull the list of active factions.

### Local State Variables
- `subTab` (string): Current analysis mode chosen (`'mathhammer' | 'efficiency' | 'synergy'`).
- `selectedFaction` (string): The slug of the faction loaded for points matrix audits.
- `factionData` (`MergedFaction`): Active faction datasets.
- Playground Inputs: `weaponName`, `attacksExpr`, `bsWs`, `strength`, `ap`, `damageExpr`, rules flags, re-rolls.
- Target Inputs: Custom stats (T, Save, Inv, W, Fnp, Keywords, Unit Size).
- Synergy Inputs: `selectedTransportUnit`, `embarkedUnits` array.

---

## 🔗 Links to Other Views

- **[Dashboard](./dashboard.md):** Switch registry views using top navigation header tabs.
- **[Army Builder](./army_builder.md):** Top navigation header links back to the roster builder.
- **[Unit Details Modal](./unit_details.md):** Clicking unit names in the Points Efficiency lists opens the overlay modal.
