import type { Datasheet, Model, RosterUnit, Weapon } from '../types/data';

/**
 * Pure loadout resolution and pricing.
 *
 * Lives outside `ArmyBuilder.tsx` so it can be unit-tested without React, and
 * because `react-refresh` rejects non-component exports from a component file.
 */

/**
 * Resolves the count of each miniature model type in a squad, handling both fixed models (like characters/sergeants)
 * and scaling models (like standard troops) based on the unit's active composition and current squad size.
 */
export function getRosterUnitModelCounts(unit: RosterUnit, datasheet: Datasheet): Record<string, number> {
  const comp = datasheet.compositions[unit.compositionIndex ?? unit.selectedCostIndex];
  if (!comp || !comp.models) {
    const counts: Record<string, number> = {};
    const firstModelId = datasheet.models[0]?.id;
    datasheet.models.forEach(model => {
      counts[model.name] = model.id === firstModelId ? unit.modelsCount : 0;
    });
    return counts;
  }

  const counts: Record<string, number> = {};
  let scalingModelName: string | null = null;
  let fixedCountSum = 0;

  comp.models.forEach(cm => {
    if (cm.min === cm.max) {
      counts[cm.miniature] = cm.min;
      fixedCountSum += cm.min;
    } else {
      scalingModelName = cm.miniature;
    }
  });

  if (scalingModelName) {
    counts[scalingModelName] = Math.max(0, unit.modelsCount - fixedCountSum);
  } else {
    // If all models are marked fixed but don't add up to the squad size,
    // scale the one with the largest max
    const scaling = [...comp.models].sort((a, b) => b.max - a.max)[0];
    if (scaling) {
      counts[scaling.miniature] = Math.max(0, unit.modelsCount - (fixedCountSum - scaling.min));
    }
  }

  return counts;
}

/**
 * Calculates active weapons for a model in a squad, taking counts into account.
 * Overlapping choices replace default weapons, while non-overlapping choices are added.
 */
export function getActiveWeapons(
  wargearCounts: Record<string, number>,
  model: Model,
  totalModelCount: number,
  isFirstActiveModel: boolean = true
): Weapon[] {
  if (!model.weapons) return [];

  const sets = model.wargearChoiceSets || [];
  if (sets.length === 0) {
    return model.weapons.map(w => ({ ...w, count: w.count * totalModelCount }));
  }

  const activeWeapons: Weapon[] = [];

  // Track remaining counts of each default weapon individually
  const defaultWeaponRemaining = new Map<string, number>();
  model.weapons.forEach(w => {
    defaultWeaponRemaining.set(w.name, w.count * totalModelCount);
  });

  // Separate choice sets into replacement sets (swaps) and addition sets
  const replacementSets = sets.filter(set =>
    set.alternate || set.choices.some(choice =>
      choice.items.some(item => model.weapons.some(w => w.name === item.name))
    )
  );

  const additionSets = sets.filter(set => !replacementSets.includes(set));

  // Process replacement sets
  replacementSets.forEach(set => {
    const maxAllowedForSet = set.miniatureId ? (set.limit * totalModelCount) : set.limit;
    let remainingAllowed = Math.min(totalModelCount, maxAllowedForSet);
    let actualSelectedCount = 0;

    // Add selected weapons
    set.choices.forEach(choice => {
      const count = wargearCounts[choice.id] || 0;
      // We don't add weapons if this choice is the default option itself
      const isDefaultChoice = choice.items.every(item => model.weapons.some(w => w.name === item.name));
      if (isDefaultChoice) return;

      const allowedCount = Math.min(count, remainingAllowed);
      if (allowedCount > 0) {
        actualSelectedCount += allowedCount;
        remainingAllowed -= allowedCount;
        choice.items.forEach(item => {
          const existing = activeWeapons.find(w => w.name === item.name);
          if (existing) {
            existing.count += item.count * allowedCount;
          } else {
            activeWeapons.push({
              name: item.name,
              wargearType: item.wargearType,
              count: item.count * allowedCount,
              profiles: item.profiles,
              wargearItemId: item.wargearItemId
            });
          }
        });
      }
    });

    // Reduce the count of the default weapons replaced by this choice set
    const replacedDefaultWeapons = set.alternate
      ? model.weapons
      : model.weapons.filter(w =>
          set.choices.some(choice => choice.items.some(item => item.name === w.name))
        );

    replacedDefaultWeapons.forEach(w => {
      const currentRemaining = defaultWeaponRemaining.get(w.name) || 0;
      const reduction = w.count * actualSelectedCount;
      defaultWeaponRemaining.set(w.name, Math.max(0, currentRemaining - reduction));
    });
  });

  // Now add the default weapons that are still remaining
  model.weapons.forEach(w => {
    const remaining = defaultWeaponRemaining.get(w.name) || 0;
    if (remaining > 0) {
      const existing = activeWeapons.find(aw => aw.name === w.name);
      if (existing) {
        existing.count += remaining;
      } else {
        activeWeapons.push({
          ...w,
          count: remaining
        });
      }
    }
  });

  // Process addition sets (e.g. Ammo Runts, Grot Orderlies, Seeker Missiles)
  additionSets.forEach(set => {
    // If it's a unit-wide option, only add it if this is the first active model being processed
    if (!set.miniatureId && !isFirstActiveModel) {
      return;
    }
    set.choices.forEach(choice => {
      const count = wargearCounts[choice.id] || 0;
      if (count > 0) {
        choice.items.forEach(item => {
          const existing = activeWeapons.find(w => w.name === item.name);
          if (existing) {
            existing.count += item.count * count;
          } else {
            activeWeapons.push({
              name: item.name,
              wargearType: item.wargearType,
              count: item.count * count,
              profiles: item.profiles,
              wargearItemId: item.wargearItemId
            });
          }
        });
      }
    });
  });

  return activeWeapons;
}

/** Thin wrapper over {@link getActiveWeapons} for callers that hold a roster unit. */
export function getUnitActiveWeapons(
  unit: RosterUnit,
  model: Model,
  totalModelCount: number,
  isFirstActiveModel: boolean = true
): Weapon[] {
  return getActiveWeapons(unit.wargearCounts || {}, model, totalModelCount, isFirstActiveModel);
}

/**
 * Per-model surcharge for taking one wargear choice, or 0 when it is free.
 *
 * Used to annotate the Army Builder's pickers; the authoritative cost still comes
 * from {@link getLoadoutWargearPoints} over the resolved loadout.
 */
export function getChoicePoints(
  ds: Datasheet,
  miniatureId: string,
  choice: { items: { wargearItemId: string; count: number }[] }
): number {
  const byItem = ds.wargearOptionPoints?.[miniatureId];
  if (!byItem) return 0;
  return choice.items.reduce((sum, item) => sum + (byItem[item.wargearItemId] || 0) * item.count, 0);
}

/**
 * Total wargear surcharge for one resolved loadout.
 *
 * 11th edition reintroduced paid wargear: a unit costs its composition points plus
 * the price of every item it is equipped with, *including* the default loadout (a
 * Ravager is 110 + three 5pt dark lances = 125). Pass `wargearCounts = null` to
 * price the untouched default loadout, which is what `getDatasheetCosts` folds into
 * the tier price; pass a roster unit's counts to price what it is actually carrying.
 * The difference between the two is the surcharge the Army Builder adds on top.
 *
 * Returns 0 when the datasheet carries no pricing — i.e. all its wargear is free, or
 * the DB predates `wargear_option.points`.
 */
export function getLoadoutWargearPoints(
  ds: Datasheet,
  modelCounts: Record<string, number>,
  wargearCounts: Record<string, number> | null
): number {
  const prices = ds.wargearOptionPoints;
  if (!prices) return 0;

  let total = 0;
  let isFirstActiveModel = true;

  ds.models.forEach(model => {
    const count = modelCounts[model.name] || 0;
    if (count <= 0) return;

    const byItem = prices[model.id];

    // Even an unpriced model has to be walked when counts are supplied, so that
    // unit-wide addition sets are still attributed to the first *active* model
    // exactly as they are when rendering the loadout.
    const weapons = wargearCounts
      ? getActiveWeapons(wargearCounts, model, count, isFirstActiveModel)
      : (model.weapons || []).map(w => ({ ...w, count: w.count * count }));
    isFirstActiveModel = false;

    if (!byItem) return;
    weapons.forEach(w => {
      const price = w.wargearItemId ? byItem[w.wargearItemId] : undefined;
      if (price) total += price * w.count;
    });
  });

  return total;
}
