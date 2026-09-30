/**
 * Wargear pricing tests.
 *
 * Covers `getLoadoutWargearPoints`, which turns a resolved loadout into the points
 * surcharge that 11th edition reintroduced (`wargear_option.points`). The Army
 * Builder charges the difference between a unit's actual loadout and its default
 * one, so both the baseline and the delta have to come out right — including when
 * a swap is to a *free* item, which must reduce the cost.
 *
 * Placeholder names and invented prices only — no Games Workshop content
 * (see CLAUDE.md).
 */
import { getLoadoutWargearPoints, getChoicePoints, getRosterUnitModelCounts } from '../src/utils/loadout';
import { getDatasheetCosts } from '../src/utils/dataMapper';
import type { Datasheet, Model, RosterUnit, WargearChoice, WargearChoiceSet } from '../src/types/data';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertEq(actual: number, expected: number, msg: string) {
  assert(actual === expected, `${msg} (expected ${expected}, got ${actual})`);
}

const SQUADDIE = 'mini-squaddie';
const BOSS = 'mini-boss';

const ITEM_BASIC = 'item-basic';      // free default weapon
const ITEM_FANCY = 'item-fancy';      // 5pt upgrade
const ITEM_PLAIN = 'item-plain';      // free alternative

function choice(id: string, itemId: string, name: string, count = 1): WargearChoice {
  return {
    id,
    items: [{ wargearItemId: itemId, name, wargearType: 'weapon', count, profiles: [] }],
  };
}

function choiceSet(id: string, miniatureId: string | null, choices: WargearChoice[]): WargearChoiceSet {
  return { id, limit: 1, allowDuplicates: false, alternate: false, choices, miniatureId };
}

function model(id: string, name: string, sets: WargearChoiceSet[]): Model {
  return {
    id,
    name,
    statlineHidden: false,
    stats: {},
    keywords: [],
    weapons: [{ name: 'Basic Gun', wargearType: 'weapon', count: 1, profiles: [], wargearItemId: ITEM_BASIC }],
    wargearChoiceSets: sets,
  } as unknown as Model;
}

/**
 * Two miniatures, each able to swap its free default gun for either a 5pt item or
 * a free one. Prices are declared per-miniature, as the DB stores them.
 */
function datasheet(priced = true): Datasheet {
  const mkSets = (miniId: string): WargearChoiceSet[] => [
    choiceSet(`set-${miniId}`, miniId, [
      choice(`choice-${miniId}-basic`, ITEM_BASIC, 'Basic Gun'),
      choice(`choice-${miniId}-fancy`, ITEM_FANCY, 'Fancy Gun'),
      choice(`choice-${miniId}-plain`, ITEM_PLAIN, 'Plain Gun'),
    ]),
  ];
  return {
    id: 'ds-test',
    name: 'Test Squad',
    models: [model(BOSS, 'Boss', mkSets(BOSS)), model(SQUADDIE, 'Squaddie', mkSets(SQUADDIE))],
    compositions: [],
    wargearOptionPoints: priced
      ? { [BOSS]: { [ITEM_FANCY]: 5 }, [SQUADDIE]: { [ITEM_FANCY]: 5 } }
      : undefined,
  } as unknown as Datasheet;
}

const COUNTS = { Boss: 1, Squaddie: 3 };

// --- Default loadout is free here, so the baseline is zero ---------------------
console.log('Testing: free default loadout prices at 0');
assertEq(getLoadoutWargearPoints(datasheet(), COUNTS, null), 0, 'default loadout');
console.log('  ✅ PASS');

// --- Priced default loadout is charged per model ------------------------------
console.log('Testing: priced default loadout is charged for every model');
const pricedDefault = datasheet();
// Make the *default* gun cost 2 for squaddies only.
pricedDefault.wargearOptionPoints![SQUADDIE][ITEM_BASIC] = 2;
assertEq(getLoadoutWargearPoints(pricedDefault, COUNTS, null), 6, '3 squaddies x 2pts');
console.log('  ✅ PASS');

// --- Taking a paid upgrade raises the cost ------------------------------------
console.log('Testing: paid upgrade adds points per model taking it');
const ds = datasheet();
const oneFancy = getLoadoutWargearPoints(ds, COUNTS, { [`choice-${SQUADDIE}-fancy`]: 1 });
assertEq(oneFancy, 5, 'one squaddie upgraded');
const allFancy = getLoadoutWargearPoints(ds, COUNTS, { [`choice-${SQUADDIE}-fancy`]: 3 });
assertEq(allFancy, 15, 'three squaddies upgraded');
console.log('  ✅ PASS');

// --- Swapping a paid default for a free item is a *reduction* -----------------
console.log('Testing: swapping a paid default for a free item reduces the cost');
const paidDs = datasheet();
paidDs.wargearOptionPoints![SQUADDIE][ITEM_BASIC] = 5;
const baseline = getLoadoutWargearPoints(paidDs, COUNTS, null);
const swapped = getLoadoutWargearPoints(paidDs, COUNTS, { [`choice-${SQUADDIE}-plain`]: 3 });
assertEq(baseline, 15, 'baseline: 3 squaddies with 5pt default');
assertEq(swapped, 0, 'all three swapped to the free item');
assert(swapped - baseline === -15, 'delta must be negative when downgrading');
console.log('  ✅ PASS');

// --- Model counts are respected, not just presence ----------------------------
console.log('Testing: only models present in the tier are priced');
assertEq(
  getLoadoutWargearPoints(ds, { Boss: 1, Squaddie: 0 }, { [`choice-${SQUADDIE}-fancy`]: 3 }),
  0,
  'a tier with no squaddies charges nothing for squaddie upgrades'
);
console.log('  ✅ PASS');

// --- Old companion DBs with no `points` column price everything at 0 ----------
console.log('Testing: datasheet without pricing data is free');
const unpriced = datasheet(false);
assertEq(getLoadoutWargearPoints(unpriced, COUNTS, null), 0, 'unpriced baseline');
assertEq(
  getLoadoutWargearPoints(unpriced, COUNTS, { [`choice-${SQUADDIE}-fancy`]: 3 }),
  0,
  'unpriced upgrade'
);
console.log('  ✅ PASS');

// --- Picker annotation --------------------------------------------------------
console.log('Testing: getChoicePoints reports the per-model surcharge');
assertEq(getChoicePoints(ds, SQUADDIE, choice('c', ITEM_FANCY, 'Fancy Gun')), 5, 'paid choice');
assertEq(getChoicePoints(ds, SQUADDIE, choice('c', ITEM_PLAIN, 'Plain Gun')), 0, 'free choice');
assertEq(getChoicePoints(ds, SQUADDIE, choice('c', ITEM_FANCY, 'Fancy Gun', 2)), 10, 'count is multiplied');
assertEq(getChoicePoints(unpriced, SQUADDIE, choice('c', ITEM_FANCY, 'Fancy Gun')), 0, 'unpriced datasheet');
console.log('  ✅ PASS');

// --- Tier price and roster baseline must agree ---------------------------------
// `getDatasheetCosts` folds the default surcharge into a tier's headline price, and
// the Army Builder later subtracts a baseline computed from the roster unit's model
// counts. If the two disagree, every unit with priced default gear drifts by the
// difference. A roster unit's `modelsCount` is always the tier's model total.
console.log('Testing: tier default surcharge matches the roster baseline');
{
  const tiered = datasheet();
  tiered.wargearOptionPoints![SQUADDIE][ITEM_BASIC] = 2;
  tiered.wargearOptionPoints![BOSS][ITEM_BASIC] = 3;
  tiered.compositions = [
    { points: 100, models: [{ miniature: 'Boss', min: 1, max: 1 }, { miniature: 'Squaddie', min: 4, max: 4 }] },
    // A ranged tier: the roster sits at the tier's maximum, which is what is priced.
    { points: 180, models: [{ miniature: 'Boss', min: 1, max: 1 }, { miniature: 'Squaddie', min: 5, max: 9 }] },
  ] as unknown as Datasheet['compositions'];

  const tiers = getDatasheetCosts(tiered);
  assert(tiers.length === 2, 'both tiers priced');
  assertEq(tiers[0].wargearPoints, 3 + 4 * 2, 'fixed tier default surcharge');
  assertEq(tiers[1].wargearPoints, 3 + 9 * 2, 'ranged tier is priced at its maximum');
  assertEq(tiers[1].points, 180 + 21, 'headline price includes the surcharge');

  tiers.forEach((tier, i) => {
    const rosterUnit = { selectedCostIndex: i, modelsCount: tier.models, wargearCounts: {} } as unknown as RosterUnit;
    const counts = getRosterUnitModelCounts(rosterUnit, tiered);
    assertEq(getLoadoutWargearPoints(tiered, counts, null), tier.wargearPoints, `tier ${i} baseline equals folded surcharge`);
    assertEq(
      getLoadoutWargearPoints(tiered, counts, {}) - getLoadoutWargearPoints(tiered, counts, null),
      0,
      `tier ${i}: an untouched loadout adds nothing on top of the tier price`
    );
  });
}
console.log('  ✅ PASS');

// --- Filtered tiers must resolve to the right composition ----------------------
// `selectedCostIndex` indexes the *filtered* cost list, not `Datasheet.compositions`.
// When an earlier composition is ineligible (here: gated on a detachment we are not
// running) the two diverge, and reading `compositions[selectedCostIndex]` would size
// the squad from the wrong tier and misprice its wargear.
console.log('Testing: model counts follow the composition behind a filtered tier');
{
  const gated = datasheet();
  gated.wargearOptionPoints![SQUADDIE][ITEM_BASIC] = 2;
  gated.compositions = [
    { points: 50, requiredDetachmentIds: ['det-other'], models: [{ miniature: 'Boss', min: 1, max: 1 }, { miniature: 'Squaddie', min: 1, max: 1 }] },
    { points: 100, models: [{ miniature: 'Boss', min: 1, max: 1 }, { miniature: 'Squaddie', min: 5, max: 5 }] },
  ] as unknown as Datasheet['compositions'];

  const tiers = getDatasheetCosts(gated, [], 'det-mine');
  assertEq(tiers.length, 1, 'only the ungated composition is eligible');
  assertEq(tiers[0].compositionIndex, 1, 'tier remembers its position in compositions');
  assertEq(tiers[0].wargearPoints, 5 * 2, 'surcharge priced from the eligible composition');

  const unit = { selectedCostIndex: 0, compositionIndex: tiers[0].compositionIndex, modelsCount: tiers[0].models, wargearCounts: {} } as unknown as RosterUnit;
  const counts = getRosterUnitModelCounts(unit, gated);
  assertEq(counts['Squaddie'], 5, 'squad sized from the right composition');
  assertEq(getLoadoutWargearPoints(gated, counts, null), tiers[0].wargearPoints, 'baseline matches the tier surcharge');

  // Units saved before `compositionIndex` existed keep the old lookup rather than crashing.
  const legacy = { selectedCostIndex: 1, modelsCount: 6, wargearCounts: {} } as unknown as RosterUnit;
  assertEq(getRosterUnitModelCounts(legacy, gated)['Squaddie'], 5, 'legacy units fall back to selectedCostIndex');
}
console.log('  ✅ PASS');

console.log('\nAll Wargear Pricing Tests Completed Successfully! 🎉');
