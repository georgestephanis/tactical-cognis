# Unit Details Modal

The **Unit Details Modal** is a full-screen overlay component that provides deep tactical statistics for a specific unit. It is accessible from multiple views (Faction Browser, Army Builder, and Deep Analysis) and features a view toggle between the standard Warhammer 40k Datasheet and an interactive Mathhammer Combat Simulator.

---

## 📸 Component Reference

- **React Component:** [UnitDetails.tsx](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/components/UnitDetails.tsx)
- **Styling Hooks:** Defined in [src/index.css](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/index.css) (classes: `.overlay`, `.detail-modal`, `.datasheet-card-render`, `.datasheet-header-banner`, `.datasheet-stats-row`, `.datasheet-stat-cell`, `.datasheet-weapon-table`, `.datasheet-ability-block`, `.stat-pill`).

---

## 🛠️ Methods & Rendering Logic

### 1. View Toggling
- **Standard Datasheet Mode (`datasheet`):** Recreates the official datasheet layout. Displays model stats (M, T, Sv, Inv, W, Ld, OC), core and faction abilities, weapons lists with standard statlines (Range, A, BS/WS, S, AP, D), composition sizes, points costs, and faction keywords. The **Wargear Options** section also shows the official "you may replace X with Y" prose from the DB (`wargear_rule.rulesText`, exposed as `datasheet.wargearRules`) above the structured choice list.
- **Tactical Simulator Mode (`tactical`):** An interactive playground. Compiles all weapons from the unit into a selector dropdown. The user selects a weapon profile and applies custom battle modifiers (re-rolls, plus-to-hit/wound adjustments) to run combat math.

### 2. Mathhammer Calculations
When in Simulator mode, the selected weapon profile is run against five standardized enemy defensive presets (`TARGET_PRESETS` in [src/utils/mathhammer.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/utils/mathhammer.ts)):
- **GEQ (Guard Equivalent):** T3, 5+ Save, 1 Wound, unit size 10 (Light Infantry Equivalent)
- **MEQ (Space Marine Equivalent):** T4, 3+ Save, 2 Wounds, unit size 5 (Medium Infantry Equivalent)
- **TEQ (Terminator Equivalent):** T5, 2+/4++ Save, 3 Wounds, unit size 5 (Heavy Infantry Equivalent)
- **VEQ (Medium Vehicle Equivalent):** T10, 3+ Save (no invulnerable save), 12 Wounds, unit size 1
- **HEAVY (Heavy Vehicle / Monster):** T12, 2+ Save (no invulnerable save), 16 Wounds, unit size 1

**Conditional ("Hunter") profiles.** Some weapons carry a `Hunter` statline that is only usable against targets with specific keywords (e.g. `MONSTER`/`VEHICLE`), paired with a `Standard` statline for everything else. Where such a profile exists:
- The datasheet weapon table badges it with the condition (`vs MONSTER/VEHICLE`).
- In the simulator, preset rows the selected profile cannot legally target are greyed out and show *"Profile not usable — requires …"* instead of damage figures, via `profileAppliesToTarget()`.

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
