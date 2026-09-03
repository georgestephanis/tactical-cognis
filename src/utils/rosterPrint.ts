/**
 * Pure helpers for laying out a roster on printed output.
 *
 * Kept out of the component file so the ordering rules can be unit-tested
 * without pulling React in, and so `react-refresh` isn't tripped by a
 * non-component export.
 */
import type { RosterUnit } from '../types/data';
import type { MergedFaction } from './dataMapper';

/** A row in the printable roster: a unit plus its indentation and role. */
export interface PrintableUnitWrapper {
  unit: RosterUnit;
  indent: boolean;
  roleLabel?: string;
  count: number;
  pointsRange: string;
}

/** One roster entry (single unit, or a collapsed group of identical units). */
export interface AttachableEntry {
  id: string;
  unit: RosterUnit;
  count: number;
  pointsRange: string;
}

/**
 * Orders roster entries for printing, nesting attachments under the squad they
 * are attached to.
 *
 * The **bodyguard squad is the top-level row**, with its attached Leader and
 * Support characters indented beneath it. The squad is the thing that physically
 * exists on the table and the thing attachments attach *to*, so it reads as the
 * parent — and, unlike leader-first ordering, it stays correct when a squad has
 * a Support character but no Leader (which previously left the squad indented
 * beneath nothing).
 *
 * Entries with no attachment relationship follow as independent rows.
 */
export function groupAttachedEntries(
  entries: AttachableEntry[],
  factionData: MergedFaction | null
): PrintableUnitWrapper[] {
  const result: PrintableUnitWrapper[] = [];
  const handled = new Set<string>();

  const isSupport = (entry: AttachableEntry) => {
    const cat = factionData?.units.find(u => u.slug === entry.unit.unitSlug)
      || factionData?.alliedUnits?.find(u => u.slug === entry.unit.unitSlug);
    return cat?.appDatasheet?.rules?.some(r => r.name.toLowerCase() === 'support') || false;
  };

  entries.filter(e => !e.unit.isCharacter).forEach(squad => {
    const attached = entries.filter(e => e.unit.attachedToId === squad.id);
    if (attached.length === 0) return;

    result.push({
      unit: squad.unit,
      indent: false,
      roleLabel: 'Bodyguard Squad',
      count: squad.count,
      pointsRange: squad.pointsRange
    });
    handled.add(squad.id);

    // Leaders before Support characters, both nested under the squad.
    const nested: [AttachableEntry, string][] = [
      ...attached.filter(e => !isSupport(e)).map(e => [e, 'Attached Leader'] as [AttachableEntry, string]),
      ...attached.filter(e => isSupport(e)).map(e => [e, 'Support Character'] as [AttachableEntry, string])
    ];
    nested.forEach(([entry, roleLabel]) => {
      result.push({
        unit: entry.unit,
        indent: true,
        roleLabel,
        count: entry.count,
        pointsRange: entry.pointsRange
      });
      handled.add(entry.id);
    });
  });

  entries.forEach(entry => {
    if (handled.has(entry.id)) return;
    result.push({
      unit: entry.unit,
      indent: false,
      roleLabel: entry.unit.isCharacter ? 'Independent Character' : 'Independent Squad',
      count: entry.count,
      pointsRange: entry.pointsRange
    });
    handled.add(entry.id);
  });

  return result;
}
