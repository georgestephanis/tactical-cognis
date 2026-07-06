import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Sword,
  Search,
  Printer,
  Save,
  FolderOpen,
  Crown,
  Upload,
  Share2
} from 'lucide-react';
import { loadAndMergeFaction, normalizeName, getDatasheetCosts } from '../utils/dataMapper';
import type { MergedFaction } from '../utils/dataMapper';
import { getBattleSizes, getFactionList, getSavedDbRosters, getDbRosterDetail } from '../utils/db';
import type { BattleSize, SavedDbRosterSummary, DbRosterDetail } from '../utils/db';
import type { RosterUnit, MergedUnit, MergedDetachment, ArmyList, Weapon, Model, Datasheet, Ability, DatasheetRule, WargearChoiceSet } from '../types/data';


interface ParsedRosterUnit {
  name: string;
  points: number;
  isWarlord: boolean;
  enhancementName?: string;
  rawModelCounts: { name: string; count: number }[];
  /** Exact model count when the source provides one (DB imports); overrides summing rawModelCounts. */
  modelsCount?: number;
  /** Stable source-side ID, used to resolve leader attachments after matching. */
  sourceId?: string;
  /** sourceId of the bodyguard unit this unit is attached to. */
  attachedToSourceId?: string;
}

interface ParsedRoster {
  rosterName: string;
  factionSlug: string | null;
  factionName: string | null;
  detachmentName: string | null;
  pointLimit: number;
  units: ParsedRosterUnit[];
}

function findBestCostIndex(costs: { points: number; models: number }[], parsedPoints: number, parsedModels: number): number {
  if (!costs || costs.length === 0) return 0;
  if (costs.length === 1) return 0;

  if (parsedPoints > 0) {
    const exactPointsIdx = costs.findIndex(c => c.points === parsedPoints);
    if (exactPointsIdx !== -1) {
      return exactPointsIdx;
    }
  }

  const exactModelsIdx = costs.findIndex(c => c.models === parsedModels);
  if (exactModelsIdx !== -1) {
    return exactModelsIdx;
  }

  let bestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < costs.length; i++) {
    const diff = Math.abs(costs[i].models - parsedModels);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Converts a roster read from the companion-app database into the same
 * ParsedRoster shape the text importer produces, so both flows share
 * applyParsedRoster's matching/validation logic. Unlike text imports the
 * DB gives exact datasheet names, model counts, and leader attachments.
 */
function dbRosterToParsed(detail: DbRosterDetail): ParsedRoster {
  return {
    rosterName: detail.name,
    factionSlug: detail.factionSlug,
    factionName: detail.factionName,
    detachmentName: detail.detachmentName,
    pointLimit: detail.pointsLimit || 2000,
    units: detail.units.map(u => ({
      name: u.datasheetName,
      points: 0, // Not stored in the DB; applyParsedRoster derives it from the matched cost tier.
      isWarlord: u.isWarlord,
      enhancementName: u.enhancementName ?? undefined,
      modelsCount: u.modelsCount,
      sourceId: u.rosterUnitId,
      attachedToSourceId: u.attachedToRosterUnitId ?? undefined,
      rawModelCounts: [...u.modelCounts, ...u.wargearCounts],
    })),
  };
}

function findFactionSlugByName(textLine: string, dbFactions: { faction: string; slug: string }[]): { slug: string; name: string } | null {
  const normalized = textLine.toLowerCase().trim();

  // 1. Check custom short aliases for completely different spellings/words
  const customAliases: Record<string, string> = {
    'admech': 'adeptus-mechanicus',
    'eldar': 'aeldari',
    'guard': 'astra-militarum',
    'gsc': 'genestealer-cults',
    'squat': 'leagues-of-votann',
    'astartes': 'space-marines',
    'sister': 'adepta-sororitas',
    'heretic': 'chaos-space-marines'
  };

  for (const [alias, slug] of Object.entries(customAliases)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(normalized)) {
      const match = dbFactions.find(f => f.slug === slug);
      if (match) return { slug: match.slug, name: match.faction };
    }
  }

  // 2. Try matching normalized db faction names or singularized versions
  for (const f of dbFactions) {
    const normFaction = f.faction.toLowerCase();
    const singularized = normFaction
      .replace(/wolves$/, 'wolf')
      .replace(/s$/, ''); // singularize (necrons -> necron, orks -> ork)

    if (normalized.includes(normFaction) || (singularized.length > 3 && normalized.includes(singularized))) {
      return { slug: f.slug, name: f.faction };
    }
  }

  return null;
}

function parseWtc(text: string, dbFactions: { faction: string; slug: string }[]): ParsedRoster {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const parsed: ParsedRoster = {
    rosterName: 'Imported WTC Roster',
    factionSlug: null,
    factionName: null,
    detachmentName: null,
    pointLimit: 2000,
    units: []
  };

  const fullText = text.replace(/\r\n/g, '\n');
  const headerMatch = fullText.match(/PLAYER:\s*(.*?)\nFACTION:\s*(.*?)\nDETACHMENT:\s*(.*?)\nTOTAL POINTS:\s*(\d[\d\s\u00A0,.]*)\s*pts/i);
  if (headerMatch) {
    parsed.rosterName = `${headerMatch[1].trim()}'s Roster`;
    parsed.detachmentName = headerMatch[3].trim();
    parsed.pointLimit = parseInt(headerMatch[4].replace(/[\s\u00A0,.]/g, ''), 10);
    
    const factionMatch = findFactionSlugByName(headerMatch[2], dbFactions);
    if (factionMatch) {
      parsed.factionSlug = factionMatch.slug;
      parsed.factionName = factionMatch.name;
    }
  }

  for (const line of lines) {
    const unitMatch = line.match(/^UNIT\s*\d+:\s*(.*?)\s*-\s*(\d[\d\s\u00A0,.]*)\s*pts/i);
    if (unitMatch) {
      const rawName = unitMatch[1].trim();
      const points = parseInt(unitMatch[2].replace(/[\s\u00A0,.]/g, ''), 10);
      
      const isWarlord = /\bWARLORD\b/i.test(rawName);
      let cleanName = rawName.replace(/\bWARLORD\b/i, '').replace(/^-?\s*/, '').trim();
      
      let enhancementName: string | undefined;
      const enhMatch = cleanName.match(/-\s*Enhancement:\s*(.*)/i);
      if (enhMatch) {
        enhancementName = enhMatch[1].replace(/\(Upgrade\)$/i, '').trim();
        cleanName = cleanName.replace(/-\s*Enhancement:\s*.*/i, '').trim();
      }

      // Strip wargear parentheses
      cleanName = cleanName.replace(/\([^)]+\)/g, '').trim();
      cleanName = cleanName.replace(/[^a-zA-Z0-9\s'’\-:.,()!&]/g, '').trim();

      parsed.units.push({
        name: cleanName,
        points,
        isWarlord,
        enhancementName,
        rawModelCounts: []
      });
    }
  }

  return parsed;
}

function parseStandardCasual(text: string, dbFactions: { faction: string; slug: string }[]): ParsedRoster {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const parsed: ParsedRoster = {
    rosterName: 'Imported Casual Roster',
    factionSlug: null,
    factionName: null,
    detachmentName: null,
    pointLimit: 2000,
    units: []
  };

  const fullText = text.replace(/\r\n/g, '\n');
  const headerMatch = fullText.match(/\*\*DETACHMENT:\*\*\s*(.*?)\n\*\*TOTAL ARMY POINTS:\*\*\s*(\d[\d\s\u00A0,.]*)pts/i);
  if (headerMatch) {
    parsed.detachmentName = headerMatch[1].trim();
    parsed.pointLimit = parseInt(headerMatch[2].replace(/[\s\u00A0,.]/g, ''), 10);
  }

  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const factionMatch = findFactionSlugByName(lines[i], dbFactions);
    if (factionMatch) {
      parsed.factionSlug = factionMatch.slug;
      parsed.factionName = factionMatch.name;
      break;
    }
  }

  let currentUnit: ParsedRosterUnit | null = null;
  for (const line of lines) {
    if (/\*\*(CHARACTER|BATTLELINE|OTHER DATASHEETS)\*\*/i.test(line)) {
      continue;
    }

    const unitMatch = line.match(/^\*\s*\*\*(.*?)\*\*(?:\s*\(\s*(\d[\d\s\u00A0,.]*)\s*points?\s*\))?:\s*(.*)/i);
    if (unitMatch) {
      if (currentUnit) {
        parsed.units.push(currentUnit);
      }
      const rawName = unitMatch[1].trim();
      const points = unitMatch[2] ? parseInt(unitMatch[2].replace(/[\s\u00A0,.]/g, ''), 10) : 0;
      const rawWargear = unitMatch[3].trim();

      const isWarlord = /\bWarlord\b/i.test(rawName) || /\bWarlord\b/i.test(rawWargear);
      const cleanName = rawName.replace(/\bWarlord\b/i, '').replace(/^-?\s*/, '').trim();

      currentUnit = {
        name: cleanName.replace(/[^a-zA-Z0-9\s'’\-:.,()!&]/g, '').trim(),
        points,
        isWarlord,
        rawModelCounts: []
      };
      continue;
    }

    const enhMatch = line.match(/^-\s*Enhancement:\s*(.*)/i);
    if (enhMatch && currentUnit) {
      currentUnit.enhancementName = enhMatch[1].replace(/\(Upgrade\)$/i, '').trim();
    }
  }

  if (currentUnit) {
    parsed.units.push(currentUnit);
  }

  return parsed;
}

function parseOfficialAppExport(text: string, dbFactions: { faction: string; slug: string }[]): ParsedRoster {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const parsed: ParsedRoster = {
    rosterName: 'Imported Roster',
    factionSlug: null,
    factionName: null,
    detachmentName: null,
    pointLimit: 2000,
    units: []
  };

  if (lines.length === 0) return parsed;

  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const factionMatch = findFactionSlugByName(lines[i], dbFactions);
    if (factionMatch) {
      parsed.factionSlug = factionMatch.slug;
      parsed.factionName = factionMatch.name;
      break;
    }
  }

  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const line = lines[i];
    if (/\(\s*\d+\s*Detachment\s*Points\s*\)/i.test(line)) {
      const match = line.match(/^(.+?)\s*\(\s*\d+\s*Detachment\s*Points\s*\)/i);
      if (match) {
        parsed.detachmentName = match[1].trim();
        break;
      }
    }
  }

  let headerIndex = -1;
  const signatureIndex = lines.findIndex(l => l.toUpperCase().includes('EXPORTED FROM THE WARHAMMER'));
  const pointsRegex = /\(\s*(\d[\d\s\u00A0,.]*)\s*points?\s*\)/i;

  if (signatureIndex !== -1 && signatureIndex + 1 < lines.length) {
    headerIndex = signatureIndex + 1;
  } else {
    if (lines.length > 0 && pointsRegex.test(lines[0])) {
      headerIndex = 0;
    } else {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (pointsRegex.test(line)) {
          const cleanLine = line.replace(/\s+/g, ' ');
          const match = cleanLine.match(/^(.+?)\s*\(\s*(\d[\d\s\u00A0,.]*)\s*points?\s*\)/i);
          if (match) {
            const name = match[1].trim().toUpperCase();
            const isMetadata = /^(STRIKE FORCE|COMBAT PATROL|INCURSION|ONSLAUGHT|GRAND TOURNAMENT|WARHORDE|WAR HODE)$/i.test(name);
            if (!isMetadata) {
              headerIndex = i;
              break;
            }
          }
        }
      }
    }
  }

  if (headerIndex !== -1 && headerIndex < lines.length) {
    const headerLine = lines[headerIndex];
    const cleanHeaderLine = headerLine.replace(/\s+/g, ' ');
    const match = cleanHeaderLine.match(/^(.+?)\s*\(\s*(\d[\d\s\u00A0,.]*)\s*points?\s*\)/i);
    if (match) {
      parsed.rosterName = match[1].trim();
      parsed.pointLimit = parseInt(match[2].replace(/[\s\u00A0,.]/g, ''), 10);
    } else {
      parsed.rosterName = headerLine;
    }
  }

  let currentUnit: ParsedRosterUnit | null = null;
  const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const upperLine = line.toUpperCase().trim();

    if (parsed.detachmentName && line.includes(parsed.detachmentName)) {
      continue;
    }

    if (upperLine.includes('EXPORTED FROM THE WARHAMMER') || upperLine.includes('EXPORTED WITH APP VERSION')) {
      continue;
    }

    if (/^(CHARACTERS|BATTLELINE|DEDICATED TRANSPORTS|OTHER DATASHEETS|ALLIED UNITS|FORTIFICATIONS|ATTACHED UNITS)$/i.test(upperLine)) {
      continue;
    }
    if (/^ATTACHED UNIT \d+$/i.test(upperLine)) {
      continue;
    }

    if (pointsRegex.test(line)) {
      const cleanLine = line.replace(/\s+/g, ' ');
      const match = cleanLine.match(/^(.+?)\s*\(\s*(\d[\d\s\u00A0,.]*)\s*points?\s*\)/i);
      if (match) {
        const name = match[1].trim().toUpperCase();
        if (/^(STRIKE FORCE|COMBAT PATROL|INCURSION|ONSLAUGHT|GRAND TOURNAMENT|WARHORDE|WAR HODE)$/i.test(name)) {
          continue;
        }
      }
    }

    if (parsed.factionName && upperLine === parsed.factionName.toUpperCase()) {
      continue;
    }

    const isBullet = line.startsWith('•') || line.startsWith('*') || line.startsWith('-');
    if (isBullet) {
      if (!currentUnit) continue;

      const content = line.substring(1).trim();
      const upperContent = content.toUpperCase();

      if (upperContent === 'WARLORD') {
        currentUnit.isWarlord = true;
      } else if (upperContent.startsWith('ENHANCEMENT:') || upperContent.startsWith('ENHANCEMENTS:')) {
        const prefixLength = upperContent.startsWith('ENHANCEMENT:') ? 'Enhancement:'.length : 'Enhancements:'.length;
        let enhName = content.substring(prefixLength).trim();
        enhName = enhName.replace(/\(Upgrade\)$/i, '').trim();
        currentUnit.enhancementName = enhName;
      } else {
        const countMatch = content.match(/^(\d+)\s*x\s*(.+)$/i);
        if (countMatch) {
          const count = parseInt(countMatch[1], 10);
          const modelName = countMatch[2].trim();
          currentUnit.rawModelCounts.push({ name: modelName, count });
        }
      }
    } else {
      const unitMatch = line.match(/^(.+?)\s*\(\s*(\d[\d\s\u00A0,.]*)\s*points?\s*\)/i);
      if (unitMatch) {
        if (currentUnit) {
          parsed.units.push(currentUnit);
        }
        let name = unitMatch[1].trim();
        name = name.replace(/[^a-zA-Z0-9\s'’\-:.,()!&]/g, '').trim();

        currentUnit = {
          name,
          points: parseInt(unitMatch[2].replace(/[\s\u00A0,.]/g, ''), 10),
          isWarlord: false,
          rawModelCounts: []
        };
      }
    }
  }

  if (currentUnit) {
    parsed.units.push(currentUnit);
  }

  return parsed;
}

function parseBattleForgeText(text: string, dbFactions: { faction: string; slug: string }[]): ParsedRoster {
  if (/PLAYER:\s*.*?/i.test(text) && /FACTION:\s*.*?/i.test(text)) {
    return parseWtc(text, dbFactions);
  }
  if (/\*\*DETACHMENT:\*\*/i.test(text) && /\*\*TOTAL ARMY POINTS:\*\*/i.test(text)) {
    return parseStandardCasual(text, dbFactions);
  }
  return parseOfficialAppExport(text, dbFactions);
}

function getRosterUnitWargear(u: RosterUnit, factionData: MergedFaction | null): string[] {
  const unitWargear: string[] = [];
  const datasheet = factionData?.units.find(fu => fu.slug === u.unitSlug)?.appDatasheet;
  if (datasheet) {
    const modelCounts = getRosterUnitModelCounts(u, datasheet);
    let isFirstActive = true;
    datasheet.models.forEach(model => {
      const count = modelCounts[model.name] || 0;
      if (count > 0) {
        const activeWeapons = getUnitActiveWeapons(u, model, count, isFirstActive);
        isFirstActive = false;
        activeWeapons.forEach(w => {
          const label = w.count > count ? `${w.count}x ${w.name}` : w.name;
          if (!unitWargear.includes(label)) {
            unitWargear.push(label);
          }
        });
      }
    });
  }
  return unitWargear;
}

function generateRosterText(
  roster: RosterUnit[],
  factionData: MergedFaction | null,
  detachmentSlugs: string[],
  format: 'app' | 'standard' | 'wtc'
): string {
  const factionName = factionData?.factionName || 'Unknown Faction';
  const detachmentNames = factionData
    ? detachmentSlugs.map(slug => factionData.detachments.find(d => d.slug === slug)?.name || slug)
    : detachmentSlugs;
  const detachmentStr = detachmentNames.join(', ') || 'No Detachments';
  const totalPoints = roster.reduce((sum, u) => sum + getUnitActualPoints(u, roster, factionData) + (u.enhancementPoints || 0), 0);

  if (format === 'standard') {
    const lines: string[] = [];
    lines.push(`**DETACHMENT:** ${detachmentStr}`);
    lines.push(`**TOTAL ARMY POINTS:** ${totalPoints}pts\n`);

    const chars = roster.filter(u => u.isCharacter);
    const battleline = roster.filter(u => u.isBattleline);
    const other = roster.filter(u => !u.isCharacter && !u.isBattleline);

    if (chars.length > 0) {
      lines.push('**CHARACTER**');
      chars.forEach(u => {
        const warlordTag = u.isWarlord ? ', Warlord' : '';
        const wargear = getRosterUnitWargear(u, factionData);
        const wargearSuffix = wargear.length > 0 ? `: ${wargear.join(', ')}` : '';
        const actualPoints = getUnitActualPoints(u, roster, factionData);
        lines.push(`* **${u.name}** (${actualPoints + (u.enhancementPoints || 0)} points)${warlordTag}${wargearSuffix}`);
        if (u.enhancementName) {
          lines.push(`  - Enhancement: ${u.enhancementName}`);
        }
      });
      lines.push('');
    }

    if (battleline.length > 0) {
      lines.push('**BATTLELINE**');
      battleline.forEach(u => {
        const splitTag = u.splitSquad ? ' (Combat Squad split)' : '';
        const wargear = getRosterUnitWargear(u, factionData);
        const wargearSuffix = wargear.length > 0 ? `: ${wargear.join(', ')}` : '';
        lines.push(`* **${u.name}${splitTag}** (${u.points} points)${wargearSuffix}`);
      });
      lines.push('');
    }

    if (other.length > 0) {
      lines.push('**OTHER DATASHEETS**');
      other.forEach(u => {
        const splitTag = u.splitSquad ? ' (Combat Squad split)' : '';
        const wargear = getRosterUnitWargear(u, factionData);
        const wargearSuffix = wargear.length > 0 ? `: ${wargear.join(', ')}` : '';
        lines.push(`* **${u.name}${splitTag}** (${u.points} points)${wargearSuffix}`);
      });
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  if (format === 'wtc') {
    const lines: string[] = [];
    lines.push(`PLAYER: Unknown Player`);
    lines.push(`FACTION: ${factionName}`);
    lines.push(`DETACHMENT: ${detachmentStr}`);
    lines.push(`TOTAL POINTS: ${totalPoints}pts`);
    lines.push('='.repeat(40) + '\n');

    roster.forEach((u, idx) => {
      const warlordSuffix = u.isWarlord ? ' - WARLORD' : '';
      const splitTag = u.splitSquad ? ' (Combat Squad split)' : '';
      const wargear = getRosterUnitWargear(u, factionData);
      const wargearSuffix = wargear.length > 0 ? ` (${wargear.join(', ')})` : '';
      const actualPoints = getUnitActualPoints(u, roster, factionData);
      lines.push(`UNIT ${idx + 1}: ${u.name}${splitTag}${warlordSuffix}${wargearSuffix}${enhSuffix} - [${actualPoints + (u.enhancementPoints || 0)} pts]`);
    });

    return lines.join('\n');
  }

  // Default to official app format (Format B)
  const lines: string[] = [];
  lines.push(`${factionName} - ${detachmentStr} - [${totalPoints} pts]`);
  lines.push('');

  roster.forEach(u => {
    const warlordSuffix = u.isWarlord ? ', Warlord' : '';
    const splitTag = u.splitSquad ? ' (Combat Squad split)' : '';
    const actualPoints = getUnitActualPoints(u, roster, factionData);
    lines.push(`• ${u.name}${splitTag}${warlordSuffix} (${actualPoints + (u.enhancementPoints || 0)} pts)`);
    if (u.enhancementName) {
      lines.push(`  • Enhancement: ${u.enhancementName}`);
    }
    const wargear = getRosterUnitWargear(u, factionData);
    wargear.forEach(gear => {
      lines.push(`  • ${gear}`);
    });
  });

  return lines.join('\n');
}

// Module-level so the impure calls stay out of render scope (react-hooks/purity).
function makeRosterUnitId(slug: string): string {
  return `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Resolves the count of each miniature model type in a squad, handling both fixed models (like characters/sergeants)
 * and scaling models (like standard troops) based on the unit's active composition and current squad size.
 */
function getRosterUnitModelCounts(unit: RosterUnit, datasheet: Datasheet): Record<string, number> {
  const comp = datasheet.compositions[unit.selectedCostIndex];
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
 * Checks if a squad is eligible to split (Combat Squad / Combat Patrol Split).
 */
function canUnitSplit(
  unitName: string,
  modelCount: number,
  abilities: Ability[],
  rules: DatasheetRule[]
): boolean {
  if (modelCount !== 10) return false;

  const selfSplitAbilities = ['combat squad', 'combat squads', 'let loose the wolves'];
  const hasSelfSplit =
    abilities.some(a => selfSplitAbilities.includes(a.name.toLowerCase())) ||
    rules.some(r => r.name.toLowerCase() === 'patrol squad');

  if (hasSelfSplit) return true;

  const normName = unitName.toLowerCase();
  const transportSplitUnits = [
    'kabalite warriors',
    'hand of the archon',
    'wyches',
    'battle sisters squad',
    'dominion squad',
    'sisters novitiate squad',
    'hearthkyn warriors',
    'hernkyn yaegirs',
    'hernkyn yaegir'
  ];

  if (transportSplitUnits.some(u => normName.includes(u))) return true;

  return false;
}

/**
 * Checks if a unit satisfies keyword requirements/exclusions for a detachment upgrade/enhancement.
 */
function isUnitEligibleForEnhancement(unitKeywords: string[], enhancement: AppEnhancement): boolean {
  const normKeywords = unitKeywords.map(k => k.toLowerCase());

  // 1. Excluded keywords check: unit must NOT have any excluded keywords
  if (enhancement.excludedKeywords && enhancement.excludedKeywords.length > 0) {
    const hasExcluded = enhancement.excludedKeywords.some(ek =>
      normKeywords.includes(ek.toLowerCase())
    );
    if (hasExcluded) return false;
  }

  // 2. Required keyword groups check: unit must satisfy AT LEAST ONE group (OR between groups, AND within group)
  if (enhancement.requiredKeywordGroups && enhancement.requiredKeywordGroups.length > 0) {
    const satisfiesAnyGroup = enhancement.requiredKeywordGroups.some(group => {
      return group.every(rk => normKeywords.includes(rk.toLowerCase()));
    });
    if (!satisfiesAnyGroup) return false;
  }

  return true;
}

/**
 * Validates whether a character can attach to a bodyguard squad under leader/support limits.
 */
function canAttachCharacterToSquad(
  character: RosterUnit,
  bodyguard: RosterUnit,
  roster: RosterUnit[],
  factionData: MergedFaction | null
): { allowed: boolean; reason?: string } {
  if (!factionData) return { allowed: true };

  const charCatalog = factionData.units.find(u => u.slug === character.unitSlug) || (factionData.alliedUnits && factionData.alliedUnits.find(u => u.slug === character.unitSlug));
  if (!charCatalog) return { allowed: true };

  const bgCatalog = factionData.units.find(u => u.slug === bodyguard.unitSlug) || (factionData.alliedUnits && factionData.alliedUnits.find(u => u.slug === bodyguard.unitSlug));
  if (!bgCatalog) return { allowed: true };

  // Classify current character
  const isSupport = charCatalog.appDatasheet?.rules?.some(r => r.name.toLowerCase() === 'support') || false;
  const isWarboss = charCatalog.appDatasheet?.models?.[0]?.keywords?.some(k => k.toLowerCase() === 'warboss') || false;

  // Get all characters currently attached to this bodyguard
  const attached = roster.filter(u => u.attachedToId === bodyguard.id && u.id !== character.id);
  
  // Calculate attached counts
  let numLeaders = 0;
  let numSupports = 0;
  let hasAttachedWarboss = false;

  attached.forEach(c => {
    const cCat = factionData.units.find(u => u.slug === c.unitSlug) || (factionData.alliedUnits && factionData.alliedUnits.find(u => u.slug === c.unitSlug));
    const cIsSupport = cCat?.appDatasheet?.rules?.some(r => r.name.toLowerCase() === 'support') || false;
    const cIsWarboss = cCat?.appDatasheet?.models?.[0]?.keywords?.some(k => k.toLowerCase() === 'warboss') || false;
    
    if (cIsSupport) {
      numSupports++;
    } else {
      numLeaders++;
      if (cIsWarboss) {
        hasAttachedWarboss = true;
      }
    }
  });

  if (isSupport) {
    if (numSupports >= 1) {
      return { allowed: false, reason: 'Support slot full' };
    }
  } else {
    // Determine max leaders allowed for this bodyguard squad
    let maxLeaders = 1;
    const isBoyz = bodyguard.name.toLowerCase() === 'boyz';
    
    if (isBoyz && bodyguard.modelsCount === 20) {
      if (isWarboss || hasAttachedWarboss) {
        maxLeaders = 2;
      }
    }

    if (numLeaders >= maxLeaders) {
      if (isBoyz && bodyguard.modelsCount === 20 && !isWarboss && !hasAttachedWarboss) {
        return { allowed: false, reason: 'Requires Warboss for 2nd Leader' };
      }
      return { allowed: false, reason: 'Leader slot full' };
    }
  }

  return { allowed: true };
}

/**
 * Calculates the actual points of a roster unit, including any stepped pricing based on duplicate units.
 */
function getUnitActualPoints(unit: RosterUnit, roster: RosterUnit[], factionData: MergedFaction | null): number {
  if (!factionData) return unit.points;

  // Find original merged unit definition to get pointsSteps
  const matchedCatalog = factionData.units.find(u => u.slug === unit.unitSlug) || (factionData.alliedUnits && factionData.alliedUnits.find(u => u.slug === unit.unitSlug));
  const steps = matchedCatalog?.appDatasheet?.pointsSteps;
  if (!steps || steps.length === 0) {
    return unit.points;
  }

  // Find the index of this unit among other copies of the same unit in the roster
  const sameUnits = roster.filter(u => u.unitSlug === unit.unitSlug);
  const myIndex = sameUnits.findIndex(u => u.id === unit.id);
  if (myIndex === -1) return unit.points;

  // Apply any stepped points if myIndex >= stepAt
  let extraPoints = 0;
  steps.forEach(step => {
    if (myIndex + 1 >= step.stepAt) {
      extraPoints += step.stepPoints;
    }
  });

  return unit.points + extraPoints;
}

interface PrintableUnitWrapper {
  unit: RosterUnit;
  indent: boolean;
  roleLabel?: string;
  count: number;
  pointsRange: string;
}

/**
 * Generates a stable serialization key representing a unit's configuration.
 */
function serializeRosterUnit(u: RosterUnit, roster: RosterUnit[], ignoreAttachmentInfo: boolean = false): string {
  let attachmentKey = 'no-attach';
  
  if (!ignoreAttachmentInfo) {
    if (u.isCharacter) {
      if (u.attachedToId) {
        const bodyguard = roster.find(r => r.id === u.attachedToId);
        if (bodyguard) {
          attachmentKey = `leads::${serializeRosterUnit(bodyguard, roster, true)}`;
        }
      }
    } else {
      const attached = roster.filter(c => c.attachedToId === u.id);
      if (attached.length > 0) {
        const attachedKeys = attached.map(c => serializeRosterUnit(c, roster, true)).sort();
        attachmentKey = `ledby::${attachedKeys.join('&&')}`;
      }
    }
  }

  const parts = [
    u.unitSlug,
    u.modelsCount.toString(),
    u.selectedCostIndex.toString(),
    u.splitSquad ? 'split' : 'no-split',
    u.enhancementName || 'no-enh',
    u.isWarlord ? 'warlord' : 'no-warlord',
    attachmentKey,
    JSON.stringify(u.wargearCounts || {}),
    JSON.stringify(u.selectedWargearChoices || [])
  ];
  return parts.join('||');
}

/**
 * Groups and clusters leader characters with their bodyguard squads, returning a structured list for printing.
 */
function getPrintableRoster(
  roster: RosterUnit[],
  factionData: MergedFaction | null,
  collapseDuplicates: boolean
): PrintableUnitWrapper[] {
  
  if (!collapseDuplicates) {
    const result: PrintableUnitWrapper[] = [];
    const handledIds = new Set<string>();

    const bodyguards = roster.filter(u => !u.isCharacter);
    bodyguards.forEach(bg => {
      const attached = roster.filter(c => c.attachedToId === bg.id);
      if (attached.length > 0) {
        const leaders: RosterUnit[] = [];
        const supports: RosterUnit[] = [];
        attached.forEach(c => {
          const cat = factionData?.units.find(u => u.slug === c.unitSlug) || (factionData?.alliedUnits && factionData.alliedUnits.find(u => u.slug === c.unitSlug));
          const isSupport = cat?.appDatasheet?.rules?.some(r => r.name.toLowerCase() === 'support') || false;
          if (isSupport) {
            supports.push(c);
          } else {
            leaders.push(c);
          }
        });
        leaders.forEach(l => {
          result.push({
            unit: l,
            indent: false,
            roleLabel: 'Attached Leader',
            count: 1,
            pointsRange: `${getUnitActualPoints(l, roster, factionData) + (l.enhancementPoints || 0)}`
          });
          handledIds.add(l.id);
        });
        result.push({
          unit: bg,
          indent: true,
          roleLabel: 'Bodyguard Squad',
          count: 1,
          pointsRange: `${getUnitActualPoints(bg, roster, factionData) + (bg.enhancementPoints || 0)}`
        });
        handledIds.add(bg.id);
        supports.forEach(s => {
          result.push({
            unit: s,
            indent: true,
            roleLabel: 'Support Character',
            count: 1,
            pointsRange: `${getUnitActualPoints(s, roster, factionData) + (s.enhancementPoints || 0)}`
          });
          handledIds.add(s.id);
        });
      }
    });

    roster.forEach(u => {
      if (!handledIds.has(u.id)) {
        result.push({
          unit: u,
          indent: false,
          roleLabel: u.isCharacter ? 'Independent Character' : 'Independent Squad',
          count: 1,
          pointsRange: `${getUnitActualPoints(u, roster, factionData) + (u.enhancementPoints || 0)}`
        });
        handledIds.add(u.id);
      }
    });

    return result;
  }

  // Collapsing Identical Units!
  const keyMap = new Map<string, RosterUnit[]>();
  roster.forEach(u => {
    const key = serializeRosterUnit(u, roster);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key)!.push(u);
  });

  const collapsedUnits: {
    id: string;
    unit: RosterUnit;
    count: number;
    pointsRange: string;
  }[] = [];

  keyMap.forEach((group, key) => {
    const rep = { ...group[0] };
    const count = group.length;

    const ptsList = group.map(u => getUnitActualPoints(u, roster, factionData) + (u.enhancementPoints || 0));
    const minPts = Math.min(...ptsList);
    const maxPts = Math.max(...ptsList);
    const pointsRange = minPts === maxPts ? `${minPts}` : `${minPts}-${maxPts}`;

    if (rep.attachedToId) {
      const bodyguard = roster.find(r => r.id === rep.attachedToId);
      if (bodyguard) {
        rep.attachedToId = serializeRosterUnit(bodyguard, roster);
      }
    }

    rep.id = key;

    collapsedUnits.push({
      id: key,
      unit: rep,
      count,
      pointsRange
    });
  });

  const result: PrintableUnitWrapper[] = [];
  const handledKeys = new Set<string>();

  const bodyguards = collapsedUnits.filter(cu => !cu.unit.isCharacter);
  bodyguards.forEach(bg => {
    const attached = collapsedUnits.filter(cu => cu.unit.attachedToId === bg.id);
    if (attached.length > 0) {
      const leaders: typeof collapsedUnits[] = [];
      const supports: typeof collapsedUnits[] = [];

      attached.forEach(cu => {
        const cat = factionData?.units.find(u => u.slug === cu.unit.unitSlug) || (factionData?.alliedUnits && factionData.alliedUnits.find(u => u.slug === cu.unit.unitSlug));
        const isSupport = cat?.appDatasheet?.rules?.some(r => r.name.toLowerCase() === 'support') || false;
        if (isSupport) {
          supports.push(cu);
        } else {
          leaders.push(cu);
        }
      });

      leaders.forEach(l => {
        result.push({
          unit: l.unit,
          indent: false,
          roleLabel: 'Attached Leader',
          count: l.count,
          pointsRange: l.pointsRange
        });
        handledKeys.add(l.id);
      });

      result.push({
        unit: bg.unit,
        indent: true,
        roleLabel: 'Bodyguard Squad',
        count: bg.count,
        pointsRange: bg.pointsRange
      });
      handledKeys.add(bg.id);

      supports.forEach(s => {
        result.push({
          unit: s.unit,
          indent: true,
          roleLabel: 'Support Character',
          count: s.count,
          pointsRange: s.pointsRange
        });
        handledKeys.add(s.id);
      });
    }
  });

  collapsedUnits.forEach(cu => {
    if (!handledKeys.has(cu.id)) {
      result.push({
        unit: cu.unit,
        indent: false,
        roleLabel: cu.unit.isCharacter ? 'Independent Character' : 'Independent Squad',
        count: cu.count,
        pointsRange: cu.pointsRange
      });
      handledKeys.add(cu.id);
    }
  });

  return result;
}

interface PrintableCardWrapper {
  id: string;
  unit: RosterUnit & { virtualName?: string; virtualModelsCount?: number };
  count: number;
  pointsDisplay: string;
}

/**
 * Returns a list of card-compatible wrappers, deduping identical cards if collapseDuplicates is true.
 */
function getPrintableCardsRoster(
  roster: RosterUnit[],
  factionData: MergedFaction | null,
  collapseDuplicates: boolean
): PrintableCardWrapper[] {
  const rawCards = roster.flatMap(unit => {
    if (unit.splitSquad) {
      return [
        { ...unit, id: `${unit.id}-squad-a`, virtualName: `${unit.name} (Squad A)`, virtualModelsCount: 5, virtualPoints: getUnitActualPoints(unit, roster, factionData) / 2 },
        { ...unit, id: `${unit.id}-squad-b`, virtualName: `${unit.name} (Squad B)`, virtualModelsCount: 5, virtualPoints: getUnitActualPoints(unit, roster, factionData) / 2 }
      ];
    }
    return [{ ...unit, virtualName: unit.name, virtualModelsCount: unit.modelsCount, virtualPoints: getUnitActualPoints(unit, roster, factionData) + (unit.enhancementPoints || 0) }];
  });

  if (!collapseDuplicates) {
    return rawCards.map(rc => ({
      id: rc.id,
      unit: rc,
      count: 1,
      pointsDisplay: rc.splitSquad ? `${rc.virtualPoints} pts (Split)` : `${rc.virtualPoints} pts`
    }));
  }

  const serializeRawCard = (c: any, ignoreAttachment: boolean = false): string => {
    let attachmentKey = 'no-attach';
    if (!ignoreAttachment) {
      if (c.isCharacter) {
        if (c.attachedToId) {
          const bodyguard = roster.find(r => r.id === c.attachedToId);
          if (bodyguard) {
            attachmentKey = `leads::${serializeRosterUnit(bodyguard, roster, true)}`;
          }
        }
      } else {
        const attached = roster.filter(char => char.attachedToId === c.id);
        if (attached.length > 0) {
          const attachedKeys = attached.map(char => serializeRosterUnit(char, roster, true)).sort();
          attachmentKey = `ledby::${attachedKeys.join('&&')}`;
        }
      }
    }

    const parts = [
      c.unitSlug,
      c.virtualModelsCount.toString(),
      c.enhancementName || 'no-enh',
      c.isWarlord ? 'warlord' : 'no-warlord',
      attachmentKey,
      JSON.stringify(c.wargearCounts || {}),
      JSON.stringify(c.selectedWargearChoices || [])
    ];
    return parts.join('||');
  };

  const keyMap = new Map<string, typeof rawCards>();
  rawCards.forEach(rc => {
    const key = serializeRawCard(rc);
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key)!.push(rc);
  });

  const result: PrintableCardWrapper[] = [];
  keyMap.forEach((group, key) => {
    const rep = { ...group[0] };
    const count = group.length;

    const ptsList = group.map(g => g.virtualPoints);
    const minPts = Math.min(...ptsList);
    const maxPts = Math.max(...ptsList);
    const pointsDisplay = minPts === maxPts ? `${minPts} pts` : `${minPts}-${maxPts} pts`;

    if (rep.attachedToId) {
      const bodyguard = roster.find(r => r.id === rep.attachedToId);
      if (bodyguard) {
        rep.attachedToId = serializeRosterUnit(bodyguard, roster);
      }
    }

    if (count > 1) {
      rep.virtualName = `${rep.name} (x${count})`;
    }

    result.push({
      id: key,
      unit: rep,
      count,
      pointsDisplay
    });
  });

  return result;
}

/**
 * Calculates active weapons for a model in a squad, taking counts into account.
 * Overlapping choices replace default weapons, while non-overlapping choices are added.
 */
function getUnitActiveWeapons(
  unit: RosterUnit,
  model: Model,
  totalModelCount: number,
  isFirstActiveModel: boolean = true
): Weapon[] {
  if (!model.weapons) return [];
  const wargearCounts = unit.wargearCounts || {};

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
              profiles: item.profiles
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
              profiles: item.profiles
            });
          }
        });
      }
    });
  });

  return activeWeapons;
}

interface ArmyBuilderProps {
  initialFactionSlug?: string;
  onSelectFaction?: (slug: string) => void;
}

export const ArmyBuilder: React.FC<ArmyBuilderProps> = ({
  initialFactionSlug,
  onSelectFaction
}) => {
  const [selectedFactionSlug, setSelectedFactionSlug] = useState<string | null>(initialFactionSlug || null);
  const [selectedDetachmentSlugs, setSelectedDetachmentSlugs] = useState<string[]>([]);
  const [battleSizes, setBattleSizes] = useState<BattleSize[]>([]);
  const [roster, setRoster] = useState<RosterUnit[]>([]);
  const [pointLimit, setPointLimit] = useState<number>(2000);
  const [customLimitInput, setCustomLimitInput] = useState<string>('2000');
  const [isCustomLimit, setIsCustomLimit] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [factionData, setFactionData] = useState<MergedFaction | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [catalogRole, setCatalogRole] = useState<string>('all');

  const findCatalogUnit = (slug: string) => {
    if (!factionData) return undefined;
    return factionData.units.find(u => u.slug === slug) || factionData.alliedUnits?.find(u => u.slug === slug);
  };

  // Roster persistence and printing states
  const [savedArmies, setSavedArmies] = useState<ArmyList[]>(() => {
    const raw = localStorage.getItem('tactical_cognis_armies');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ArmyList[];
        // Migrate legacy single-detachment saves to the detachmentSlugs array
        return parsed.map(a => ({
          ...a,
          detachmentSlugs: a.detachmentSlugs ?? (a.detachmentSlug ? [a.detachmentSlug] : []),
        }));
      } catch (err) {
        console.error('Failed to load saved armies from localStorage:', err);
      }
    }
    return [];
  });

  const [dbFactions, setDbFactions] = useState<{ faction: string; slug: string }[]>([]);

  useEffect(() => {
    getFactionList()
      .then(setDbFactions)
      .catch(err => console.error('Failed to load factions list:', err));
  }, []);

  // Per-game-size construction limits from the DB (detachment points, enhancements, duplicates)
  useEffect(() => {
    getBattleSizes()
      .then(setBattleSizes)
      .catch(err => console.error('Failed to load battle sizes:', err));
  }, []);
  const [currentListName, setCurrentListName] = useState<string>('My Roster');
  const [listNameToSave, setListNameToSave] = useState<string>('');
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState<boolean>(false);
  const [printLayout, setPrintLayout] = useState<'tabular' | 'datacards'>('tabular');
  const [collapseDuplicates, setCollapseDuplicates] = useState<boolean>(false);

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');

  // Rosters saved inside the uploaded companion-app database (may be empty)
  const [dbRosters, setDbRosters] = useState<SavedDbRosterSummary[]>([]);
  const [importingDbRosterId, setImportingDbRosterId] = useState<string | null>(null);

  useEffect(() => {
    getSavedDbRosters()
      .then(setDbRosters)
      .catch(err => console.error('Failed to check database for saved rosters:', err));
  }, []);

  // Export/Share states
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareFormat, setShareFormat] = useState<'app' | 'standard' | 'wtc'>('app');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleSaveRoster = () => {
    if (!selectedFactionSlug || !factionData) return;

    const nameToUse = listNameToSave.trim() || currentListName.trim() || 'My Roster';

    const newArmy: ArmyList = {
      name: nameToUse,
      factionSlug: selectedFactionSlug,
      factionName: factionData.factionName,
      detachmentSlugs: selectedDetachmentSlugs,
      pointLimit,
      units: roster
    };

    setSavedArmies(prev => {
      const idx = prev.findIndex(a => a.name.toLowerCase() === nameToUse.toLowerCase());
      let updated;
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = newArmy;
      } else {
        updated = [...prev, newArmy];
      }
      localStorage.setItem('tactical_cognis_armies', JSON.stringify(updated));
      return updated;
    });

    setCurrentListName(nameToUse);
    setListNameToSave('');
    alert(`Force Roster "${nameToUse}" successfully saved to Local Storage.`);
  };

  const handleLoadRoster = (name: string) => {
    const army = savedArmies.find(a => a.name === name);
    if (!army) return;

    setSelectedFactionSlug(army.factionSlug);
    setSelectedDetachmentSlugs(army.detachmentSlugs);
    setPointLimit(army.pointLimit);
    setCustomLimitInput(army.pointLimit.toString());
    setIsCustomLimit(![1000, 2000, 3000].includes(army.pointLimit));
    setRoster(army.units);
    setCurrentListName(army.name);
  };

  const handleDeleteRoster = (name: string) => {
    if (!confirm(`Are you sure you want to permanently delete the roster "${name}"?`)) return;

    setSavedArmies(prev => {
      const updated = prev.filter(a => a.name !== name);
      localStorage.setItem('tactical_cognis_armies', JSON.stringify(updated));
      return updated;
    });

    if (currentListName === name) {
      setCurrentListName('My Roster');
    }
  };

  // Load faction data when slug changes.
  // (Clearing roster/detachment/data on deselect happens in the change handlers.)
  useEffect(() => {
    if (!selectedFactionSlug) return;

    async function fetchData() {
      setLoading(true);
      try {
        const data = await loadAndMergeFaction(selectedFactionSlug!);
        if (data) {
          setFactionData(data);
        }
      } catch (err) {
        console.error('Failed to load faction data for builder:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedFactionSlug]);

  // Sync parent state if callback provided
  useEffect(() => {
    if (selectedFactionSlug && onSelectFaction) {
      onSelectFaction(selectedFactionSlug);
    }
  }, [selectedFactionSlug, onSelectFaction]);

  // Check character compatibility with bodyguard squad
  const checkCompatibility = (character: RosterUnit, bodyguard: RosterUnit): boolean => {
    if (!factionData) return false;
    const unit = findCatalogUnit(character.unitSlug);
    const datasheet = unit?.appDatasheet;
    if (!datasheet) return false;

    const normBodyguardName = normalizeName(bodyguard.name);
    const leadsNormalized = (datasheet.leads || []).map(normalizeName);

    return leadsNormalized.includes(normBodyguardName);
  };

  const applyParsedRoster = (parsed: ParsedRoster, faction: MergedFaction) => {
    let matchedDetachmentSlug = null;
    if (parsed.detachmentName) {
      const normDetName = normalizeName(parsed.detachmentName);
      const matchedDet = faction.detachments.find(d => normalizeName(d.name) === normDetName);
      if (matchedDet) {
        matchedDetachmentSlug = matchedDet.slug;
      } else {
        const fuzzyMatched = faction.detachments.find(d =>
          normalizeName(d.name).includes(normDetName) || normDetName.includes(normalizeName(d.name))
        );
        if (fuzzyMatched) {
          matchedDetachmentSlug = fuzzyMatched.slug;
        }
      }
    }
    setSelectedDetachmentSlugs(matchedDetachmentSlug ? [matchedDetachmentSlug] : []);

    const newRosterUnits: RosterUnit[] = [];
    const warnings: string[] = [];
    const sourceIdToRosterId = new Map<string, string>();

    // Allied units (e.g. Agents of the Imperium) live in a separate collection.
    const matchableUnits = [...faction.units, ...(faction.alliedUnits || [])];

    for (const parsedUnit of parsed.units) {
      const normParsedName = normalizeName(parsedUnit.name);

      let matchedUnit = matchableUnits.find(u => normalizeName(u.name) === normParsedName);
      if (!matchedUnit) {
        matchedUnit = matchableUnits.find(u => {
          const normCatalog = normalizeName(u.name);
          return normCatalog.includes(normParsedName) || normParsedName.includes(normCatalog);
        });
      }

      if (!matchedUnit) {
        warnings.push(`Unit "${parsedUnit.name}" was not found in the faction catalog. Skipped.`);
        continue;
      }

      const firstModel = matchedUnit.appDatasheet?.models?.[0];
      const keywords = firstModel?.keywords || [];
      const isCharacter = keywords.some(k => k.toLowerCase() === 'character');
      const isBattleline = keywords.some(k => k.toLowerCase() === 'battleline');

      const parsedModelsCount = parsedUnit.modelsCount ?? parsedUnit.rawModelCounts.reduce((sum, item) => sum + item.count, 0);

      const costs: { points: number; models: number }[] = [];
      if (matchedUnit.appDatasheet?.compositions) {
        matchedUnit.appDatasheet.compositions.forEach(c => {
          // Find the primary model count for this composition (sum of mins)
          const modelCount = c.models.reduce((sum, m) => sum + m.min, 0);
          costs.push({
            points: c.points || 0,
            models: modelCount || 1
          });
        });
      }

      const selectedCostIndex = findBestCostIndex(costs, parsedUnit.points, parsedModelsCount);

      let actualPoints = parsedUnit.points;
      let actualModels = parsedModelsCount || 1;

      if (costs[selectedCostIndex]) {
        actualPoints = costs[selectedCostIndex].points;
        actualModels = costs[selectedCostIndex].models;
      }

      let enhancementPoints = 0;
      let validEnhancementName = undefined;

      if (parsedUnit.enhancementName && matchedDetachmentSlug) {
        const matchedDet = faction.detachments.find(d => d.slug === matchedDetachmentSlug);
        const normEnhName = normalizeName(parsedUnit.enhancementName);
        const matchedEnh = matchedDet?.enhancements.find(e =>
          normalizeName(e.name) === normEnhName ||
          normalizeName(e.name).includes(normEnhName) ||
          normEnhName.includes(normalizeName(e.name))
        );
        if (matchedEnh) {
          validEnhancementName = matchedEnh.name;
          enhancementPoints = matchedEnh.pointsCost || 0;
        } else {
          warnings.push(`Enhancement "${parsedUnit.enhancementName}" not found in detachment "${matchedDet?.name || matchedDetachmentSlug}".`);
        }
      }

      const selectedWargearChoices: Record<string, string[]> = {};
      const wargearCounts: Record<string, number> = {};

      if (matchedUnit.appDatasheet?.models && parsedUnit.rawModelCounts.length > 0) {
        matchedUnit.appDatasheet.models.forEach(model => {
          const sets = model.wargearChoiceSets || [];
          sets.forEach(set => {
            set.choices.forEach(choice => {
              choice.items.forEach(item => {
                const normItemName = normalizeName(item.name);
                const matchedImport = parsedUnit.rawModelCounts.find(rc => {
                  const normRcName = normalizeName(rc.name);
                  return normRcName.includes(normItemName) || normItemName.includes(normRcName);
                });

                if (matchedImport) {
                  const multiplier = Math.max(1, Math.round(matchedImport.count / item.count));
                  wargearCounts[choice.id] = multiplier;
                  
                  if (!selectedWargearChoices[set.id]) {
                    selectedWargearChoices[set.id] = [];
                  }
                  if (!selectedWargearChoices[set.id].includes(choice.id)) {
                    selectedWargearChoices[set.id].push(choice.id);
                  }
                }
              });
            });
          });
        });
      }

      const newUnitId = makeRosterUnitId(matchedUnit.slug);
      if (parsedUnit.sourceId) {
        sourceIdToRosterId.set(parsedUnit.sourceId, newUnitId);
      }

      newRosterUnits.push({
        id: newUnitId,
        unitSlug: matchedUnit.slug,
        name: matchedUnit.name,
        points: actualPoints,
        modelsCount: actualModels,
        isCharacter,
        isBattleline,
        isWarlord: parsedUnit.isWarlord,
        isFactionPack: matchedUnit.isFactionPack || false,
        selectedCostIndex,
        enhancementName: validEnhancementName,
        enhancementPoints: enhancementPoints > 0 ? enhancementPoints : undefined,
        selectedWargearChoices,
        wargearCounts
      });
    }

    // Resolve leader/support attachments now that all units have roster IDs.
    parsed.units.forEach(parsedUnit => {
      if (!parsedUnit.sourceId || !parsedUnit.attachedToSourceId) return;
      const unitId = sourceIdToRosterId.get(parsedUnit.sourceId);
      const targetId = sourceIdToRosterId.get(parsedUnit.attachedToSourceId);
      if (!unitId || !targetId) return;
      const unit = newRosterUnits.find(u => u.id === unitId);
      if (unit) {
        unit.attachedToId = targetId;
      }
    });

    setRoster(newRosterUnits);

    if (parsed.rosterName) {
      setCurrentListName(parsed.rosterName);
    }
    let targetLimit = parsed.pointLimit;
    if (!targetLimit || targetLimit <= 0) {
      const importedTotalPoints = newRosterUnits.reduce((sum, u) => sum + getUnitActualPoints(u, newRosterUnits, faction) + (u.enhancementPoints || 0), 0);
      targetLimit = importedTotalPoints;
    }

    if (targetLimit > 0) {
      if (battleSizes.length > 0) {
        const matchedSize = battleSizes.find(b => b.pointsLimit >= targetLimit);
        if (matchedSize) {
          targetLimit = matchedSize.pointsLimit;
        } else {
          targetLimit = Math.ceil(targetLimit / 1000) * 1000;
        }
      } else {
        targetLimit = Math.ceil(targetLimit / 1000) * 1000;
      }
    } else {
      targetLimit = 2000;
    }

    setPointLimit(targetLimit);
    setCustomLimitInput(targetLimit.toString());
    setIsCustomLimit(![1000, 2000, 3000].includes(targetLimit));

    if (warnings.length > 0) {
      alert(`Import complete with warnings:\n\n${warnings.join('\n')}`);
    } else {
      alert('Roster imported successfully!');
    }
  };

  // Switch faction and apply an imported roster once its data is loaded.
  const importIntoFaction = async (parsed: ParsedRoster, slug: string) => {
    setSelectedFactionSlug(slug);
    setIsImportModalOpen(false);
    setImportText('');
    try {
      const data = await loadAndMergeFaction(slug);
      if (data) {
        applyParsedRoster(parsed, data);
      }
    } catch (err) {
      console.error('Failed to load faction data for import:', err);
      alert('Failed to load faction data for the imported roster.');
    }
  };

  // Import a roster saved inside the companion-app database.
  const handleImportDbRoster = async (rosterId: string) => {
    setImportingDbRosterId(rosterId);
    try {
      const detail = await getDbRosterDetail(rosterId);
      if (!detail || detail.units.length === 0) {
        alert('This roster appears to be empty — nothing to import.');
        return;
      }

      const parsed = dbRosterToParsed(detail);
      if (!parsed.factionSlug) {
        alert('Could not determine which faction this roster belongs to.');
        return;
      }

      if (parsed.factionSlug === selectedFactionSlug && factionData) {
        applyParsedRoster(parsed, factionData);
        setIsImportModalOpen(false);
        setImportText('');
      } else {
        await importIntoFaction(parsed, parsed.factionSlug!);
      }
    } catch (err) {
      console.error('Failed to import roster from database:', err);
      alert('Failed to import this roster from the database.');
    } finally {
      setImportingDbRosterId(null);
    }
  };

  const handleImportExecute = () => {
    if (!importText.trim()) return;

    try {
      const parsed = parseBattleForgeText(importText, dbFactions);

      if (parsed.units.length === 0) {
        alert("No units found to import. Please check that the raw text is from the Warhammer 40k Companion App export.");
        return;
      }

      if (parsed.factionSlug && parsed.factionSlug !== selectedFactionSlug) {
        const newFactionName = dbFactions.find(f => f.slug === parsed.factionSlug)?.faction || parsed.factionName || parsed.factionSlug;
        const currentFactionName = selectedFactionSlug ? (dbFactions.find(f => f.slug === selectedFactionSlug)?.faction || selectedFactionSlug) : 'None';
        const confirmSwitch = confirm(
          `This list is for the "${newFactionName}" faction, but your current workspace is "${currentFactionName}".\n\n` +
          `Would you like to switch to "${newFactionName}" and import this roster?`
        );

        if (confirmSwitch) {
          importIntoFaction(parsed, parsed.factionSlug);
        }
      } else {
        if (factionData) {
          applyParsedRoster(parsed, factionData);
          setIsImportModalOpen(false);
          setImportText('');
        } else {
          if (parsed.factionSlug) {
            importIntoFaction(parsed, parsed.factionSlug);
          } else {
            alert("Please select a faction workspace before importing a roster with no detected faction.");
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert("Failed to parse the roster file.");
    }
  };

  // Add unit instance to roster
  const handleAddUnit = (mergedUnit: MergedUnit) => {
    if (!factionData) return;

    // Detect if unit is a character / battleline
    const firstModel = mergedUnit.appDatasheet?.models?.[0];
    const keywords = firstModel?.keywords || [];
    const isCharacter = keywords.some(k => k.toLowerCase() === 'character');
    const isBattleline = keywords.some(k => k.toLowerCase() === 'battleline');

    // Determine initial cost option
    const selectedDetachmentId = selectedDetachmentSlugs[0] ? factionData.detachments.find(d => d.slug === selectedDetachmentSlugs[0])?.id : null;
    const costs = getDatasheetCosts(mergedUnit.appDatasheet, factionData.factionKeywordIds || [], selectedDetachmentId, factionData.slug);
    let initialCost = 0;
    let initialModels = 1;

    if (costs.length > 0) {
      initialCost = costs[0].points || 0;
      initialModels = costs[0].models || 1;
    }

    const newUnit: RosterUnit = {
      id: makeRosterUnitId(mergedUnit.slug),
      unitSlug: mergedUnit.slug,
      name: mergedUnit.name,
      points: initialCost,
      modelsCount: initialModels,
      isCharacter,
      isBattleline,
      isFactionPack: mergedUnit.isFactionPack || false,
      selectedCostIndex: 0
    };

    setRoster(prev => [...prev, newUnit]);
  };

  // Remove unit instance from roster
  const handleRemoveUnit = (id: string) => {
    setRoster(prev => {
      // Find if other characters were attached to this unit, detach them
      return prev.map(u => {
        if (u.attachedToId === id) {
          return { ...u, attachedToId: undefined };
        }
        return u;
      }).filter(u => u.id !== id);
    });
  };

  // Change model count size step
  const handleCostIndexChange = (id: string, costIndex: number) => {
    if (!factionData) return;
    setRoster(prev => prev.map(u => {
      if (u.id !== id) return u;

      const merged = findCatalogUnit(u.unitSlug);
      const selectedDetachmentId = selectedDetachmentSlugs[0] ? factionData.detachments.find(d => d.slug === selectedDetachmentSlugs[0])?.id : null;
      const costs = getDatasheetCosts(merged?.appDatasheet, factionData.factionKeywordIds || [], selectedDetachmentId, factionData.slug);

      let points = 0;
      let modelsCount = 1;

      if (costs[costIndex]) {
        points = costs[costIndex].points || 0;
        modelsCount = costs[costIndex].models || 1;
      }

      return {
        ...u,
        selectedCostIndex: costIndex,
        points,
        modelsCount
      };
    }));
  };

  // Change selected wargear count (for steppers / checkboxes)
  const handleWargearCountChange = (unitId: string, choiceId: string, count: number) => {
    setRoster(prev => prev.map(u => {
      if (u.id !== unitId) return u;
      const currentCounts = u.wargearCounts ? { ...u.wargearCounts } : {};
      if (count <= 0) {
        delete currentCounts[choiceId];
      } else {
        currentCounts[choiceId] = count;
      }
      return { ...u, wargearCounts: currentCounts };
    }));
  };

  // Toggle warlord
  const handleToggleWarlord = (id: string) => {
    setRoster(prev => prev.map(u => {
      if (u.id === id) {
        return { ...u, isWarlord: !u.isWarlord };
      }
      // Max 1 warlord total, so turn off others
      if (u.isWarlord) {
        return { ...u, isWarlord: false };
      }
      return u;
    }));
  };

  // Toggle split squad status
  const handleToggleSplitSquad = (id: string) => {
    setRoster(prev => prev.map(u => {
      if (u.id === id) {
        return { ...u, splitSquad: !u.splitSquad };
      }
      return u;
    }));
  };

  // Set enhancement on character (searched across every selected detachment)
  const handleSelectEnhancement = (id: string, enhName: string) => {
    if (!factionData || selectedDetachmentSlugs.length === 0) return;
    const enhancement = factionData.detachments
      .filter(d => selectedDetachmentSlugs.includes(d.slug))
      .flatMap(d => d.enhancements)
      .find(e => e.name === enhName);

    setRoster(prev => prev.map(u => {
      if (u.id !== id) return u;
      return {
        ...u,
        enhancementName: enhName !== 'none' ? enhName : undefined,
        enhancementPoints: enhName !== 'none' ? (enhancement?.pointsCost || 0) : undefined
      };
    }));
  };

  // Add a detachment to the army (budget enforcement happens in the UI + validation)
  const handleAddDetachment = (slug: string) => {
    if (!slug || selectedDetachmentSlugs.includes(slug)) return;
    setSelectedDetachmentSlugs(prev => [...prev, slug]);
  };

  // Remove a detachment and clear any roster enhancements that came from it
  const handleRemoveDetachment = (slug: string) => {
    setSelectedDetachmentSlugs(prev => prev.filter(s => s !== slug));
    const removed = factionData?.detachments.find(d => d.slug === slug);
    const removedEnhNames = new Set((removed?.enhancements || []).map(e => e.name));
    if (removedEnhNames.size > 0) {
      setRoster(prev => prev.map(u =>
        u.enhancementName && removedEnhNames.has(u.enhancementName)
          ? { ...u, enhancementName: undefined, enhancementPoints: undefined }
          : u
      ));
    }
  };

  // Attach leader to bodyguard
  const handleAttachLeader = (leaderId: string, bodyguardId: string) => {
    setRoster(prev => prev.map(u => {
      if (u.id !== leaderId) return u;
      return {
        ...u,
        attachedToId: bodyguardId !== 'none' ? bodyguardId : undefined
      };
    }));
  };

  // Calculate points total
  const calculateTotalPoints = (): number => {
    return roster.reduce((sum, u) => {
      return sum + getUnitActualPoints(u, roster, factionData) + (u.enhancementPoints || 0);
    }, 0);
  };

  const selectedDetachments = factionData
    ? selectedDetachmentSlugs
        .map(slug => factionData.detachments.find(d => d.slug === slug))
        .filter((d): d is MergedDetachment => !!d)
    : [];

  // Filter list of catalog units
  const filteredCatalog = factionData ? [...factionData.units, ...(factionData.alliedUnits || [])].filter(unit => {
    if (unit.isCombatPatrol || unit.pointsRange.min === 0) return false;

    // Detachment gating for allied units
    if (unit.isAllied && unit.requiredDetachmentIds && unit.requiredDetachmentIds.length > 0) {
      const activeDetachment = selectedDetachments[0];
      if (!activeDetachment || !unit.requiredDetachmentIds.includes(activeDetachment.id)) return false;
    }

    const matchesSearch = unit.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (catalogRole === 'all') {
      return !unit.isAllied;
    }
    if (catalogRole === 'allies') {
      return !!unit.isAllied;
    }

    if (unit.isAllied) return false;

    const firstModel = unit.appDatasheet?.models?.[0];
    const keywords = firstModel?.keywords || [];

    if (catalogRole === 'character') return keywords.some(k => k.toLowerCase() === 'character');
    if (catalogRole === 'battleline') return keywords.some(k => k.toLowerCase() === 'battleline');
    if (catalogRole === 'vehicle') return keywords.some(k => k.toLowerCase() === 'vehicle' || k.toLowerCase() === 'frame');
    if (catalogRole === 'monster') return keywords.some(k => k.toLowerCase() === 'monster');
    if (catalogRole === 'infantry') return keywords.some(k => k.toLowerCase() === 'infantry');

    return true;
  }) : [];

  const totalPoints = calculateTotalPoints();
  const pointPercentage = Math.min(100, (totalPoints / pointLimit) * 100);

  // Battle-size limits for the chosen point limit: the smallest game size that
  // fits it, else the largest. Fallbacks match Strike Force if the table is
  // missing from an uploaded database.
  const applicableBattleSize = battleSizes.length > 0
    ? (battleSizes.find(b => pointLimit <= b.pointsLimit) || battleSizes[battleSizes.length - 1])
    : null;
  const detachmentPointsLimit = applicableBattleSize?.detachmentPointsLimit ?? 3;
  const enhancementLimit = applicableBattleSize?.enhancementLimit ?? 3;
  const duplicateUnitLimit = applicableBattleSize?.duplicateUnitLimit ?? 3;
  const usedDetachmentPoints = selectedDetachments.reduce((sum, d) => sum + (d.detachmentPointsCost || 0), 0);

  // Roster validation, derived directly from current state on each render
  const validationErrors: string[] = [];
  if (factionData) {
    // 1. Points limit check
    if (totalPoints > pointLimit) {
      validationErrors.push(`Roster exceeds point limit: ${totalPoints} / ${pointLimit} pts.`);
    }

    // 1b. Detachment points budget for the game size
    if (usedDetachmentPoints > detachmentPointsLimit) {
      validationErrors.push(`Detachment points exceeded: selected detachments total ${usedDetachmentPoints} DP (limit is ${detachmentPointsLimit}${applicableBattleSize ? ` for ${applicableBattleSize.name}` : ''}).`);
    }

    // 2. Warlord check
    const characters = roster.filter(u => u.isCharacter);
    const warlords = roster.filter(u => u.isWarlord);
    if (characters.length > 0 && warlords.length === 0) {
      validationErrors.push("No Warlord designated. Every army must have exactly one Warlord character.");
    } else if (warlords.length > 1) {
      validationErrors.push(`Multiple Warlords designated (${warlords.length}). You may only have one Warlord.`);
    }

    // 3. Rule of 3 (Datasheet counts)
    const datasheetCounts: Record<string, number> = {};
    roster.forEach(u => {
      datasheetCounts[u.name] = (datasheetCounts[u.name] || 0) + 1;
    });

    Object.entries(datasheetCounts).forEach(([name, count]) => {
      // Find one matching unit to determine if it is battleline (battleline may take double)
      const matchedUnit = roster.find(u => u.name === name);
      const limit = matchedUnit?.isBattleline ? duplicateUnitLimit * 2 : duplicateUnitLimit;
      if (count > limit) {
        validationErrors.push(`Exceeded allowance for "${name}": added ${count} copies (Max is ${limit} for ${matchedUnit?.isBattleline ? 'Battleline' : 'standard'} units).`);
      }
    });

    // 4. Enhancements checks
    const enhancedUnitsForLimit = roster.filter(u => {
      if (!u.enhancementName) return false;
      const matchedEnh = selectedDetachments
        .flatMap(d => d.enhancements)
        .find(e => e.name === u.enhancementName);
      return matchedEnh ? matchedEnh.isIncludedInEnhancementLimit !== false : true;
    });
    if (enhancedUnitsForLimit.length > enhancementLimit) {
      validationErrors.push(`Exceeded enhancement limit: selected ${enhancedUnitsForLimit.length} enhancements counting towards the limit (Max is ${enhancementLimit}${applicableBattleSize ? ` for ${applicableBattleSize.name}` : ''}).`);
    }

    const enhancementCounts: Record<string, number> = {};
    const enhancedUnits = roster.filter(u => u.enhancementName);
    enhancedUnits.forEach(u => {
      if (u.enhancementName) {
        enhancementCounts[u.enhancementName] = (enhancementCounts[u.enhancementName] || 0) + 1;

        const matchedEnh = selectedDetachments
          .flatMap(d => d.enhancements)
          .find(e => e.name === u.enhancementName);

        if (matchedEnh) {
          // Cannot be Warlord enhancement restriction
          if (u.isWarlord && matchedEnh.cannotBeWarlord) {
            validationErrors.push(`Invalid Enhancement: "${u.enhancementName}" cannot be given to your Warlord.`);
          }

          // Check keywords on this unit
          const keywords = findCatalogUnit(u.unitSlug)?.appDatasheet?.models.flatMap(m => m.keywords) || [];
          const isChar = keywords.some(k => k.toLowerCase() === 'character');
          const isEpicHero = keywords.some(k => k.toLowerCase() === 'epic hero');

          if (isEpicHero && !matchedEnh.isEquipableByEpicHero) {
            validationErrors.push(`Invalid Enhancement: Epic Hero "${u.name}" cannot be given upgrade/enhancement "${u.enhancementName}".`);
          } else if (!isChar && !matchedEnh.isEquipableByNonCharacterUnit) {
            validationErrors.push(`Invalid Enhancement: Non-Character unit "${u.name}" cannot be given upgrade/enhancement "${u.enhancementName}".`);
          } else if (!isUnitEligibleForEnhancement(keywords, matchedEnh)) {
            validationErrors.push(`Invalid Enhancement: "${u.enhancementName}" cannot be given to "${u.name}" due to keyword restrictions.`);
          }
        }
      }
    });

    Object.entries(enhancementCounts).forEach(([enhName, count]) => {
      const matchedEnh = selectedDetachments
        .flatMap(d => d.enhancements)
        .find(e => e.name === enhName);
      const limit = matchedEnh?.limit ?? 1;
      if (count > limit) {
        if (limit === 1) {
          validationErrors.push(`Duplicate enhancement selected: "${enhName}" is assigned to multiple units (Only 1 copy allowed).`);
        } else {
          validationErrors.push(`Exceeded allowance for upgrade "${enhName}": selected ${count} copies (Max is ${limit}).`);
        }
      }
    });

    // 5. Leader compatibility checks
    roster.forEach(u => {
      if (u.isCharacter && u.attachedToId) {
        const targetBodyguard = roster.find(t => t.id === u.attachedToId);
        if (!targetBodyguard) {
          validationErrors.push(`Attached leader "${u.name}" points to a bodyguard squad that no longer exists.`);
        } else {
          const isComp = checkCompatibility(u, targetBodyguard);
          if (!isComp) {
            validationErrors.push(`Compatibility mismatch: Leader character "${u.name}" cannot attach to "${targetBodyguard.name}".`);
          }
        }
      }
    });

    // 6. Squad-level limited wargear checks
    roster.forEach(u => {
      const matched = findCatalogUnit(u.unitSlug);
      const ds = matched?.appDatasheet;
      if (!ds || !ds.limitedWargearChoiceSets || ds.limitedWargearChoiceSets.length === 0) return;

      ds.limitedWargearChoiceSets.forEach(set => {
        // Find applicable limit for the current squad size
        const limits = set.limits || [];
        const applicableLimit = [...limits]
          .sort((a, b) => b.modelCount - a.modelCount)
          .find(lim => lim.modelCount <= u.modelsCount);

        if (!applicableLimit) return;

        // Gather all limited item IDs in this set
        const limitedItemIds = new Set(set.choices.flatMap(c => c.wargearItemIds || []));

        // Count how many regular selected choices contain these limited items
        let selectedCount = 0;
        const seenChoiceIds = new Set<string>();
        ds.models.forEach(model => {
          model.wargearChoiceSets?.forEach(regSet => {
            regSet.choices.forEach(regChoice => {
              if (seenChoiceIds.has(regChoice.id)) return;
              seenChoiceIds.add(regChoice.id);

              const hasLimitedItem = regChoice.items.some(item => limitedItemIds.has(item.wargearItemId));
              if (hasLimitedItem) {
                selectedCount += u.wargearCounts?.[regChoice.id] || 0;
              }
            });
          });
        });

        if (selectedCount > applicableLimit.choiceLimit) {
          validationErrors.push(`Exceeded wargear limit for "${u.name}": selected ${selectedCount} limited upgrades (Max is ${applicableLimit.choiceLimit} for squad size ${u.modelsCount}).`);
        }
      });
    });

    // 7. Allied units count & points validation
    if (factionData.alliedLimits) {
      const alliedRosterUnits = roster.filter(u => {
        const catalog = findCatalogUnit(u.unitSlug);
        return catalog?.isAllied;
      });

      if (alliedRosterUnits.length > 0) {
        // A. Points validation
        const alliedPointsTotal = alliedRosterUnits.reduce((sum, u) => sum + u.points, 0);
        const pointsLimitRecord = factionData.alliedLimits.find(
          l => l.keyword === 'Points' && (l.battleSize === null || l.battleSize === applicableBattleSize?.name)
        );
        if (pointsLimitRecord && alliedPointsTotal > pointsLimitRecord.limitCount) {
          validationErrors.push(
            `Allied Force exceeds points limit: spent ${alliedPointsTotal} pts on allied units (Max is ${pointsLimitRecord.limitCount} pts).`
          );
        }

        // B. Keyword limits validation (Characters, Retinues, Titanic, War Dogs, etc.)
        const keywordCounts: Record<string, number> = {};
        alliedRosterUnits.forEach(u => {
          const catalog = findCatalogUnit(u.unitSlug);
          const firstModel = catalog?.appDatasheet?.models?.[0];
          const keywords = firstModel?.keywords || [];

          keywords.forEach(kw => {
            const normKw = kw.trim();
            factionData.alliedLimits!.forEach(limit => {
              if (limit.keyword === 'Points') return;
              if (limit.keyword.toLowerCase() === normKw.toLowerCase()) {
                keywordCounts[limit.keyword] = (keywordCounts[limit.keyword] || 0) + 1;
              }
            });
          });
        });

        factionData.alliedLimits.forEach(limit => {
          if (limit.keyword === 'Points') return;
          if (limit.battleSize && limit.battleSize !== applicableBattleSize?.name) return;

          const count = keywordCounts[limit.keyword] || 0;
          if (count > limit.limitCount) {
            validationErrors.push(
              `Allied Force exceeds limit for "${limit.keyword}" units: added ${count} (Max is ${limit.limitCount} for ${applicableBattleSize?.name || 'this game size'}).`
            );
          }
        });
      }
    }
  }

  // Helper selectors
  const bodyguardsInRoster = roster.filter(u => !u.isCharacter);
  const independentCharacters = roster.filter(u => u.isCharacter && !u.attachedToId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}>

      {/* Header Panel */}
      <div
        className="panel"
        style={{
          background: 'linear-gradient(135deg, rgba(23, 29, 47, 0.8) 0%, rgba(15, 19, 31, 0.8) 100%)',
          padding: '1.5rem 2rem'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.05em' }}>
              <Sword size={14} />
              COGNIS FORCE RECONSTRUCTION ENGINE
            </div>
            <h2 style={{ fontSize: '2rem', textTransform: 'uppercase', margin: 0 }}>
              {selectedFactionSlug
                ? (dbFactions.find(f => f.slug === selectedFactionSlug)?.faction || selectedFactionSlug.toUpperCase())
                : "ARMY LIST BUILDER"}
            </h2>
          </div>

          {/* Faction & List selectors */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Faction selector */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Select Faction:</span>
              <select
                value={selectedFactionSlug || ''}
                onChange={(e) => {
                  const slug = e.target.value || null;
                  setSelectedFactionSlug(slug);
                  setRoster([]);
                  setSelectedDetachmentSlugs([]);
                  if (!slug) setFactionData(null);
                }}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Choose Faction --</option>
                {dbFactions.map(f => (
                  <option key={f.slug} value={f.slug}>{f.faction}</option>
                ))}
              </select>
            </div>

            {/* Load selector */}
            {savedArmies.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Load List:</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleLoadRoster(e.target.value);
                    }
                  }}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">-- Load Saved List --</option>
                  {savedArmies.map(a => (
                    <option key={a.name} value={a.name}>{a.name} ({a.factionName})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Save/Load Persistence Bar */}
        {selectedFactionSlug && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            {/* Active List Name & Action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Active List:</span>
              <span style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>{currentListName}</span>
              {currentListName && savedArmies.some(a => a.name === currentListName) && (
                <button
                  onClick={() => handleDeleteRoster(currentListName)}
                  className="button-outline"
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.75rem',
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                    color: 'var(--accent-red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    marginLeft: '0.5rem',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    e.currentTarget.style.borderColor = 'var(--accent-red)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                  }}
                  title="Delete this roster from Local Storage"
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>

            {/* Save controls */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="text"
                value={listNameToSave}
                onChange={(e) => setListNameToSave(e.target.value)}
                placeholder="New list name or save active..."
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                  width: '200px'
                }}
              />
              <button
                onClick={handleSaveRoster}
                className="button"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Save size={14} /> Save List
              </button>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="empty-state">
          <RefreshSpinner />
          <h3>Retrieving faction manifestos...</h3>
        </div>
      )}

      {!selectedFactionSlug && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {savedArmies.length > 0 && (
            <div className="panel" style={{ padding: '2rem', marginBottom: '0' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--accent-gold)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <FolderOpen size={20} /> Saved Army Rosters
              </h3>
              <div className="army-card-grid">
                {savedArmies.map(army => {
                  const totalPoints = army.units.reduce((sum, u) => sum + u.points + (u.enhancementPoints || 0), 0);
                  return (
                    <div
                      key={army.name}
                      className="army-card"
                      onClick={() => handleLoadRoster(army.name)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <h4>{army.name}</h4>
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--accent-teal)',
                            background: 'rgba(0, 242, 254, 0.06)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap'
                          }}>
                            {totalPoints} / {army.pointLimit} pts
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', fontWeight: 600 }}>
                          {army.factionName}
                        </div>
                        {army.detachmentSlugs && army.detachmentSlugs.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            {army.detachmentSlugs.length === 1 ? 'Detachment' : 'Detachments'}: {army.detachmentSlugs.map(slug => slug.replace(/-/g, ' ')).join(', ')}
                          </div>
                        )}
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
                          {army.units.length} {army.units.length === 1 ? 'Unit' : 'Units'} loaded
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: 'auto' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleLoadRoster(army.name)}
                          className="button"
                          style={{ flex: 1, padding: '0.5rem 1rem', fontSize: '0.85rem', justifyContent: 'center' }}
                        >
                          <FolderOpen size={14} /> Load Roster
                        </button>
                        <button
                          onClick={() => handleDeleteRoster(army.name)}
                          className="button-outline"
                          style={{
                            padding: '0.5rem',
                            fontSize: '0.85rem',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            color: 'var(--accent-red)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'var(--accent-red)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                          }}
                          title="Delete Roster"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="panel empty-state" style={{ marginTop: '0' }}>
            <Sword size={48} style={{ color: 'var(--accent-gold)', marginBottom: '1.25rem' }} />
            <h3>No Faction Loaded</h3>
            <p style={{ marginBottom: '1.5rem' }}>
              Please select a faction from the drop-down menu above, choose a saved roster, or import an existing list to begin.
            </p>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="button-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto', cursor: 'pointer' }}
            >
              <Upload size={16} /> Import List from Text
            </button>
          </div>
        </div>
      )}

      {selectedFactionSlug && factionData && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* List Config & Limits Header */}
          <div className="points-gauge">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>

              {/* Detachment Selector — multiple detachments, budgeted by detachment points */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Detachments:</span>
                  <select
                    value=""
                    onChange={(e) => handleAddDetachment(e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem',
                      flex: 1,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Add Detachment --</option>
                    {factionData.detachments.filter(d => !d.isCombatPatrol && !selectedDetachmentSlugs.includes(d.slug)).map(d => {
                      const cost = d.detachmentPointsCost || 0;
                      const overBudget = usedDetachmentPoints + cost > detachmentPointsLimit;
                      return (
                        <option key={d.slug} value={d.slug} disabled={overBudget}>
                          {d.name} ({cost} DP){d.isFactionPack ? ' (Faction Pack)' : ''}{overBudget ? ' — over budget' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <span
                    title={applicableBattleSize ? `Detachment point budget for ${applicableBattleSize.name} (${applicableBattleSize.pointsLimit} pts)` : 'Detachment point budget'}
                    style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', color: usedDetachmentPoints > detachmentPointsLimit ? 'var(--accent-red)' : 'var(--accent-teal)' }}
                  >
                    {usedDetachmentPoints} / {detachmentPointsLimit} DP
                  </span>
                </div>
                {selectedDetachments.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {selectedDetachments.map(d => (
                      <span
                        key={d.slug}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        {d.name} <span style={{ color: 'var(--text-muted)' }}>({d.detachmentPointsCost || 0} DP)</span>
                        <button
                          onClick={() => handleRemoveDetachment(d.slug)}
                          aria-label={`Remove ${d.name}`}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: '1rem' }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Points gauge & Limits */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>

                {/* Total points label */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TOTAL ROSTER WEIGHT</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalPoints > pointLimit ? 'var(--accent-red)' : 'var(--accent-gold)' }}>
                    {totalPoints} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)' }}>/ {pointLimit} pts</span>
                  </div>
                </div>

                {/* Points limit selector */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {[1000, 2000, 3000].map(limit => (
                    <button
                      key={limit}
                      onClick={() => {
                        setPointLimit(limit);
                        setIsCustomLimit(false);
                      }}
                      style={{
                        background: !isCustomLimit && pointLimit === limit ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                        color: !isCustomLimit && pointLimit === limit ? 'var(--bg-primary)' : 'var(--text-primary)',
                        border: '1px solid var(--glass-border)',
                        padding: '0.4rem 0.8rem',
                        fontSize: '0.85rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {limit}
                    </button>
                  ))}
                  <button
                    onClick={() => setIsCustomLimit(true)}
                    style={{
                      background: isCustomLimit ? 'var(--accent-gold)' : 'var(--bg-tertiary)',
                      color: isCustomLimit ? 'var(--bg-primary)' : 'var(--text-primary)',
                      border: '1px solid var(--glass-border)',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Custom
                  </button>
                </div>

                {isCustomLimit && (
                  <input
                    type="number"
                    value={customLimitInput}
                    onChange={(e) => {
                      setCustomLimitInput(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed > 0) {
                        setPointLimit(parsed);
                      }
                    }}
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      padding: '0.4rem 0.6rem',
                      width: '80px',
                      fontSize: '0.9rem'
                    }}
                  />
                )}

              </div>
            </div>

            {/* Gauge progress bar */}
            <div className="points-progress-container">
              <div
                className={`points-progress-bar ${
                  totalPoints > pointLimit
                    ? 'points-progress-danger'
                    : totalPoints > pointLimit * 0.95
                      ? 'points-progress-warn'
                      : 'points-progress-normal'
                }`}
                style={{ width: `${pointPercentage}%` }}
              />
            </div>
          </div>

          {/* Validation Alerts Bar */}
          {validationErrors.length > 0 && (
            <div className="validation-alert-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-red)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                <ShieldAlert size={16} />
                TACTICAL INCOMPATIBILITIES DETECTED ({validationErrors.length})
              </div>
              {validationErrors.map((err, idx) => (
                <div key={idx} className="validation-alert-item">
                  <AlertTriangle size={12} />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {validationErrors.length === 0 && roster.length > 0 && (
            <div
              className="validation-alert-box"
              style={{ background: 'rgba(16, 185, 129, 0.04)', borderColor: 'rgba(16, 185, 129, 0.15)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-green)', fontWeight: 700, fontSize: '0.9rem' }}>
                <CheckCircle2 size={16} />
                ROSTER COGNIS SYSTEM SIGNATURE VALID: Ready for deployment.
              </div>
            </div>
          )}

          {/* Split Workspace Layout */}
          <div className="builder-layout">

            {/* Left Column: Unit Catalog */}
            <div className="builder-catalog">
              <h3 style={{ textTransform: 'uppercase', color: 'var(--text-primary)', fontSize: '1.05rem', margin: 0 }}>
                Unit Database
              </h3>

              {/* Catalog Search */}
              <div className="search-container" style={{ width: '100%' }}>
                <Search className="search-icon" size={16} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Filter unit by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Quick Filters */}
              <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'character', label: 'Leaders' },
                  { id: 'infantry', label: 'Infantry' },
                  { id: 'vehicle', label: 'Vehicles' },
                  ...(factionData?.alliedUnits && factionData.alliedUnits.length > 0 ? [{ id: 'allies', label: 'Allies' }] : [])
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => setCatalogRole(r.id)}
                    style={{
                      background: catalogRole === r.id ? 'var(--accent-teal)' : 'rgba(255,255,255,0.03)',
                      color: catalogRole === r.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
                      border: 'none',
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Scrollable List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '55vh', overflowY: 'auto' }}>
                {filteredCatalog.map(unit => {
                  const selectedDetachmentId = selectedDetachmentSlugs[0] ? factionData?.detachments.find(d => d.slug === selectedDetachmentSlugs[0])?.id : null;
                  const pts = getDatasheetCosts(unit.appDatasheet, factionData?.factionKeywordIds || [], selectedDetachmentId, factionData?.slug)[0]?.points || 0;

                  return (
                    <div key={unit.slug} className="catalog-item">
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>{unit.name}</div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>{pts} pts</span>
                        {unit.isFactionPack && <span className="badge badge-faction-pack" style={{ fontSize: '0.55rem', padding: '0.05rem 0.2rem', marginLeft: '0.25rem' }}>FP</span>}
                      </div>
                      <button
                        className="button"
                        onClick={() => handleAddUnit(unit)}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Roster Setup */}
            <div className="builder-roster">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ textTransform: 'uppercase', color: 'var(--text-primary)', fontSize: '1.1rem', margin: 0 }}>
                  Active Force Roster
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="button-outline"
                    onClick={() => setIsImportModalOpen(true)}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Upload size={14} /> Import List
                  </button>
                  {roster.length > 0 && (
                    <>
                      <button
                        className="button"
                        onClick={() => setIsPrintPreviewOpen(true)}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Printer size={14} /> Print Slate
                      </button>
                      <button
                        className="button"
                        onClick={() => setIsShareModalOpen(true)}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Share2 size={14} /> Export List
                      </button>
                      <button
                        className="button-outline"
                        onClick={() => setRoster([])}
                        style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}
                      >
                        Clear Roster
                      </button>
                    </>
                  )}
                </div>
              </div>

              {roster.length === 0 ? (
                <div className="panel empty-state" style={{ padding: '4rem 2rem' }}>
                  <Sword size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
                  <p>No units added to active roster yet. Click "+ Add" in the database catalog to start building your squad.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {/* Visual Nesting layout: Bodyguards first, leaders attached inside bodyguard containers */}
                  {bodyguardsInRoster.map(squad => {
                    const attachedLeaders = roster.filter(u => u.isCharacter && u.attachedToId === squad.id);
                    return (
                      <div key={squad.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {/* Bodyguard Card */}
                        {renderRosterCard(squad)}

                        {/* Nested Attached Leaders */}
                        {attachedLeaders.map(leader => (
                          <div key={leader.id} className="nested-leader-wrapper">
                            {renderRosterCard(leader, true)}
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* Independent Characters section */}
                  {independentCharacters.length > 0 && (
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 style={{ textTransform: 'uppercase', color: 'var(--text-secondary)', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem', margin: 0 }}>
                        Independent Characters
                      </h4>
                      {independentCharacters.map(leader => renderRosterCard(leader))}
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {isPrintPreviewOpen && renderPrintPreviewModal()}
      {isImportModalOpen && renderImportModal()}
      {isShareModalOpen && renderShareModal()}

    </div>
  );

  // Helper function to format compact weapon profiles
  function formatCompactWeapon(w: Weapon): string {
    return w.profiles.map(p => {
      const isMelee = p.type === 'melee';
      const skill = isMelee ? (p.weaponSkill || '—') : (p.ballisticSkill || '—');
      const range = isMelee ? 'M' : p.range;
      let rulesSuffix = '';
      if (p.rules && p.rules.length > 0) {
        rulesSuffix = ` (${p.rules.join(', ')})`;
      }
      return `${w.name} [${range}, ${p.attacks}A, ${skill}, S${p.strength}, AP${p.armourPenetration}, ${p.damage}D]${rulesSuffix}`;
    }).join(' / ');
  }

  // Render modal for printing rosters
  function renderPrintPreviewModal() {
    if (!factionData) return null;

    const totalPoints = calculateTotalPoints();

    return (
      <div className="overlay" style={{ display: 'flex' }}>
        <div className="print-preview-modal">

          {/* Modal Header */}
          <div className="modal-header" style={{ alignItems: 'center', background: 'var(--bg-secondary)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ textTransform: 'uppercase', color: 'var(--text-primary)', fontSize: '1.2rem' }}>Roster Print Slate Engine</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Configure tabular matched-play sheets or credit-card-sized ID-1 datacards.
              </p>
            </div>

            {/* Layout Toggles & Actions */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>

              <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '8px' }}>
                <button
                  className={`tab-btn ${printLayout === 'tabular' ? 'active' : ''}`}
                  onClick={() => setPrintLayout('tabular')}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                >
                  Tabular Sheet
                </button>
                <button
                  className={`tab-btn ${printLayout === 'datacards' ? 'active' : ''}`}
                  onClick={() => setPrintLayout('datacards')}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                >
                  ID-1 Datacards
                </button>
              </div>

              <button
                className="button"
                onClick={() => window.print()}
                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Printer size={14} /> Print
              </button>

              <button
                className="button-outline"
                onClick={() => setIsPrintPreviewOpen(false)}
                style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
              >
                Close
              </button>

            </div>
          </div>

          {/* Modal Body / Print Preview Container */}
          <div className="print-preview-body" id="print-slate-root">

            {/* Non-printed header instructions */}
            <div className="no-print" style={{ color: '#000', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.75rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, textTransform: 'uppercase', fontSize: '0.95rem' }}>B&W Print Preview</h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  {printLayout === 'tabular'
                    ? 'Displays a neat battle-ready summary sheet. Adjust page settings to print portrait.'
                    : 'Displays ID-1 credit card size datacards (85.60mm x 53.98mm) with cutting outlines.'
                  }
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', color: '#0f172a' }}>
                <input
                  type="checkbox"
                  checked={collapseDuplicates}
                  onChange={(e) => setCollapseDuplicates(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Collapse Identical Units
              </label>
            </div>

            {printLayout === 'tabular' ? (
              // 1. Tabular matched-play print sheet
              <div style={{ color: '#000', fontFamily: 'sans-serif', textAlign: 'left' }}>
                <div className="print-bw-roster-header">
                  <h2 style={{ textTransform: 'uppercase', color: '#000', fontSize: '1.6rem', margin: '0 0 0.25rem 0' }}>
                    {currentListName}
                  </h2>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', fontWeight: 600 }}>
                    <span>FACTION: {factionData.factionName.toUpperCase()}</span>
                    <span>DETACHMENTS: {selectedDetachments.length > 0 ? selectedDetachments.map(d => d.name).join(' + ').toUpperCase() : 'NONE'}</span>
                    <span>TOTAL: {totalPoints} / {pointLimit} PTS</span>
                  </div>
                </div>

                <table className="print-bw-skim-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ width: '25%' }}>Unit / Attachment</th>
                      <th rowSpan={2} style={{ width: '6%', textAlign: 'center' }}>Models</th>
                      <th rowSpan={2} style={{ width: '6%', textAlign: 'center' }}>Points</th>
                      <th colSpan={7} style={{ textAlign: 'center', borderBottom: '1px solid #cbd5e1' }}>Statline</th>
                      <th rowSpan={2} style={{ width: '39%' }}>Keywords / Enhancements / Key Abilities</th>
                    </tr>
                    <tr>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>M</th>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>T</th>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>Sv</th>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>Inv</th>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>W</th>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>Ld</th>
                      <th style={{ width: '3%', textAlign: 'center', fontSize: '8pt' }}>OC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPrintableRoster(roster, factionData, collapseDuplicates).map(({ unit, indent, roleLabel, count, pointsRange }) => {
                      const matched = findCatalogUnit(unit.unitSlug);
                      const ds = matched?.appDatasheet;
                      const firstModel = ds?.models?.[0];
                      const stats = firstModel?.stats;

                      // Attachment and Warlord labels
                      let detailsLabel = '';
                      if (unit.isWarlord) {
                        detailsLabel += '★ WARLORD ';
                      }
                      if (roleLabel) {
                        detailsLabel += `(${roleLabel})`;
                      }

                      // Enhancements
                      let enhLabel = '';
                      if (unit.enhancementName) {
                        enhLabel = `Enhancement: ${unit.enhancementName} (+${unit.enhancementPoints} pts)`;
                      }

                      // Abilities list
                      const abilities = ds?.abilities.map(a => a.name).join(', ') || '';

                      const nameDisplay = count > 1 ? `${unit.name} (x${count})` : unit.name;

                      return (
                        <tr key={unit.id} style={{ fontSize: '9pt', backgroundColor: indent ? '#f8fafc' : 'transparent' }}>
                          <td style={{ paddingLeft: indent ? '1.5rem' : '0.5rem' }}>
                            {indent && <span style={{ color: '#94a3b8', marginRight: '0.4rem', fontFamily: 'monospace' }}>↳</span>}
                            <strong>{nameDisplay}</strong>
                            {detailsLabel && <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2px' }}>{detailsLabel}</div>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {count > 1 ? `${unit.modelsCount} (x${count})` : unit.modelsCount}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                            {pointsRange}
                          </td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats ? stats.M : '—'}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats ? stats.T : '—'}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats ? stats.Sv : '—'}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats && stats.Inv ? `${stats.Inv}+` : ''}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats ? stats.W : '—'}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats ? stats.Ld : '—'}</td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{stats ? stats.OC : '—'}</td>
                          <td>
                            <div style={{ fontSize: '8.5pt' }}>
                              {firstModel?.keywords.length ? (
                                <div style={{ marginBottom: '2px' }}>
                                  <strong>Keywords:</strong> {firstModel.keywords.join(', ')}
                                </div>
                              ) : null}
                              {enhLabel && <div style={{ marginBottom: '2px', color: '#1d4ed8' }}><strong>{enhLabel}</strong></div>}
                              {abilities && <div><strong>Abilities:</strong> {abilities}</div>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Print Weapon Cheat Sheet in Tabular Layout */}
                {(() => {
                  const uniqueUnitSlugs = Array.from(new Set(roster.map(u => u.unitSlug)));
                  const rangedWeaponRows: React.ReactNode[] = [];
                  const meleeWeaponRows: React.ReactNode[] = [];

                  uniqueUnitSlugs.forEach(slug => {
                    const matched = findCatalogUnit(slug);
                    const ds = matched?.appDatasheet;
                    if (!ds || !ds.models) return;

                    const units = roster.filter(u => u.unitSlug === slug);
                    const seenProfiles = new Set<string>();

                    units.forEach(unit => {
                      const modelCounts = getRosterUnitModelCounts(unit, ds);
                      let isFirstActive = true;

                      ds.models.forEach(model => {
                        const totalModelCount = modelCounts[model.name] || 0;
                        if (totalModelCount === 0) return;
                        const activeWeapons = getUnitActiveWeapons(unit, model, totalModelCount, isFirstActive);
                        isFirstActive = false;

                        activeWeapons.forEach(weapon => {
                          weapon.profiles?.forEach(prof => {
                            const key = `${weapon.name}-${prof.name}-${prof.range}-${prof.attacks}-${prof.strength}-${prof.armourPenetration}-${prof.damage}`;
                            if (seenProfiles.has(key)) return;
                            seenProfiles.add(key);

                            const skill = prof.type === 'melee' ? prof.weaponSkill : prof.ballisticSkill;
                            const isMelee = prof.type === 'melee';

                            const row = (
                              <tr key={`${unit.id}-${key}`} style={{ fontSize: '8.5pt' }}>
                                <td>
                                  <strong>{matched.name}</strong>
                                  <div style={{ fontSize: '8pt', color: '#4b5563' }}>
                                    {weapon.name} {prof.name !== weapon.name ? `(${prof.name})` : ''}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>{isMelee ? 'Melee' : prof.range}</td>
                                <td style={{ textAlign: 'center' }}>{prof.attacks}</td>
                                <td style={{ textAlign: 'center' }}>{skill || '—'}</td>
                                <td style={{ textAlign: 'center' }}>{prof.strength}</td>
                                <td style={{ textAlign: 'center' }}>{prof.armourPenetration}</td>
                                <td style={{ textAlign: 'center' }}>{prof.damage}</td>
                                <td style={{ fontSize: '8pt' }}>
                                  {prof.rules && prof.rules.length > 0 ? (
                                    <div style={{ fontSize: '7.5pt', color: '#4b5563', fontStyle: 'italic' }}>
                                      {prof.rules.join(', ')}
                                    </div>
                                  ) : '—'}
                                </td>
                              </tr>
                            );

                            if (isMelee) {
                              meleeWeaponRows.push(row);
                            } else {
                              rangedWeaponRows.push(row);
                            }
                          });
                        });
                      });
                    });
                  });

                  return (
                    <>
                      {rangedWeaponRows.length > 0 && (
                        <div style={{ marginTop: '2rem' }}>
                          <h3 style={{ textTransform: 'uppercase', borderBottom: '1.5px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', fontSize: '1.1rem', color: '#000' }}>
                            Ranged Weapon Summary Profiles
                          </h3>
                          <table className="print-bw-skim-table">
                            <thead>
                              <tr>
                                <th style={{ width: '25%' }}>Unit / Weapon</th>
                                <th style={{ width: '10%', textAlign: 'center' }}>Range</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>A</th>
                                <th style={{ width: '10%', textAlign: 'center' }}>BS</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>S</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>AP</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>D</th>
                                <th style={{ width: '23%' }}>Rules</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rangedWeaponRows}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {meleeWeaponRows.length > 0 && (
                        <div style={{ marginTop: '2rem' }}>
                          <h3 style={{ textTransform: 'uppercase', borderBottom: '1.5px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', fontSize: '1.1rem', color: '#000' }}>
                            Melee Weapon Summary Profiles
                          </h3>
                          <table className="print-bw-skim-table">
                            <thead>
                              <tr>
                                <th style={{ width: '25%' }}>Unit / Weapon</th>
                                <th style={{ width: '10%', textAlign: 'center' }}>Range</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>A</th>
                                <th style={{ width: '10%', textAlign: 'center' }}>WS</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>S</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>AP</th>
                                <th style={{ width: '8%', textAlign: 'center' }}>D</th>
                                <th style={{ width: '23%' }}>Rules</th>
                              </tr>
                            </thead>
                            <tbody>
                              {meleeWeaponRows}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              // 2. ISO/IEC 7810 ID-1 Datacards Print Grid
              <div className="print-cards-grid">
                {(() => {
                  const cardList = getPrintableCardsRoster(roster, factionData, collapseDuplicates);
                  return cardList.map(({ id, unit, count, pointsDisplay }) => {
                    const matched = findCatalogUnit(unit.unitSlug);
                    const ds = matched?.appDatasheet;
                    const firstModel = ds?.models?.[0];
                    const stats = firstModel?.stats;

                    // Extract and format weapon profiles compactly
                    const formattedWeapons: string[] = [];
                    if (ds) {
                      const modelCounts = getRosterUnitModelCounts(unit, ds);
                      let isFirstActive = true;
                      ds.models.forEach(m => {
                        const totalModelCount = modelCounts[m.name] || 0;
                        if (totalModelCount === 0) return;
                        const activeWeapons = getUnitActiveWeapons(unit, m, totalModelCount, isFirstActive);
                        isFirstActive = false;
                        activeWeapons.forEach(w => {
                          const formatted = formatCompactWeapon(w);
                          if (!formattedWeapons.includes(formatted)) {
                            formattedWeapons.push(formatted);
                          }
                        });
                      });
                    }

                    // Abilities list
                    const abilities = ds?.abilities.map(a => a.name).join(', ') || '';

                    // Attached indicator
                    let attachmentInfo = '';
                    if (unit.isCharacter) {
                      if (unit.attachedToId) {
                        const bodyguardCu = cardList.find(c => c.unit.id === unit.attachedToId || c.id === unit.attachedToId);
                        if (bodyguardCu) {
                          attachmentInfo = `Leads: ${bodyguardCu.unit.name}`;
                        } else {
                          const bodyguard = roster.find(r => r.id === unit.attachedToId);
                          if (bodyguard) {
                            attachmentInfo = `Leads: ${bodyguard.name}`;
                          }
                        }
                      }
                    } else {
                      const leaders = cardList.filter(c => c.unit.isCharacter && (c.unit.attachedToId === unit.id || c.unit.attachedToId === id));
                      if (leaders.length > 0) {
                        attachmentInfo = `Led by: ${leaders.map(l => l.unit.name).join(', ')}`;
                      }
                    }

                    return (
                      <div key={id} className="id1-datacard">

                        {/* Card Header */}
                        <div className="id1-datacard-header">
                          <div className="id1-datacard-title">
                            {unit.isWarlord && <Crown size={8} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'middle' }} />}
                            {unit.virtualName}
                          </div>
                          <div className="id1-datacard-points">
                            {pointsDisplay} | {unit.virtualModelsCount} mdl
                          </div>
                        </div>

                      {/* Statline Table */}
                      {stats ? (
                        <table className="id1-datacard-stats">
                          <thead>
                            <tr>
                              <th>M</th>
                              <th>T</th>
                              <th>Sv</th>
                              <th>W</th>
                              <th>Ld</th>
                              <th>OC</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>{stats.M}</td>
                              <td>{stats.T}</td>
                              <td>{stats.Sv}</td>
                              <td>{stats.W}</td>
                              <td>{stats.Ld}</td>
                              <td>{stats.OC}</td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ fontSize: '6pt', fontStyle: 'italic', margin: '1px 0' }}>No statline available</div>
                      )}

                      {/* Card Body content */}
                      <div className="id1-datacard-body">

                        {/* Keywords row */}
                        {firstModel?.keywords?.length ? (
                          <div className="id1-datacard-row">
                            <strong>KW:</strong> {firstModel.keywords.join(', ')}
                          </div>
                        ) : null}

                        {/* Attachments & Enhancements row */}
                        {(attachmentInfo || unit.enhancementName) && (
                          <div className="id1-datacard-row" style={{ color: '#1e3a8a' }}>
                            {attachmentInfo ? <span>{attachmentInfo}</span> : null}
                            {attachmentInfo && unit.enhancementName ? <span style={{ color: '#cbd5e1', margin: '0 2px' }}>|</span> : null}
                            {unit.enhancementName ? <span>+{unit.enhancementName}</span> : null}
                          </div>
                        )}

                        {/* Weapons List */}
                        {formattedWeapons.length > 0 && (
                          <div className="id1-datacard-weapons-list">
                            <strong>Wpn:</strong> {formattedWeapons.join('; ')}
                          </div>
                        )}

                        {/* Abilities list */}
                        {abilities && (
                          <div className="id1-datacard-abilities-list">
                            <strong>Abil:</strong> {abilities}
                          </div>
                        )}

                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>

        </div>
      </div>
    );
  }

  // Render card UI for a roster unit
  function renderRosterCard(unit: RosterUnit, isNested: boolean = false) {
    if (!factionData) return null;

    // Find original merged unit definition
    const matchedCatalog = findCatalogUnit(unit.unitSlug);
    const isWarlord = unit.isWarlord;

    // Available size options
    const selectedDetachmentId = selectedDetachmentSlugs[0] ? factionData.detachments.find(d => d.slug === selectedDetachmentSlugs[0])?.id : null;
    const costOptions = getDatasheetCosts(matchedCatalog?.appDatasheet, factionData.factionKeywordIds || [], selectedDetachmentId, factionData.slug);

    // Enhancements are offered from every selected detachment (filtered by eligibility)
    const keywords = matchedCatalog?.appDatasheet?.models.flatMap(m => m.keywords) || [];
    const isEpicHero = keywords.some(k => k.toLowerCase() === 'epic hero');
    const eligibleEnhancements = selectedDetachments.flatMap(d => d.enhancements).filter(e => {
      if (isEpicHero) return !!e.isEquipableByEpicHero;
      if (!unit.isCharacter) return !!e.isEquipableByNonCharacterUnit;
      return true;
    }).filter(e => isUnitEligibleForEnhancement(keywords, e));
    const hasFactionNonCharEnh = factionData?.detachments?.some(d => d.enhancements?.some(e => e.isEquipableByNonCharacterUnit)) || false;

    // Leader attach targets (units in roster that are not characters and are compatible)
    const validBodyguards = roster.filter(b => !b.isCharacter);

    return (
      <div className={`roster-unit-card ${isWarlord ? 'is-warlord-card' : ''} ${isNested ? 'nested-leader-card' : ''}`}>

        {/* Top line layout */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0, textTransform: 'uppercase', color: 'var(--text-primary)', fontSize: '1rem' }}>
                {unit.name}
              </h4>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {unit.isWarlord && <span className="badge badge-faction-pack" style={{ background: 'rgba(226, 168, 38, 0.2)' }}>WARLORD</span>}
                {unit.isCharacter && <span className="badge badge-character">Character</span>}
                {unit.isBattleline && <span className="badge badge-infantry" style={{ fontSize: '0.6rem' }}>Battleline</span>}
                {unit.isFactionPack && <span className="badge badge-faction-pack">FP</span>}
                {unit.splitSquad && <span className="badge badge-infantry" style={{ background: 'rgba(20, 184, 166, 0.2)', color: 'var(--accent-teal)', borderColor: 'rgba(20, 184, 166, 0.4)', fontSize: '0.6rem' }}>SPLIT SQUAD</span>}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
              Base Cost: {unit.points} pts | {unit.modelsCount} models {unit.splitSquad && ' (Split into 2x 5 models)'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                {getUnitActualPoints(unit, roster, factionData) + (unit.enhancementPoints || 0)} pts
              </span>
              {getUnitActualPoints(unit, roster, factionData) > unit.points && (
                <span style={{ fontSize: '0.65rem', color: 'var(--accent-red)', fontWeight: 600 }}>
                  (+{getUnitActualPoints(unit, roster, factionData) - unit.points} duplicate cost)
                </span>
              )}
            </div>
            <button
              className="button-outline"
              onClick={() => handleRemoveUnit(unit.id)}
              style={{ padding: '0.25rem 0.5rem', color: 'var(--accent-red)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Builder Interactive Controls (flex wrap) */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}>

          {/* 1. Model step sizes list (non-characters usually have steps) */}
          {costOptions.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Squad Size</span>
              <select
                value={unit.selectedCostIndex}
                onChange={(e) => handleCostIndexChange(unit.id, parseInt(e.target.value, 10))}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                {costOptions.map((opt, idx) => (
                  <option key={idx} value={idx}>
                    {opt.label} ({opt.points} pts)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 2. Attachment triggers (Characters only - only display if there are compatible squads they can lead) */}
          {unit.isCharacter && validBodyguards.filter(b => checkCompatibility(unit, b)).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Attach to Squad</span>
              <select
                value={unit.attachedToId || ''}
                onChange={(e) => handleAttachLeader(unit.id, e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                <option value="">Independent</option>
                {validBodyguards.filter(b => checkCompatibility(unit, b)).map(b => {
                  const check = canAttachCharacterToSquad(unit, b, roster, factionData);
                  return (
                    <option key={b.id} value={b.id} disabled={!check.allowed}>
                      {b.name} ({b.points} pts){!check.allowed ? ` (${check.reason})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* 3. Upgrades / Enhancements selection (if eligible enhancements exist or detachment is not selected) */}
          {selectedDetachments.length > 0 ? (
            eligibleEnhancements.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Detachment Upgrade</span>
                <select
                  value={unit.enhancementName || ''}
                  onChange={(e) => handleSelectEnhancement(unit.id, e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="none">-- Select Upgrade --</option>
                  {selectedDetachments.length === 1 ? (
                    eligibleEnhancements.map(e => {
                      const alreadySelectedCount = roster.filter(u => u.id !== unit.id && u.enhancementName === e.name).length;
                      const isLimitReached = alreadySelectedCount >= (e.limit ?? 1);
                      return (
                        <option key={e.name} value={e.name} disabled={isLimitReached}>
                          {e.name} (+{e.pointsCost} pts){isLimitReached ? ' (Limit Reached)' : ''}
                        </option>
                      );
                    })
                  ) : (
                    selectedDetachments.map(d => {
                      const detEligible = d.enhancements.filter(e => {
                        if (isEpicHero) return !!e.isEquipableByEpicHero;
                        if (!unit.isCharacter) return !!e.isEquipableByNonCharacterUnit;
                        return true;
                      }).filter(e => isUnitEligibleForEnhancement(keywords, e));
                      if (detEligible.length === 0) return null;
                      return (
                        <optgroup key={d.slug} label={d.name}>
                          {detEligible.map(e => {
                            const alreadySelectedCount = roster.filter(u => u.id !== unit.id && u.enhancementName === e.name).length;
                            const isLimitReached = alreadySelectedCount >= (e.limit ?? 1);
                            return (
                              <option key={e.name} value={e.name} disabled={isLimitReached}>
                                {e.name} (+{e.pointsCost} pts){isLimitReached ? ' (Limit Reached)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })
                  )}
                </select>
              </div>
            )
          ) : (
            (unit.isCharacter || hasFactionNonCharEnh) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>
                Select a Detachment to enable Upgrades
              </span>
            )
          )}

          {/* 4. Warlord switch (Characters only) */}
          {unit.isCharacter && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: unit.isWarlord ? 'var(--accent-gold)' : 'var(--text-secondary)',
                userSelect: 'none',
                marginLeft: 'auto',
                fontWeight: unit.isWarlord ? 700 : 400
              }}
            >
              <input
                type="checkbox"
                checked={unit.isWarlord || false}
                onChange={() => handleToggleWarlord(unit.id)}
                style={{ cursor: 'pointer' }}
              />
              Warlord
            </label>
          )}

          {/* 5. Split Squad switch (eligible squads only) */}
          {canUnitSplit(unit.name, unit.modelsCount, matchedCatalog?.appDatasheet?.abilities || [], matchedCatalog?.appDatasheet?.rules || []) && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: unit.splitSquad ? 'var(--accent-teal)' : 'var(--text-secondary)',
                userSelect: 'none',
                marginLeft: unit.isCharacter ? '1rem' : 'auto',
                fontWeight: unit.splitSquad ? 700 : 400
              }}
            >
              <input
                type="checkbox"
                checked={unit.splitSquad || false}
                onChange={() => handleToggleSplitSquad(unit.id)}
                style={{ cursor: 'pointer' }}
              />
              Combat Squad Split
            </label>
          )}

        </div>

        {/* Wargear Choices Section */}
        {(() => {
          if (!matchedCatalog?.appDatasheet) return null;
          const modelCounts = getRosterUnitModelCounts(unit, matchedCatalog.appDatasheet);

          const unitWideSets = Array.from(
            new Map(
              matchedCatalog.appDatasheet.models
                .flatMap(model => model.wargearChoiceSets || [])
                .filter(set => {
                  if (set.miniatureId) return false;
                  if (set.choices.length === 0) return false;
                  if (set.choices.length === 1) {
                    const choice = set.choices[0];
                    const firstModel = matchedCatalog.appDatasheet!.models[0];
                    const isDefault = choice.items.every(item => firstModel?.weapons?.some(w => w.name === item.name));
                    if (isDefault) return false;
                  }
                  return true;
                })
                .map(set => [set.id, set])
            ).values()
          );

          const hasDisplayableWargear = unitWideSets.length > 0 || matchedCatalog.appDatasheet.models.some(model => {
            const totalModelCount = modelCounts[model.name] || 0;
            if (totalModelCount === 0) return false;
            return (model.wargearChoiceSets || []).some(set => {
              if (!set.miniatureId) return false; // Filter out unit-wide sets
              if (set.choices.length === 0) return false;
              if (set.choices.length === 1) {
                const choice = set.choices[0];
                const isDefault = choice.items.every(item => model.weapons?.some(w => w.name === item.name));
                if (isDefault) return false;
              }
              return true;
            });
          });

          if (!hasDisplayableWargear) return null;

          const renderWargearChoiceSet = (set: WargearChoiceSet, totalModelCount: number, model: Model, setIdx: number) => {
            const isSingleChoiceOptional = set.choices.length === 1;
            const isSingleChoiceSelect = set.choices.length > 1 && set.limit === 1 && totalModelCount === 1;

            if (isSingleChoiceOptional) {
              const choice = set.choices[0];
              const label = choice.items.map(item => `${item.name}${item.count > 1 ? ` x${item.count}` : ''}`).join(', ');
              const isChecked = (unit.wargearCounts?.[choice.id] || 0) > 0;
              return (
                <div key={set.id || setIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.8rem',
                      color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        handleWargearCountChange(unit.id, choice.id, e.target.checked ? 1 : 0);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    {label}
                  </label>
                </div>
              );
            } else if (isSingleChoiceSelect) {
              const selectedChoiceId = set.choices.find(c => (unit.wargearCounts?.[c.id] || 0) > 0)?.id || '';
              return (
                <div key={set.id || setIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Choose 1 option (Limit {set.limit})
                  </span>
                  <select
                    value={selectedChoiceId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRoster(prev => prev.map(u => {
                        if (u.id !== unit.id) return u;
                        const currentCounts = u.wargearCounts ? { ...u.wargearCounts } : {};
                        set.choices.forEach(c => {
                          delete currentCounts[c.id];
                        });
                        if (val) {
                          currentCounts[val] = 1;
                        }
                        return { ...u, wargearCounts: currentCounts };
                      }));
                    }}
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '6px',
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      width: '100%',
                      maxWidth: '400px'
                    }}
                  >
                    <option value="">-- Default Loadout --</option>
                    {set.choices.map((choice, cidx) => {
                      const label = choice.items.map(item => `${item.name}${item.count > 1 ? ` x${item.count}` : ''}`).join(', ');
                      return (
                        <option key={choice.id || cidx} value={choice.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            } else {
              const maxAllowed = set.limit * (set.miniatureId ? totalModelCount : 1);
              const setAllocatedCount = set.choices.reduce((sum, choice) => sum + (unit.wargearCounts?.[choice.id] || 0), 0);
              const remainder = Math.max(0, maxAllowed - setAllocatedCount);

              return (
                <div key={set.id || setIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '0.2rem' }}>
                    <span>Options (Limit: {maxAllowed})</span>
                    {totalModelCount > 1 && (
                      <span style={{ color: remainder > 0 ? 'var(--accent-teal)' : 'var(--text-secondary)' }}>
                        Default ({model.weapons.map(w => `${w.name}${w.count > 1 ? ` x${w.count}` : ''}`).join(', ')}) remaining: {remainder}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {set.choices.map((choice, cidx) => {
                      const label = choice.items.map(item => `${item.name}${item.count > 1 ? ` x${item.count}` : ''}`).join(', ');
                      const currentCount = unit.wargearCounts?.[choice.id] || 0;
                      const isDefaultChoice = choice.items.every(item => model.weapons?.some(w => w.name === item.name));

                      if (isDefaultChoice) return null;

                      return (
                        <div key={choice.id || cidx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', fontSize: '0.75rem' }}>
                          <span style={{ color: currentCount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={() => handleWargearCountChange(unit.id, choice.id, currentCount - 1)}
                              disabled={currentCount <= 0}
                              style={{
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                                borderRadius: '4px',
                                cursor: currentCount <= 0 ? 'not-allowed' : 'pointer',
                                opacity: currentCount <= 0 ? 0.3 : 1
                              }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: '15px', textAlign: 'center', fontWeight: currentCount > 0 ? 'bold' : 'normal' }}>
                              {currentCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleWargearCountChange(unit.id, choice.id, currentCount + 1)}
                              disabled={remainder <= 0}
                              style={{
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                                borderRadius: '4px',
                                cursor: remainder <= 0 ? 'not-allowed' : 'pointer',
                                opacity: remainder <= 0 ? 0.3 : 1
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
          };

          return (
            <div style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.04)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '0.25rem', marginBottom: '0.25rem' }}>
                Wargear Selections
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {matchedCatalog.appDatasheet.models.map(model => {
                  const totalModelCount = modelCounts[model.name] || 0;
                  if (totalModelCount === 0) return null;

                  const modelSets = (model.wargearChoiceSets || []).filter(set => {
                    if (!set.miniatureId) return false; // Filter out unit-wide sets
                    if (set.choices.length === 0) return false;
                    if (set.choices.length === 1) {
                      const choice = set.choices[0];
                      const isDefault = choice.items.every(item => model.weapons?.some(w => w.name === item.name));
                      if (isDefault) return false;
                    }
                    return true;
                  });

                  if (modelSets.length === 0) return null;

                  return (
                    <div key={model.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                      {matchedCatalog.appDatasheet!.models.length > 1 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent-teal)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          {model.name} Options ({totalModelCount} models)
                        </div>
                      )}
                      {modelSets.map((set, setIdx) => renderWargearChoiceSet(set, totalModelCount, model, setIdx))}
                    </div>
                  );
                })}

                {unitWideSets.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left' }}>
                    {matchedCatalog.appDatasheet.models.length > 1 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-teal)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        Unit Options
                      </div>
                    )}
                    {unitWideSets.map((set, setIdx) => {
                      const firstModel = matchedCatalog.appDatasheet!.models[0];
                      return renderWargearChoiceSet(set, 1, firstModel, setIdx);
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    );
  }

  function renderImportModal() {
    return (
      <div className="overlay" style={{ display: 'flex', zIndex: 1000 }}>
        <div className="print-preview-modal" style={{ maxWidth: '600px', height: 'auto', maxHeight: '95vh', margin: 'auto' }}>
          <div className="modal-header" style={{ alignItems: 'center', background: 'var(--bg-secondary)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ textTransform: 'uppercase', color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0 }}>Import Force Roster</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Paste BattleForge export text from the Warhammer 40k Companion App.
              </p>
            </div>
            <button
              className="button-outline"
              onClick={() => setIsImportModalOpen(false)}
              style={{ fontSize: '0.85rem', padding: '0.3rem 0.6rem' }}
            >
              Close
            </button>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-primary)' }}>
            {dbRosters.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Rosters Found In Your Database
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {dbRosters.map(r => (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        padding: '0.6rem 0.75rem'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          {r.factionName}
                          {r.pointsLimit ? ` · ${r.pointsLimit} pts` : ''}
                          {` · ${r.unitCount} unit${r.unitCount === 1 ? '' : 's'}`}
                        </div>
                      </div>
                      <button
                        className="button"
                        onClick={() => handleImportDbRoster(r.id)}
                        disabled={importingDbRosterId !== null}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem', flexShrink: 0 }}
                      >
                        {importingDbRosterId === r.id ? 'Importing…' : 'Import'}
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ margin: '0.85rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>or paste export text</span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                </div>
              </div>
            )}
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"EXPORTED FROM THE WARHAMMER 40,000 APP\nMy Strike Force (2000 points)\nMy Detachment\n\nCHARACTERS\n\nMy Character (100 points)\n• Warlord\n• Enhancement: My Enhancement"}
              style={{
                width: '100%',
                height: '300px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)',
                resize: 'vertical',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="button-outline"
                onClick={() => setImportText('')}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                Clear
              </button>
              <button
                className="button"
                onClick={handleImportExecute}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
              >
                Execute Import
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderShareModal() {
    const textContent = generateRosterText(
      roster,
      factionData,
      selectedDetachmentSlugs,
      shareFormat
    );

    const handleCopy = () => {
      navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };

    return (
      <div className="overlay" style={{ display: 'flex', zIndex: 1000 }}>
        <div className="print-preview-modal" style={{ maxWidth: '600px', height: 'auto', maxHeight: '95vh', margin: 'auto' }}>
          <div className="modal-header" style={{ alignItems: 'center', background: 'var(--bg-secondary)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ textTransform: 'uppercase', color: 'var(--text-primary)', fontSize: '1.2rem', margin: 0 }}>Export Force Roster</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Export your current roster to multiple popular text formats.
              </p>
            </div>
            <button
              className="button-outline"
              onClick={() => {
                setIsShareModalOpen(false);
                setIsCopied(false);
              }}
              style={{ fontSize: '0.85rem', padding: '0.3rem 0.6rem' }}
            >
              Close
            </button>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-primary)' }}>
            
            {/* Format Selection Tab bar */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <button
                onClick={() => setShareFormat('app')}
                style={{
                  background: shareFormat === 'app' ? 'var(--accent-gold)' : 'transparent',
                  color: shareFormat === 'app' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: shareFormat === 'app' ? 'none' : '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Official App Export
              </button>
              <button
                onClick={() => setShareFormat('standard')}
                style={{
                  background: shareFormat === 'standard' ? 'var(--accent-gold)' : 'transparent',
                  color: shareFormat === 'standard' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: shareFormat === 'standard' ? 'none' : '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Standard Casual
              </button>
              <button
                onClick={() => setShareFormat('wtc')}
                style={{
                  background: shareFormat === 'wtc' ? 'var(--accent-gold)' : 'transparent',
                  color: shareFormat === 'wtc' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: shareFormat === 'wtc' ? 'none' : '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Tournament WTC
              </button>
            </div>

            <textarea
              readOnly
              value={textContent}
              style={{
                width: '100%',
                height: '300px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)',
                resize: 'none',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', alignItems: 'center' }}>
              {isCopied && (
                <span style={{ fontSize: '0.85rem', color: 'var(--accent-teal)', fontWeight: 500 }}>
                  Copied list to clipboard!
                </span>
              )}
              <button
                className="button"
                onClick={handleCopy}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
};

const RefreshSpinner = () => (
  <div style={{ display: 'inline-flex', animation: 'spin 1.5s linear infinite' }}>
    <svg style={{ width: '36px', height: '36px', stroke: 'var(--accent-teal)', fill: 'none' }} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="30 10" />
    </svg>
  </div>
);
