/**
 * Print-ordering tests for the roster export.
 *
 * Covers `groupAttachedEntries`, which decides the hierarchy of the tabular
 * export: a bodyguard squad is the top-level row, with its attached Leader and
 * Support characters nested beneath it.
 *
 * Placeholder unit names only — no Games Workshop content (see CLAUDE.md).
 */
import { groupAttachedEntries } from '../src/utils/rosterPrint';
import type { AttachableEntry } from '../src/utils/rosterPrint';
import type { RosterUnit, MergedUnit } from '../src/types/data';
import type { MergedFaction } from '../src/utils/dataMapper';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

/** Minimal RosterUnit stub — only the fields the grouping logic reads. */
function unit(id: string, name: string, isCharacter: boolean, attachedToId?: string): RosterUnit {
  return {
    id,
    unitSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    points: 100,
    modelsCount: 1,
    isCharacter,
    selectedCostIndex: 0,
    attachedToId: attachedToId ?? null,
  } as unknown as RosterUnit;
}

function entry(u: RosterUnit): AttachableEntry {
  return { id: u.id, unit: u, count: 1, pointsRange: '100' };
}

/**
 * Faction stub where the named slugs carry a "Support" datasheet rule, which is
 * how a Support character is distinguished from a Leader.
 */
function faction(supportSlugs: string[]): MergedFaction {
  const mk = (slug: string): MergedUnit => ({
    name: slug,
    slug,
    appDatasheet: { rules: [{ name: 'Support', rules: '' }] },
  } as unknown as MergedUnit);
  return { units: supportSlugs.map(mk), alliedUnits: [] } as unknown as MergedFaction;
}

console.log('Roster Print Ordering Unit Tests...\n');

// ============================================================
// 1. Squad with a Leader — squad is the parent
// ============================================================
console.log('Testing: Squad with attached Leader');
{
  const squad = unit('squad-1', 'Alpha Squad', false);
  const leader = unit('leader-1', 'Alpha Leader', true, 'squad-1');
  const rows = groupAttachedEntries([entry(squad), entry(leader)], faction([]));

  assert(rows.length === 2, 'two rows returned');
  assert(rows[0].unit.id === 'squad-1', 'squad is first');
  assert(rows[0].indent === false, 'squad is top level');
  assert(rows[0].roleLabel === 'Bodyguard Squad', 'squad labelled Bodyguard Squad');
  assert(rows[1].unit.id === 'leader-1', 'leader follows the squad');
  assert(rows[1].indent === true, 'leader is nested');
  assert(rows[1].roleLabel === 'Attached Leader', 'leader labelled Attached Leader');
}
console.log('  ✅ Squad with attached Leader: PASS');

// ============================================================
// 2. Squad with ONLY a Support character (the reported bug)
// ============================================================
console.log('Testing: Squad with Support but no Leader');
{
  const squad = unit('squad-1', 'Alpha Squad', false);
  const support = unit('sup-1', 'Alpha Support', true, 'squad-1');
  const rows = groupAttachedEntries([entry(squad), entry(support)], faction(['alpha-support']));

  assert(rows.length === 2, 'two rows returned');
  // Previously the squad was emitted indented with no parent above it.
  assert(rows[0].unit.id === 'squad-1', 'squad is first even with no Leader');
  assert(rows[0].indent === false, 'squad is top level even with no Leader');
  assert(rows[1].unit.id === 'sup-1', 'support follows the squad');
  assert(rows[1].indent === true, 'support is nested');
  assert(rows[1].roleLabel === 'Support Character', 'support labelled Support Character');
  assert(!rows.some(r => r.indent && r.unit.id === 'squad-1'), 'squad is never orphaned under nothing');
}
console.log('  ✅ Squad with Support but no Leader: PASS');

// ============================================================
// 3. Squad with both — Leader ordered before Support
// ============================================================
console.log('Testing: Leader ordered before Support');
{
  const squad = unit('squad-1', 'Alpha Squad', false);
  const support = unit('sup-1', 'Alpha Support', true, 'squad-1');
  const leader = unit('leader-1', 'Alpha Leader', true, 'squad-1');
  // Support deliberately listed first to prove ordering isn't input-order.
  const rows = groupAttachedEntries(
    [entry(squad), entry(support), entry(leader)],
    faction(['alpha-support'])
  );

  assert(rows.length === 3, 'three rows returned');
  assert(rows[0].unit.id === 'squad-1' && !rows[0].indent, 'squad is top level');
  assert(rows[1].unit.id === 'leader-1', 'leader nested first');
  assert(rows[2].unit.id === 'sup-1', 'support nested after leader');
  assert(rows[1].indent && rows[2].indent, 'both attachments nested');
}
console.log('  ✅ Leader ordered before Support: PASS');

// ============================================================
// 4. Unattached units are independent rows
// ============================================================
console.log('Testing: Independent units');
{
  const loneSquad = unit('squad-2', 'Beta Squad', false);
  const loneChar = unit('char-2', 'Beta Character', true);
  const rows = groupAttachedEntries([entry(loneSquad), entry(loneChar)], faction([]));

  assert(rows.length === 2, 'two rows returned');
  assert(rows.every(r => !r.indent), 'no independent row is indented');
  assert(
    rows.find(r => r.unit.id === 'squad-2')?.roleLabel === 'Independent Squad',
    'lone squad labelled Independent Squad'
  );
  assert(
    rows.find(r => r.unit.id === 'char-2')?.roleLabel === 'Independent Character',
    'lone character labelled Independent Character'
  );
}
console.log('  ✅ Independent units: PASS');

// ============================================================
// 5. Every entry appears exactly once
// ============================================================
console.log('Testing: No dropped or duplicated entries');
{
  const squadA = unit('sq-a', 'Alpha Squad', false);
  const leadA = unit('ld-a', 'Alpha Leader', true, 'sq-a');
  const squadB = unit('sq-b', 'Beta Squad', false);
  const supB = unit('sp-b', 'Beta Support', true, 'sq-b');
  const lone = unit('lone', 'Gamma Squad', false);

  const input = [entry(squadA), entry(leadA), entry(squadB), entry(supB), entry(lone)];
  const rows = groupAttachedEntries(input, faction(['beta-support']));

  assert(rows.length === input.length, 'row count matches input count');
  const ids = rows.map(r => r.unit.id).sort();
  assert(new Set(ids).size === ids.length, 'no duplicate rows');
  assert(
    ['ld-a', 'lone', 'sp-b', 'sq-a', 'sq-b'].every(id => ids.includes(id)),
    'every input entry is present'
  );
  // Each nested row must be preceded by its squad.
  rows.forEach((r, i) => {
    if (!r.indent) return;
    const parentIdx = rows.findIndex(x => x.unit.id === r.unit.attachedToId);
    assert(parentIdx >= 0 && parentIdx < i, `nested ${r.unit.id} appears after its squad`);
  });
}
console.log('  ✅ No dropped or duplicated entries: PASS');

console.log('\nAll Roster Print Ordering Tests Completed Successfully! 🎉');
