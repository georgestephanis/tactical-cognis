/**
 * Pure assembly of mission-pack rows into the shapes the print slate consumes.
 *
 * `db.ts` owns the SQL; everything here takes already-fetched rows so it can be
 * unit-tested without sql.js or a database (see CLAUDE.md on keeping logic out of
 * the data layer and components).
 */
import type {
  AppSecondaryMission,
  DispositionIntel,
  DispositionMatchup,
  PrimaryMissionObjective,
  SecondaryMissionAction,
  SecondaryMissionObjective
} from '../types/data';
import { calculateDeploymentFrequencies } from './rosterPrint';

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v);
const optStr = (v: unknown): string | null => (v != null ? String(v) : null);

/**
 * Letter of a recommended preset ("A", "B", "C"), read from the trailing
 * "Layout X" of its name. Falls back to the preset's position so a missing or
 * oddly named preset never shifts the others into the wrong column.
 */
export function getPresetLetter(presetName: string, layoutName: string, index: number): string {
  const match = /layout\s+([A-Za-z0-9]+)\s*$/i.exec(layoutName) || /layout\s+([A-Za-z0-9]+)\s*$/i.exec(presetName);
  if (match) return match[1].toUpperCase();
  return String.fromCharCode(65 + index);
}

/**
 * Builds a disposition's matchup intel from the joined matchup rows and the
 * primary-mission scoring rows.
 *
 * `allDeploymentNames` is the universe used to report deployments that never
 * come up; pass `[]` when it could not be loaded and the "never" list is simply
 * empty rather than guessed.
 */
export function assembleDispositionIntel(
  dispositionId: string,
  dispositionName: string,
  matchupRows: Row[],
  scoringRows: Row[],
  allDeploymentNames: string[]
): DispositionIntel | null {
  if (matchupRows.length === 0) return null;

  const objectivesByMission = new Map<string, PrimaryMissionObjective[]>();
  scoringRows.forEach(r => {
    const pmId = str(r.primaryMissionId);
    const objId = str(r.objectiveId);
    if (!objectivesByMission.has(pmId)) objectivesByMission.set(pmId, []);
    const list = objectivesByMission.get(pmId)!;
    let obj = list.find(o => o.id === objId);
    if (!obj) {
      obj = {
        id: objId,
        name: str(r.objectiveName),
        whenText: optStr(r.whenText),
        displayOrder: Number(r.objectiveOrder) || 0,
        scoring: []
      };
      list.push(obj);
    }
    obj.scoring.push({
      id: str(r.scoringId),
      scoringCriteria: str(r.scoringCriteria),
      victoryPoints: Number(r.victoryPoints) || 0,
      isCumulative: Boolean(r.isCumulative),
      displayOrder: Number(r.scoringOrder) || 0
    });
  });

  const matchupMap = new Map<string, DispositionMatchup>();
  matchupRows.forEach(r => {
    const oppId = str(r.oppositionDispositionId);
    if (!matchupMap.has(oppId)) {
      const pmId = str(r.primaryMissionId);
      matchupMap.set(oppId, {
        oppositionDispositionId: oppId,
        oppositionDispositionName: str(r.oppositionDispositionName),
        primaryMission: {
          id: pmId,
          name: str(r.primaryMissionName),
          lore: optStr(r.primaryMissionLore),
          description: optStr(r.primaryMissionDescription),
          objectives: objectivesByMission.get(pmId) || []
        },
        presets: []
      });
    }

    if (r.presetId && r.layoutName && r.deploymentName) {
      const presets = matchupMap.get(oppId)!.presets;
      // The recommended-preset join can repeat a preset; list each once.
      if (!presets.some(p => p.presetId === str(r.presetId))) {
        presets.push({
          presetId: str(r.presetId),
          presetName: str(r.presetName),
          layoutId: str(r.layoutId),
          layoutName: str(r.layoutName),
          deploymentId: str(r.deploymentId),
          deploymentName: str(r.deploymentName)
        });
      }
    }
  });

  const matchups = Array.from(matchupMap.values());
  const analysis = calculateDeploymentFrequencies(matchups, allDeploymentNames);

  return {
    friendlyDispositionId: dispositionId,
    friendlyDispositionName: dispositionName,
    matchups,
    deploymentFrequencies: analysis.frequencies,
    totalPresets: analysis.totalPresets,
    neverEncounteredDeployments: analysis.neverEncountered
  };
}

/** Groups flat secondary-mission rows with their scoring objectives and actions. */
export function assembleSecondaryMissions(
  missionRows: Row[],
  objectiveRows: Row[],
  actionRows: Row[]
): AppSecondaryMission[] {
  const objectivesBySM = new Map<string, SecondaryMissionObjective[]>();
  objectiveRows.forEach(r => {
    const smId = str(r.secondaryMissionId);
    const objId = str(r.objectiveId);
    if (!objectivesBySM.has(smId)) objectivesBySM.set(smId, []);
    const list = objectivesBySM.get(smId)!;
    let obj = list.find(o => o.id === objId);
    if (!obj) {
      obj = { id: objId, name: str(r.objectiveName), whenText: optStr(r.whenText), scoring: [] };
      list.push(obj);
    }
    obj.scoring.push({
      id: str(r.scoringId),
      scoringCriteria: str(r.scoringCriteria),
      victoryPoints: Number(r.victoryPoints) || 0,
      isCumulative: Boolean(r.isCumulative)
    });
  });

  const actionsBySM = new Map<string, SecondaryMissionAction[]>();
  actionRows.forEach(r => {
    const smId = str(r.secondaryMissionId);
    if (!actionsBySM.has(smId)) actionsBySM.set(smId, []);
    actionsBySM.get(smId)!.push({
      id: str(r.actionId),
      name: str(r.name),
      startsText: str(r.startsText),
      completesText: str(r.completesText),
      effectText: str(r.effectText),
      restrictionText: optStr(r.restrictionText)
    });
  });

  return missionRows.map(r => {
    const id = str(r.id);
    return {
      id,
      name: str(r.name),
      lore: optStr(r.lore),
      description: optStr(r.description),
      isFixedSecondary: Boolean(r.isFixedSecondary),
      isScorableFirstTurn: Boolean(r.isScorableFirstTurn),
      objectives: objectivesBySM.get(id) || [],
      actions: actionsBySM.get(id) || []
    };
  });
}
