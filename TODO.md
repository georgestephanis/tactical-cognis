# TODO — Unused DB tables → future features

The schema reference ([DB.md](./DB.md)) notes several table families the app doesn't
query yet. This is the integration assessment for each, ranked by payoff-per-effort.
File/line refs are current as of this writing.

## 1. `invulnerable_save` — wire invulns into unit data ✅ display done

**Effort: small. Payoff: high.**

**Done:** `invulnerable_save` is joined in `getUnitsByFaction` (`db.ts`,
miniature-specific row wins over the datasheet-wide fallback), `Statline` carries an
optional `Inv` field, and `UnitDetails` renders an `Inv` cell/pill (e.g. `4++`) after
Sv in both statline blocks. Split melee/ranged invulns collapse to one value —
~1 datasheet uses the split.

**Still open (bigger than "one field"):**

- Auto-filled defender profiles in DeepAnalysis instead of the user typing them in
  (needs a unit picker feeding the target panel).
- Honest durability in the Yield/efficiency rankings — today a 4++ unit and a
  plain 3+ unit with the same Sv score as equally durable (scoring change).

## 2. `datasheet_damage` — populate damaged-vehicle brackets ✅ display done

**Effort: small (display) / large (simulation). Payoff: medium.**

**Done:** `getUnitsByFaction` now queries `datasheet_damage` into
`Datasheet.damageProfiles` (was hardcoded `[]`); the "DAMAGED" section already in
`UnitDetails` lights up automatically.

**Stretch (separate ticket, not started):** bracket-aware mathhammer — degrade the
attacker's statline mid-simulation as it takes wounds. Real work; don't bundle with
the display fix.

## 3. `loadout_choice*` + `wargear_limit*` — wargear swap options ✅ display & mathhammer done

**Effort: medium. Payoff: high (biggest missing feature).**

Today the app only reads the *default* loadout via `base_miniature_loadout` +
`wargear_option` (`src/utils/db.ts:322-372`). There's no swap/choice structure in
the types at all — `Model.weapons` is a flat list. Integrating
`loadout_choice_set` → `loadout_choice` → `loadout_choice_wargear_item` unlocks:

- **ArmyBuilder:** pick loadouts per unit. `wargear_limit` ("X per N models",
  one-per-unit) feeds the existing `validationErrors[]` machinery
  (`src/components/ArmyBuilder.tsx:770-848`) — same pattern as the current
  points/duplicate/warlord checks.
- **UnitDetails:** an "Options" section showing legal swaps.
- **Mathhammer completeness:** swap-only weapons currently never appear in the
  weapon picker, so per-weapon yield analysis silently misses them.

Touch: new types (choice sets on `Model`), `db.ts`, `dataMapper.ts`, roster state
shape in ArmyBuilder, new option-picker UI.

## 4. `allied_faction*` — allies in ArmyBuilder

**Effort: medium. Payoff: medium.**

The BattleForge text importer already recognizes an `ALLIED UNITS` header
(`src/components/ArmyBuilder.tsx:183`) but then merges allied units into the
single-faction roster with no distinct handling. The `allied_faction` family gives
who can ally, which datasheets/keywords they contribute, and points caps — all of
which plug into the existing validation-errors pattern.

Main cost: the builder is scoped to one `factionSlug` throughout; allies break
that assumption, so expect state-shape churn beyond just validation.

## 5. `faq` — errata surfacing

**Effort: small. Payoff: low.**

Errata text with publication links (most entities carry `publicationId`). Could
surface as a note on the FactionBrowser Rules tab or per-datasheet in UnitDetails.
Easy, but it's reference reading rather than analysis — the app's core value.
Defer until someone actually asks for it.

## 6. Missions family (`primary_mission*`, `secondary_mission*`, layouts, twists) — skip for now

**Effort: large. Payoff: speculative.**

These don't connect to any existing view. Using them means building a
mission-reference browser — a new app surface, not an integration. The one table
from this family that *was* worth using is already used: `battle_size`
(`getBattleSizes`, army-construction limits).

Possible future hook if demand appears: "expected VP given my army's OC" — score
`primary_mission_objective_scoring.victoryPoints` against roster OC. Until then,
YAGNI.

## Suggested next PR

The display slices of **1 + 2** are shipped. Next-biggest payoff is item **3**
(`loadout_choice*` wargear swaps) — the largest missing feature — or the still-open
parts of item 1 (DeepAnalysis defender auto-fill, Yield durability scoring) if you
want to finish milking the invuln data first.
