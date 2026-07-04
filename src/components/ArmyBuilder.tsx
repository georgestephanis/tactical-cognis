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
  Upload
} from 'lucide-react';
import { loadAndMergeFaction, normalizeName, getDatasheetCosts } from '../utils/dataMapper';
import type { MergedFaction } from '../utils/dataMapper';
import { getBattleSizes } from '../utils/db';
import type { BattleSize } from '../utils/db';
import type { RosterUnit, MergedUnit, MergedDetachment, ArmyList, Weapon, Model, Datasheet } from '../types/data';

const FACTION_NAMES: Record<string, string> = {
  'adepta-sororitas': 'Adepta Sororitas',
  'adeptus-custodes': 'Adeptus Custodes',
  'adeptus-mechanicus': 'Adeptus Mechanicus',
  'aeldari': 'Aeldari',
  'astra-militarum': 'Astra Militarum',
  'black-templars': 'Black Templars',
  'blood-angels': 'Blood Angels',
  'dark-angels': 'Dark Angels',
  'space-wolves': 'Space Wolves',
  'deathwatch': 'Deathwatch',
  'space-marines': 'Space Marines',
  'chaos-daemons': 'Chaos Daemons',
  'chaos-knights': 'Chaos Knights',
  'chaos-space-marines': 'Chaos Space Marines',
  'chaos-titan-legions': 'Chaos Titan Legions',
  'death-guard': 'Death Guard',
  'drukhari': 'Drukhari',
  'emperors-children': "Emperor's Children",
  'genestealer-cults': 'Genestealer Cults',
  'grey-knights': 'Grey Knights',
  'imperial-agents': 'Imperial Agents',
  'imperial-knights': 'Imperial Knights',
  'leagues-of-votann': 'Leagues of Votann',
  'necrons': 'Necrons',
  'orks': 'Orks',
  'tau-empire': "T'au Empire",
  'thousand-sons': 'Thousand Sons',
  'titan-legions': 'Titan Legions',
  'tyranids': 'Tyranids',
  'world-eaters': 'World Eaters'
};

interface ParsedRosterUnit {
  name: string;
  points: number;
  isWarlord: boolean;
  enhancementName?: string;
  rawModelCounts: { name: string; count: number }[];
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

  const exactPointsIdx = costs.findIndex(c => c.points === parsedPoints);
  if (exactPointsIdx !== -1) {
    return exactPointsIdx;
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

function findFactionSlugByName(rosterHeaderLine: string): { slug: string; name: string } | null {
  const normalizedHeader = rosterHeaderLine.toLowerCase();

  for (const [slug, name] of Object.entries(FACTION_NAMES)) {
    const normName = name.toLowerCase();
    const baseWord = normName.replace(/s$/, '');
    if (normalizedHeader.includes(normName) || (baseWord.length > 3 && normalizedHeader.includes(baseWord))) {
      return { slug, name };
    }
  }

  if (normalizedHeader.includes('ork')) return { slug: 'orks', name: 'Orks' };
  if (normalizedHeader.includes('necron')) return { slug: 'necrons', name: 'Necrons' };
  if (normalizedHeader.includes('tyranid')) return { slug: 'tyranids', name: 'Tyranids' };
  if (normalizedHeader.includes('sororitas') || normalizedHeader.includes('sister')) return { slug: 'adepta-sororitas', name: 'Adepta Sororitas' };
  if (normalizedHeader.includes('custodes')) return { slug: 'adeptus-custodes', name: 'Adeptus Custodes' };
  if (normalizedHeader.includes('mechanicus') || normalizedHeader.includes('admech')) return { slug: 'adeptus-mechanicus', name: 'Adeptus Mechanicus' };
  if (normalizedHeader.includes('aeldari') || normalizedHeader.includes('eldar')) return { slug: 'aeldari', name: 'Aeldari' };
  if (normalizedHeader.includes('militarum') || normalizedHeader.includes('guard')) return { slug: 'astra-militarum', name: 'Astra Militarum' };
  if (normalizedHeader.includes('templar')) return { slug: 'black-templars', name: 'Black Templars' };
  if (normalizedHeader.includes('blood angel')) return { slug: 'blood-angels', name: 'Blood Angels' };
  if (normalizedHeader.includes('dark angel')) return { slug: 'dark-angels', name: 'Dark Angels' };
  if (normalizedHeader.includes('wolf') || normalizedHeader.includes('wolves')) return { slug: 'space-wolves', name: 'Space Wolves' };
  if (normalizedHeader.includes('deathwatch')) return { slug: 'deathwatch', name: 'Deathwatch' };
  if (normalizedHeader.includes('daemon')) return { slug: 'chaos-daemons', name: 'Chaos Daemons' };
  if (normalizedHeader.includes('chaos knight')) return { slug: 'chaos-knights', name: 'Chaos Knights' };
  if (normalizedHeader.includes('heretic') || normalizedHeader.includes('chaos space marine')) return { slug: 'chaos-space-marines', name: 'Chaos Space Marines' };
  if (normalizedHeader.includes('death guard')) return { slug: 'death-guard', name: 'Death Guard' };
  if (normalizedHeader.includes('drukhari') || normalizedHeader.includes('dark eldar')) return { slug: 'drukhari', name: 'Drukhari' };
  if (normalizedHeader.includes('children')) return { slug: 'emperors-children', name: "Emperor's Children" };
  if (normalizedHeader.includes('genestealer') || normalizedHeader.includes('gsc')) return { slug: 'genestealer-cults', name: 'Genestealer Cults' };
  if (normalizedHeader.includes('grey knight')) return { slug: 'grey-knights', name: 'Grey Knights' };
  if (normalizedHeader.includes('agent')) return { slug: 'imperial-agents', name: 'Imperial Agents' };
  if (normalizedHeader.includes('knight')) return { slug: 'imperial-knights', name: 'Imperial Knights' };
  if (normalizedHeader.includes('votann') || normalizedHeader.includes('squat')) return { slug: 'leagues-of-votann', name: 'Leagues of Votann' };
  if (normalizedHeader.includes('tau') || normalizedHeader.includes('t\'au')) return { slug: 'tau-empire', name: "T'au Empire" };
  if (normalizedHeader.includes('thousand sons')) return { slug: 'thousand-sons', name: 'Thousand Sons' };
  if (normalizedHeader.includes('world eater')) return { slug: 'world-eaters', name: 'World Eaters' };
  if (normalizedHeader.includes('space marine') || normalizedHeader.includes('astartes')) return { slug: 'space-marines', name: 'Space Marines' };

  return null;
}

function parseBattleForgeText(text: string): ParsedRoster {
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

  let headerIndex: number;
  const signatureIndex = lines.findIndex(l => l.toUpperCase().includes('EXPORTED FROM THE WARHAMMER'));

  if (signatureIndex !== -1) {
    headerIndex = signatureIndex + 1;
  } else {
    headerIndex = lines.findIndex(l => /\(\d+\s*points?\)/i.test(l));
  }

  if (headerIndex !== -1 && headerIndex < lines.length) {
    const headerLine = lines[headerIndex];
    const match = headerLine.match(/^(.+?)\s*\(\s*(\d+)\s*points?\s*\)/i);
    if (match) {
      parsed.rosterName = match[1].trim();
      parsed.pointLimit = parseInt(match[2], 10);
    } else {
      parsed.rosterName = headerLine;
    }

    const factionMatch = findFactionSlugByName(headerLine);
    if (factionMatch) {
      parsed.factionSlug = factionMatch.slug;
      parsed.factionName = factionMatch.name;
    }

    const possibleDetachmentIndex = headerIndex + 1;
    if (possibleDetachmentIndex < lines.length) {
      const nextLine = lines[possibleDetachmentIndex];
      const isCategory = /^(CHARACTERS|BATTLELINE|DEDICATED TRANSPORTS|OTHER DATASHEETS|ALLIED UNITS|FORTIFICATIONS)$/i.test(nextLine);
      if (!isCategory && !nextLine.toUpperCase().includes('EXPORTED FROM THE WARHAMMER')) {
        parsed.detachmentName = nextLine.trim();
      }
    }
  }

  let currentUnit: ParsedRosterUnit | null = null;
  const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const upperLine = line.toUpperCase();

    if (line === parsed.detachmentName) {
      continue;
    }

    if (upperLine.includes('EXPORTED FROM THE WARHAMMER')) {
      continue;
    }

    if (/^(CHARACTERS|BATTLELINE|DEDICATED TRANSPORTS|OTHER DATASHEETS|ALLIED UNITS|FORTIFICATIONS)$/i.test(line)) {
      continue;
    }

    const isBullet = line.startsWith('•') || line.startsWith('*') || line.startsWith('-');
    if (isBullet) {
      if (!currentUnit) continue;

      const content = line.substring(1).trim();
      const upperContent = content.toUpperCase();

      if (upperContent === 'WARLORD') {
        currentUnit.isWarlord = true;
      } else if (upperContent.startsWith('ENHANCEMENT:')) {
        const enhName = content.substring('Enhancement:'.length).trim();
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
      const unitMatch = line.match(/^(.+?)\s*\(\s*(\d+)\s*points?\s*\)/i);
      if (unitMatch) {
        if (currentUnit) {
          parsed.units.push(currentUnit);
        }
        currentUnit = {
          name: unitMatch[1].trim(),
          points: parseInt(unitMatch[2], 10),
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
    datasheet.models.forEach(model => {
      counts[model.name] = model.id === datasheet.models[0].id ? unit.modelsCount : 0;
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
function getUnitActiveWeapons(
  unit: RosterUnit,
  model: Model,
  totalModelCount: number
): Weapon[] {
  if (!model.weapons) return [];
  const wargearCounts = unit.wargearCounts || {};

  const sets = model.wargearChoiceSets || [];
  if (sets.length === 0) {
    return model.weapons.map(w => ({ ...w, count: w.count * totalModelCount }));
  }

  let activeWeapons: Weapon[] = [];
  let defaultCount = totalModelCount;

  // Separate choice sets into replacement sets (swaps) and addition sets
  const replacementSets = sets.filter(set =>
    set.alternate || set.choices.some(choice => 
      choice.items.some(item => model.weapons.some(w => w.name === item.name))
    )
  );

  const additionSets = sets.filter(set => !replacementSets.includes(set));

  // Process replacement sets
  replacementSets.forEach(set => {
    let selectedSetCount = 0;
    set.choices.forEach(choice => {
      const count = wargearCounts[choice.id] || 0;
      selectedSetCount += count;
    });

    const actualSelectedCount = Math.min(totalModelCount, selectedSetCount);
    const setRemainder = totalModelCount - actualSelectedCount;
    
    if (setRemainder < defaultCount) {
      defaultCount = setRemainder;
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

  // Now add the default weapons scaled by defaultCount
  if (defaultCount > 0) {
    model.weapons.forEach(w => {
      const existing = activeWeapons.find(aw => aw.name === w.name);
      if (existing) {
        existing.count += w.count * defaultCount;
      } else {
        activeWeapons.push({
          ...w,
          count: w.count * defaultCount
        });
      }
    });
  }

  // Process addition sets (e.g. Ammo Runts, Grot Orderlies, Seeker Missiles)
  additionSets.forEach(set => {
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

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');

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
    const unit = factionData.units.find(u => u.slug === character.unitSlug);
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

    for (const parsedUnit of parsed.units) {
      const normParsedName = normalizeName(parsedUnit.name);

      let matchedUnit = faction.units.find(u => normalizeName(u.name) === normParsedName);
      if (!matchedUnit) {
        matchedUnit = faction.units.find(u => {
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

      const parsedModelsCount = parsedUnit.rawModelCounts.reduce((sum, item) => sum + item.count, 0);

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

      newRosterUnits.push({
        id: makeRosterUnitId(matchedUnit.slug),
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
        enhancementPoints: enhancementPoints > 0 ? enhancementPoints : undefined
      });
    }

    setRoster(newRosterUnits);

    if (parsed.rosterName) {
      setCurrentListName(parsed.rosterName);
    }
    if (parsed.pointLimit) {
      setPointLimit(parsed.pointLimit);
      setCustomLimitInput(parsed.pointLimit.toString());
      setIsCustomLimit(![1000, 2000, 3000].includes(parsed.pointLimit));
    }

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

  const handleImportExecute = () => {
    if (!importText.trim()) return;

    try {
      const parsed = parseBattleForgeText(importText);

      if (parsed.units.length === 0) {
        alert("No units found to import. Please check that the raw text is from the Warhammer 40k Companion App export.");
        return;
      }

      if (parsed.factionSlug && parsed.factionSlug !== selectedFactionSlug) {
        const newFactionName = FACTION_NAMES[parsed.factionSlug] || parsed.factionName || parsed.factionSlug;
        const confirmSwitch = confirm(
          `This list is for the "${newFactionName}" faction, but your current workspace is "${selectedFactionSlug ? FACTION_NAMES[selectedFactionSlug] : 'None'}".\n\n` +
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
    const costs = getDatasheetCosts(mergedUnit.appDatasheet);
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

      const merged = factionData.units.find(mu => mu.slug === u.unitSlug);
      const costs = getDatasheetCosts(merged?.appDatasheet);

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
      return sum + u.points + (u.enhancementPoints || 0);
    }, 0);
  };

  // Filter list of catalog units
  const filteredCatalog = factionData ? factionData.units.filter(unit => {
    if (unit.isCombatPatrol || unit.pointsRange.min === 0) return false;
    const matchesSearch = unit.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (catalogRole === 'all') return true;

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

  const selectedDetachments = factionData
    ? selectedDetachmentSlugs
        .map(slug => factionData.detachments.find(d => d.slug === slug))
        .filter((d): d is MergedDetachment => !!d)
    : [];
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
    const enhancedUnits = roster.filter(u => u.enhancementName);
    if (enhancedUnits.length > enhancementLimit) {
      validationErrors.push(`Exceeded enhancement limit: selected ${enhancedUnits.length} enhancements (Max is ${enhancementLimit}${applicableBattleSize ? ` for ${applicableBattleSize.name}` : ''}).`);
    }

    const seenEnhancements = new Set<string>();
    enhancedUnits.forEach(u => {
      if (u.enhancementName) {
        if (seenEnhancements.has(u.enhancementName)) {
          validationErrors.push(`Duplicate enhancement selected: "${u.enhancementName}" is assigned to multiple units.`);
        }
        seenEnhancements.add(u.enhancementName);

        // Cannot be Warlord enhancement restriction (search every selected detachment)
        if (u.isWarlord) {
          const matchedEnh = selectedDetachments
            .flatMap(d => d.enhancements)
            .find(e => e.name === u.enhancementName);
          if (matchedEnh?.cannotBeWarlord) {
            validationErrors.push(`Invalid Enhancement: "${u.enhancementName}" cannot be given to your Warlord.`);
          }
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
      const matched = factionData.units.find(mu => mu.slug === u.unitSlug);
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
        ds.models.forEach(model => {
          model.wargearChoiceSets?.forEach(regSet => {
            regSet.choices.forEach(regChoice => {
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
              {selectedFactionSlug ? FACTION_NAMES[selectedFactionSlug] : "ARMY LIST BUILDER"}
            </h2>
          </div>

          {/* Faction selector */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
              {Object.entries(FACTION_NAMES).map(([slug, name]) => (
                <option key={slug} value={slug}>{name}</option>
              ))}
            </select>
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
            {/* Active List Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Active List:</span>
              <span style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>{currentListName}</span>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Load controls */}
              {savedArmies.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <FolderOpen size={14} style={{ color: 'var(--text-secondary)' }} />
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
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Load Saved List --</option>
                    {savedArmies.map(a => (
                      <option key={a.name} value={a.name}>{a.name} ({a.factionName})</option>
                    ))}
                  </select>
                  {currentListName && savedArmies.some(a => a.name === currentListName) && (
                    <button
                      onClick={() => handleDeleteRoster(currentListName)}
                      className="button-outline"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}

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
        <div className="panel empty-state">
          <Sword size={48} style={{ color: 'var(--accent-gold)', marginBottom: '1.25rem' }} />
          <h3>No Faction Loaded</h3>
          <p>Please select a faction from the drop-down menu above to begin assembling your combat patrol or army roster.</p>
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
                  { id: 'vehicle', label: 'Vehicles' }
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
                  const pts = getDatasheetCosts(unit.appDatasheet)[0]?.points || 0;

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
            <div className="no-print" style={{ color: '#000', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h4 style={{ margin: 0, textTransform: 'uppercase', fontSize: '0.95rem' }}>B&W Print Preview</h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                {printLayout === 'tabular'
                  ? 'Displays a neat battle-ready summary sheet. Adjust page settings to print portrait.'
                  : 'Displays ID-1 credit card size datacards (85.60mm x 53.98mm) with cutting outlines.'
                }
              </p>
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
                      <th style={{ width: '25%' }}>Unit / Attachment</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Models</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Points</th>
                      <th style={{ width: '25%', textAlign: 'center' }}>Statline (M / T / Sv / W / Ld / OC)</th>
                      <th style={{ width: '34%' }}>Keywords / Enhancements / Key Abilities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map(unit => {
                      const matched = factionData.units.find(mu => mu.slug === unit.unitSlug);
                      const ds = matched?.appDatasheet;
                      const firstModel = ds?.models?.[0];
                      const stats = firstModel?.stats;

                      // Attachment and Warlord labels
                      let detailsLabel = '';
                      if (unit.isWarlord) {
                        detailsLabel += '★ WARLORD ';
                      }
                      if (unit.isCharacter) {
                        if (unit.attachedToId) {
                          const bodyguard = roster.find(r => r.id === unit.attachedToId);
                          detailsLabel += `(Attached to ${bodyguard?.name || 'Bodyguard'})`;
                        } else {
                          detailsLabel += '(Independent)';
                        }
                      } else {
                        const leaders = roster.filter(r => r.isCharacter && r.attachedToId === unit.id);
                        if (leaders.length > 0) {
                          detailsLabel += `[Leaders: ${leaders.map(l => l.name).join(', ')}]`;
                        }
                      }

                      // Enhancements
                      let enhLabel = '';
                      if (unit.enhancementName) {
                        enhLabel = `Enhancement: ${unit.enhancementName} (+${unit.enhancementPoints} pts)`;
                      }

                      // Abilities list
                      const abilities = ds?.abilities.map(a => a.name).join(', ') || '';

                      return (
                        <tr key={unit.id} style={{ fontSize: '9pt' }}>
                          <td>
                            <strong>{unit.name}</strong>
                            {detailsLabel && <div style={{ fontSize: '8pt', color: '#4b5563', marginTop: '2px' }}>{detailsLabel}</div>}
                          </td>
                          <td style={{ textAlign: 'center' }}>{unit.modelsCount}</td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                            {unit.points + (unit.enhancementPoints || 0)}
                          </td>
                          <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                            {stats
                              ? `${stats.M} | ${stats.T} | ${stats.Sv} | ${stats.W} | ${stats.Ld} | ${stats.OC}`
                              : '—'
                            }
                          </td>
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
                <div style={{ marginTop: '2rem' }}>
                  <h3 style={{ textTransform: 'uppercase', borderBottom: '1.5px solid #000', paddingBottom: '0.25rem', marginBottom: '0.75rem', fontSize: '1.1rem', color: '#000' }}>
                    Weapon Summary Profiles
                  </h3>
                  <table className="print-bw-skim-table">
                    <thead>
                      <tr>
                        <th style={{ width: '25%' }}>Unit / Weapon</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Range</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>A</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>BS / WS</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>S</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>AP</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>D</th>
                        <th style={{ width: '23%' }}>Rules</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(unit => {
                        const matched = factionData.units.find(mu => mu.slug === unit.unitSlug);
                        const ds = matched?.appDatasheet;
                        if (!ds || !ds.models) return null;

                        // Get all weapon profiles across models
                        const weaponRows: React.ReactNode[] = [];
                        const seenProfiles = new Set<string>();
                        const modelCounts = getRosterUnitModelCounts(unit, ds);

                        ds.models.forEach(model => {
                          const totalModelCount = modelCounts[model.name] || 0;
                          if (totalModelCount === 0) return;
                          const activeWeapons = getUnitActiveWeapons(unit, model, totalModelCount);
                          activeWeapons.forEach(weapon => {
                            weapon.profiles?.forEach(prof => {
                              const key = `${weapon.name}-${prof.name}-${prof.range}`;
                              if (seenProfiles.has(key)) return;
                              seenProfiles.add(key);

                              const skill = prof.type === 'melee' ? prof.weaponSkill : prof.ballisticSkill;

                              weaponRows.push(
                                <tr key={key} style={{ fontSize: '8.5pt' }}>
                                  <td>
                                    <strong>{unit.name}</strong>
                                    <div style={{ fontSize: '8pt', color: '#4b5563' }}>
                                      {weapon.name} {prof.name !== weapon.name ? `(${prof.name})` : ''}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>{prof.type === 'melee' ? 'Melee' : prof.range}</td>
                                  <td style={{ textAlign: 'center' }}>{prof.attacks}</td>
                                  <td style={{ textAlign: 'center' }}>{skill || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{prof.strength}</td>
                                  <td style={{ textAlign: 'center' }}>{prof.armourPenetration}</td>
                                  <td style={{ textAlign: 'center' }}>{prof.damage}</td>
                                  <td style={{ fontSize: '8pt' }}>
                                    <div>{prof.type === 'melee' ? 'Melee' : 'Ranged'}</div>
                                    {prof.rules && prof.rules.length > 0 && (
                                      <div style={{ fontSize: '7.5pt', color: '#4b5563', fontStyle: 'italic', marginTop: '2px' }}>
                                        {prof.rules.join(', ')}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                          });
                        });

                        return weaponRows.length > 0 ? weaponRows : null;
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            ) : (
              // 2. ISO/IEC 7810 ID-1 Datacards Print Grid
              <div className="print-cards-grid">
                {roster.map(unit => {
                  const matched = factionData.units.find(mu => mu.slug === unit.unitSlug);
                  const ds = matched?.appDatasheet;
                  const firstModel = ds?.models?.[0];
                  const stats = firstModel?.stats;

                  // Extract and format weapon profiles compactly
                  const formattedWeapons: string[] = [];
                  if (ds) {
                    const modelCounts = getRosterUnitModelCounts(unit, ds);
                    ds.models.forEach(m => {
                      const totalModelCount = modelCounts[m.name] || 0;
                      if (totalModelCount === 0) return;
                      const activeWeapons = getUnitActiveWeapons(unit, m, totalModelCount);
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
                      const bodyguard = roster.find(r => r.id === unit.attachedToId);
                      if (bodyguard) {
                        attachmentInfo = `Leads: ${bodyguard.name}`;
                      }
                    }
                  } else {
                    const leaders = roster.filter(r => r.isCharacter && r.attachedToId === unit.id);
                    if (leaders.length > 0) {
                      attachmentInfo = `Led by: ${leaders.map(l => l.name).join(', ')}`;
                    }
                  }

                  return (
                    <div key={unit.id} className="id1-datacard">

                      {/* Card Header */}
                      <div className="id1-datacard-header">
                        <div className="id1-datacard-title">
                          {unit.isWarlord && <Crown size={8} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'middle' }} />}
                          {unit.name}
                        </div>
                        <div className="id1-datacard-points">
                          {unit.points + (unit.enhancementPoints || 0)} pts | {unit.modelsCount} mdl
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
    const matchedCatalog = factionData.units.find(u => u.slug === unit.unitSlug);
    const isWarlord = unit.isWarlord;

    // Available size options
    const costOptions = getDatasheetCosts(matchedCatalog?.appDatasheet);

    // Enhancements are offered from every selected detachment (grouped when several)

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
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
              Base Cost: {unit.points} pts | {unit.modelsCount} models
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
              {unit.points + (unit.enhancementPoints || 0)} pts
            </span>
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

          {/* 2. Attachment triggers (Characters only) */}
          {unit.isCharacter && (
            <>
              {/* Leader Attachment Bodyguard Selection */}
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
                  {validBodyguards.map(b => {
                    const isComp = checkCompatibility(unit, b);
                    return (
                      <option key={b.id} value={b.id}>
                        {isComp ? '★ ' : ''}{b.name} ({b.points} pts)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 3. Enhancements selection (Characters only, requires at least one detachment) */}
              {selectedDetachments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Detachment Enhancement</span>
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
                    <option value="none">-- Select Enhancement --</option>
                    {selectedDetachments.length === 1 ? (
                      selectedDetachments[0].enhancements.map(e => (
                        <option key={e.name} value={e.name}>
                          {e.name} (+{e.pointsCost} pts)
                        </option>
                      ))
                    ) : (
                      selectedDetachments.map(d => (
                        <optgroup key={d.slug} label={d.name}>
                          {d.enhancements.map(e => (
                            <option key={e.name} value={e.name}>
                              {e.name} (+{e.pointsCost} pts)
                            </option>
                          ))}
                        </optgroup>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>
                  Select a Detachment to enable Enhancements
                </span>
              )}

              {/* 4. Warlord switch (Characters only) */}
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
            </>
          )}

        </div>

        {/* Wargear Choices Section */}
        {(() => {
          if (!matchedCatalog?.appDatasheet) return null;
          const modelCounts = getRosterUnitModelCounts(unit, matchedCatalog.appDatasheet);
          const hasDisplayableWargear = matchedCatalog.appDatasheet.models.some(model => {
            const totalModelCount = modelCounts[model.name] || 0;
            if (totalModelCount === 0) return false;
            return (model.wargearChoiceSets || []).some(set => {
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
                      {modelSets.map((set, setIdx) => {
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
                          const maxAllowed = totalModelCount > 1 ? totalModelCount : set.limit;
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
                      })}
                    </div>
                  );
                })}
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
};

const RefreshSpinner = () => (
  <div style={{ display: 'inline-flex', animation: 'spin 1.5s linear infinite' }}>
    <svg style={{ width: '36px', height: '36px', stroke: 'var(--accent-teal)', fill: 'none' }} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="30 10" />
    </svg>
  </div>
);
