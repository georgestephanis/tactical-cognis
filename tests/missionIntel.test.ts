/**
 * Mission-intel assembly tests for the roster print slate.
 *
 * Covers the pure row-to-shape helpers behind the disposition matchup / layout
 * odds section and the secondary-mission deck. The SQL itself lives in `db.ts`
 * and is exercised against a real database by hand; here we feed the assemblers
 * fake rows.
 *
 * Placeholder names and invented values only — no Games Workshop content
 * (see CLAUDE.md).
 */
import {
  assembleDispositionIntel,
  assembleSecondaryMissions,
  getPresetLetter
} from '../src/utils/missionIntel';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

type Row = Record<string, unknown>;

function matchupRow(opp: string, mission: string, presetId: string | null, layout: string, deployment: string): Row {
  return {
    oppositionDispositionId: `opp-${opp}`,
    oppositionDispositionName: `Posture ${opp}`,
    primaryMissionId: `pm-${mission}`,
    primaryMissionName: `Mission ${mission}`,
    primaryMissionLore: null,
    primaryMissionDescription: 'Hold the ground.',
    presetId,
    presetName: presetId ? `Preset ${presetId}` : null,
    layoutId: presetId ? `layout-${presetId}` : null,
    layoutName: presetId ? layout : null,
    deploymentId: presetId ? `dep-${deployment}` : null,
    deploymentName: presetId ? deployment : null
  };
}

// ============================================================
// 1. getPresetLetter
// ============================================================
console.log('Testing: getPresetLetter');
{
  assert(getPresetLetter('P', 'Posture One - Layout B', 0) === 'B', 'letter read from layout name, not position');
  assert(getPresetLetter('P', 'posture one - layout c ', 5) === 'C', 'case and trailing space tolerated');
  assert(getPresetLetter('Preset - Layout A', 'Unnamed', 2) === 'A', 'falls back to the preset name');
  assert(getPresetLetter('P', 'Unnamed', 1) === 'B', 'falls back to position');
}
console.log('  ✅ PASS');

// ============================================================
// 2. assembleDispositionIntel
// ============================================================
console.log('Testing: assembleDispositionIntel groups matchups and presets');
{
  const rows: Row[] = [
    matchupRow('1', 'X', 'p1', 'Posture 1 - Layout A', 'Alpha Grid'),
    matchupRow('1', 'X', 'p2', 'Posture 1 - Layout B', 'Beta Front'),
    matchupRow('2', 'Y', 'p3', 'Posture 2 - Layout A', 'Alpha Grid'),
    // The recommended-preset join can repeat a preset; it must be listed once.
    matchupRow('2', 'Y', 'p3', 'Posture 2 - Layout A', 'Alpha Grid')
  ];
  const scoring: Row[] = [
    { primaryMissionId: 'pm-X', objectiveId: 'o1', objectiveName: 'Hold', whenText: 'End of turn', objectiveOrder: 1,
      scoringId: 's1', scoringCriteria: 'One objective', victoryPoints: 4, isCumulative: 1, scoringOrder: 1 },
    { primaryMissionId: 'pm-X', objectiveId: 'o1', objectiveName: 'Hold', whenText: 'End of turn', objectiveOrder: 1,
      scoringId: 's2', scoringCriteria: 'Two objectives', victoryPoints: 8, isCumulative: 0, scoringOrder: 2 },
    { primaryMissionId: 'pm-X', objectiveId: 'o2', objectiveName: 'Raid', whenText: null, objectiveOrder: 2,
      scoringId: 's3', scoringCriteria: 'Raze it', victoryPoints: 3, isCumulative: 0, scoringOrder: 1 }
  ];

  const intel = assembleDispositionIntel('disp-me', 'My Posture', rows, scoring, ['Alpha Grid', 'Beta Front', 'Unused Line'])!;

  assert(intel.friendlyDispositionId === 'disp-me' && intel.friendlyDispositionName === 'My Posture', 'identity carried through');
  assert(intel.matchups.length === 2, 'one matchup per opposing posture');
  assert(intel.matchups[0].presets.length === 2, 'posture 1 lists both presets');
  assert(intel.matchups[1].presets.length === 1, 'duplicate preset collapsed');
  assert(intel.totalPresets === 3, 'total counts distinct presets');

  const objs = intel.matchups[0].primaryMission.objectives;
  assert(objs.length === 2, 'two objectives on mission X');
  assert(objs[0].scoring.length === 2, 'both scoring lines grouped under their objective');
  assert(objs[0].scoring[0].isCumulative === true && objs[0].scoring[1].isCumulative === false, 'cumulative flag coerced');
  assert(objs[0].scoring[1].victoryPoints === 8, 'victory points numeric');
  assert(objs[1].whenText === null, 'null whenText preserved');
  assert(intel.matchups[1].primaryMission.objectives.length === 0, 'mission with no scoring rows has no objectives');

  // Layout odds: Alpha Grid 2 of 3, Beta Front 1 of 3, Unused Line never.
  assert(intel.deploymentFrequencies[0].deploymentName === 'Alpha Grid' && intel.deploymentFrequencies[0].percentage === 67, 'most likely first');
  assert(intel.deploymentFrequencies[1].deploymentName === 'Beta Front' && intel.deploymentFrequencies[1].percentage === 33, 'second most likely');
  assert(intel.neverEncounteredDeployments.length === 1 && intel.neverEncounteredDeployments[0] === 'Unused Line', 'never list');
}
console.log('  ✅ PASS');

console.log('Testing: assembleDispositionIntel edge cases');
{
  assert(assembleDispositionIntel('d', 'D', [], [], ['Alpha Grid']) === null, 'no matchup rows yields null');

  // A matchup whose preset columns are all NULL (LEFT JOIN with no presets) still appears.
  const noPresets = assembleDispositionIntel('d', 'D', [matchupRow('1', 'X', null, '', '')], [], ['Alpha Grid'])!;
  assert(noPresets.matchups.length === 1 && noPresets.matchups[0].presets.length === 0, 'matchup kept without presets');
  assert(noPresets.totalPresets === 0, 'no presets counted');
  assert(noPresets.neverEncounteredDeployments[0] === 'Alpha Grid', 'everything is "never" when there are no presets');

  // Deployment universe failed to load: odds still work, "never" list is empty (not guessed).
  const noUniverse = assembleDispositionIntel('d', 'D', [matchupRow('1', 'X', 'p1', 'L - Layout A', 'Alpha Grid')], [], [])!;
  assert(noUniverse.deploymentFrequencies.length === 1 && noUniverse.deploymentFrequencies[0].percentage === 100, 'seen deployment still reported');
  assert(noUniverse.neverEncounteredDeployments.length === 0, 'no invented never-list');
}
console.log('  ✅ PASS');

// ============================================================
// 3. assembleSecondaryMissions
// ============================================================
console.log('Testing: assembleSecondaryMissions');
{
  const missions: Row[] = [
    { id: 'sm1', name: 'Fixed One', lore: 'Flavour', description: 'Rules', isFixedSecondary: 1, isScorableFirstTurn: 0 },
    { id: 'sm2', name: 'Tactical Two', lore: null, description: null, isFixedSecondary: 0, isScorableFirstTurn: 1 }
  ];
  const objectives: Row[] = [
    { secondaryMissionId: 'sm1', objectiveId: 'o1', objectiveName: 'Score', whenText: 'Your turn', scoringId: 's1',
      scoringCriteria: 'Do a thing', victoryPoints: 5, isCumulative: 0 },
    { secondaryMissionId: 'sm1', objectiveId: 'o1', objectiveName: 'Score', whenText: 'Your turn', scoringId: 's2',
      scoringCriteria: 'Do it twice', victoryPoints: 8, isCumulative: 1 }
  ];
  const actions: Row[] = [
    { secondaryMissionId: 'sm1', actionId: 'a1', name: 'Survey', startsText: 'Start', completesText: 'End', effectText: 'Effect', restrictionText: null },
    { secondaryMissionId: 'sm1', actionId: 'a2', name: 'Survey II', startsText: 'S', completesText: 'C', effectText: 'E', restrictionText: 'Not in round 1' }
  ];

  const out = assembleSecondaryMissions(missions, objectives, actions);
  assert(out.length === 2, 'input order preserved and every mission returned');
  assert(out[0].name === 'Fixed One' && out[1].name === 'Tactical Two', 'order matches the query order');
  assert(out[0].isFixedSecondary === true && out[0].isScorableFirstTurn === false, 'flags coerced to booleans');
  assert(out[0].objectives.length === 1 && out[0].objectives[0].scoring.length === 2, 'scoring lines grouped under one objective');
  assert(out[0].objectives[0].scoring[1].isCumulative === true, 'cumulative flag coerced');
  assert(out[0].actions.length === 2 && out[0].actions[1].restrictionText === 'Not in round 1', 'actions attached');
  assert(out[0].actions[0].restrictionText === null, 'null restriction preserved');
  assert(out[1].lore === null && out[1].description === null, 'null lore/description preserved');
  assert(out[1].objectives.length === 0 && out[1].actions.length === 0, 'mission without objectives/actions is empty, not undefined');

  // Objective/action queries can fail independently; the deck must still render.
  const bare = assembleSecondaryMissions(missions, [], []);
  assert(bare.length === 2 && bare[0].objectives.length === 0, 'cards survive missing objective and action rows');
}
console.log('  ✅ PASS');

console.log('\nAll Mission Intel Tests Completed Successfully! 🎉');
