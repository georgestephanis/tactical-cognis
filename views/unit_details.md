# Unit Details Modal

The **Unit Details Modal** is a full-screen overlay component that provides deep tactical statistics for a specific unit. It is accessible from multiple views (Faction Browser, Army Builder, and Deep Analysis) and features a view toggle between the standard Warhammer 40k Datasheet and an interactive Mathhammer Combat Simulator.

---

## 📸 Component Reference

- **React Component:** [UnitDetails.tsx](file:///Users/georgestephanis/code/tactical-cognis/src/components/UnitDetails.tsx)
- **Styling Hooks:** Defined in [src/index.css](file:///Users/georgestephanis/code/tactical-cognis/src/index.css) (classes: `.overlay`, `.detail-modal`, `.datasheet-card-render`, `.datasheet-header-banner`, `.datasheet-stats-row`, `.datasheet-stat-cell`, `.datasheet-weapon-table`, `.datasheet-ability-block`, `.stat-pill`).

---

## 🛠️ Methods & Rendering Logic

### 1. View Toggling
- **Standard Datasheet Mode (`datasheet`):** Recreates the official datasheet layout. Displays model stats (M, T, Sv, Inv, W, Ld, OC), core and faction abilities, weapons lists with standard statlines (Range, A, BS/WS, S, AP, D), composition sizes, points costs, and faction keywords.
- **Tactical Simulator Mode (`tactical`):** An interactive playground. Compiles all weapons from the unit into a selector dropdown. The user selects a weapon profile and applies custom battle modifiers (re-rolls, plus-to-hit/wound adjustments) to run combat math.

### 2. Mathhammer Calculations
When in Simulator mode, the selected weapon profile is run against five standardized enemy defensive presets (`TARGET_PRESETS` in [src/utils/mathhammer.ts](file:///Users/georgestephanis/code/tactical-cognis/src/utils/mathhammer.ts)):
- **GEQ (Guard Equivalent):** T3, 5+ Save, 1 Wound (Infantry)
- **MEQ (Space Marine Equivalent):** T4, 3+ Save, 2 Wounds (Infantry)
- **TEQ (Terminator Equivalent):** T5, 2+/4++ Save, 3 Wounds (Infantry)
- **VEH (Light Vehicle Equivalent):** T10, 3+/5++ Save, 12 Wounds (Vehicle)
- **MON (Monster Equivalent):** T12, 2+/4++ Save, 18 Wounds (Monster)

The simulator runs calculations for:
- **Expected Attacks:** Adjusts for Blast mechanics vs the target unit size.
- **Expected Hits:** Applies skill checks, re-rolls, Torrent auto-hits, and Sustained Hits.
- **Expected Wounds:** Adjusts for Strength vs Toughness, re-rolls, and Lethal Hits.
- **Expected Damage:** Applies AP vs Save/Invulnerable Save, Devastating Wounds (ignores armor), and FNP (Feel No Pain) checks.
- **Expected Points Yield:** Divides expected casualties by the unit's points cost, showing the expected models killed per 100 points of the unit.

---

## 🎨 Visual Design & Style Systems

The overlay uses high-contrast layouts:

| CSS Selector | Styling & Visual Effect |
| :--- | :--- |
| `.overlay` | Full-viewport backing screen (`rgba(4,5,8,0.85)`) with backdrop blur filters. |
| `.detail-modal` | Slide-in card structure (`animation: modalSlideIn 0.3s forwards`) with rounded corners and scrollable bodies. |
| `.datasheet-card-render` | Cyber-frame container styled with a solid gold border (`--accent-gold`) simulating a codex datasheet. |
| `.datasheet-stats-row` | Block stat cells displaying large, bold values for speed and armor values. |
| `.stat-pill` | Square stat tiles used in simulator mode to isolate movement and wounds. |

---

## 📊 Data Specifications

### Input Props
- `unit` (`MergedUnit`): The unified unit data object, containing parsed SQL datasheet schemas, wargear options, and points steps.
- `onClose: () => void`: Closes the modal.

### Simulator State Variables
- `viewMode` (string): Toggle state between `'tactical'` and `'datasheet'`.
- `selectedWeapon` (`Weapon | null`): Selected weapon object.
- `selectedProfile` (`WeaponProfile | null`): Selected weapon profile.
- Modifiers: `hitReRoll` (`'none' | 'ones' | 'all'`), `woundReRoll` (`'none' | 'ones' | 'all'`), `plusToHit` (integer), `plusToWound` (integer).

---

## 🔗 Links to Other Views

- **[Faction Browser](./faction_browser.md):** Closes back to the faction registry where the unit card was clicked.
- **[Army Builder](./army_builder.md):** Closes back to the force roster workspace if opened from a list entry.
