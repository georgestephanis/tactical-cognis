import React, { useState, useEffect } from 'react';
import { Target, BarChart2, Shield, Sparkles, AlertCircle, RefreshCw, Flame, UserCheck, Truck, Plus, Trash2 } from 'lucide-react';
import { calculateExpectedDamage, TARGET_PRESETS } from '../utils/mathhammer';
import type { MathhammerInput, TargetProfile } from '../utils/mathhammer';
import { loadAndMergeFaction, getDatasheetCosts } from '../utils/dataMapper';
import type { MergedFaction } from '../utils/dataMapper';
import type { MergedUnit } from '../types/data';

interface FactionSummary {
  faction: string;
  slug: string;
}

import { getFactionList, initDatabase } from '../utils/db';

export const DeepAnalysis: React.FC = () => {
  // Global Faction List
  const [factionsList, setFactionsList] = useState<FactionSummary[]>([]);
  const [selectedFaction, setSelectedFaction] = useState<string>('orks');
  const [factionData, setFactionData] = useState<MergedFaction | null>(null);
  const [loadingFaction, setLoadingFaction] = useState(false);

  // Sub Tabs
  const [subTab, setSubTab] = useState<'mathhammer' | 'efficiency' | 'synergy'>('mathhammer');

  // Mathhammer Playground State
  const [weaponName, setWeaponName] = useState('Custom Bolter');
  const [attacksExpr, setAttacksExpr] = useState('4');
  const [bsWs, setBsWs] = useState(3);
  const [strength, setStrength] = useState(4);
  const [ap, setAp] = useState(-1);
  const [damageExpr, setDamageExpr] = useState('1');
  const [torrent, setTorrent] = useState(false);
  const [twinLinked, setTwinLinked] = useState(false);
  const [lethalHits, setLethalHits] = useState(false);
  const [sustainedHits, setSustainedHits] = useState(0);
  const [devastatingWounds, setDevastatingWounds] = useState(false);
  const [blast, setBlast] = useState(false);

  const [hitReRoll, setHitReRoll] = useState<'none' | 'ones' | 'all'>('none');
  const [woundReRoll, setWoundReRoll] = useState<'none' | 'ones' | 'all'>('none');
  const [plusToHit, setPlusToHit] = useState(0);
  const [plusToWound, setPlusToWound] = useState(0);

  // Target customization
  const [selectedTargetPreset, setSelectedTargetPreset] = useState<string>('MEQ');
  const [targetT, setTargetT] = useState(4);
  const [targetSv, setTargetSv] = useState(3);
  const [targetInv, setTargetInv] = useState<number | null>(null);
  const [targetW, setTargetW] = useState(2);
  const [targetFnp, setTargetFnp] = useState<number | null>(null);
  const [targetUnitSize, setTargetUnitSize] = useState(5);
  const [targetKeywords, setTargetKeywords] = useState<string>('INFANTRY');

  // Point Efficiency State
  const [effTargetPresetIdx, setEffTargetPresetIdx] = useState(1); // Default to MEQ
  const [effMetric, setEffMetric] = useState<'wounds' | 'oc' | 'damage'>('damage');

  // Synergy Analyzer State
  const [selectedTransportUnit, setSelectedTransportUnit] = useState<MergedUnit | null>(null);
  const [embarkedUnits, setEmbarkedUnits] = useState<Array<{ unit: MergedUnit; models: number; points: number }>>([]);


  // Load faction list on mount
  useEffect(() => {
    async function fetchFactions() {
      try {
        await initDatabase('/40k.sqlite');
        const list = await getFactionList();
        setFactionsList(list);
      } catch (err) {
        console.error("Failed to load factions list:", err);
      }
    }
    fetchFactions();
  }, []);

  // Load selected faction data
  useEffect(() => {
    async function loadFaction() {
      if (!selectedFaction) return;
      setLoadingFaction(true);
      try {
        const data = await loadAndMergeFaction(selectedFaction);
        setFactionData(data);

        // Reset synergy analyzer states
        setSelectedTransportUnit(null);
        setEmbarkedUnits([]);
      } catch (err) {
        console.error("Failed to load faction data:", err);
      } finally {
        setLoadingFaction(false);
      }
    }
    loadFaction();
  }, [selectedFaction]);

  // Apply a target preset's profile to the target state.
  // (Initial state already matches the default 'MEQ' preset.)
  const applyTargetPreset = (name: string) => {
    setSelectedTargetPreset(name);
    if (name === 'custom') return;
    const preset = TARGET_PRESETS.find(p => p.name.includes(name));
    if (preset) {
      setTargetT(preset.t);
      setTargetSv(preset.sv);
      setTargetInv(preset.inv);
      setTargetW(preset.w);
      setTargetFnp(preset.fnp);
      setTargetUnitSize(preset.unitSize);
      setTargetKeywords(preset.keywords.join(', '));
    }
  };

  // Construct target profile from state
  const currentTarget: TargetProfile = {
    name: selectedTargetPreset === 'custom' ? 'Custom Target' : selectedTargetPreset,
    t: targetT,
    sv: targetSv,
    inv: targetInv,
    w: targetW,
    fnp: targetFnp,
    keywords: targetKeywords.split(',').map(s => s.trim().toUpperCase()),
    unitSize: targetUnitSize
  };

  // Compile Mathhammer input
  const mathInput: MathhammerInput = {
    attacks: attacksExpr,
    bsWs,
    strength,
    ap,
    damage: damageExpr,
    torrent,
    twinLinked,
    lethalHits,
    sustainedHits,
    devastatingWounds,
    blast,
    hitReRoll,
    woundReRoll,
    plusToHit,
    plusToWound,
    antiKeyword: '',
    antiValue: 0
  };

  // Run Mathhammer calculations for Playground
  const playgroundResult = calculateExpectedDamage(mathInput, currentTarget);

  // Points efficiency ranking calculation
  const getEfficiencyRanking = () => {
    if (!factionData || !factionData.units) return [];

    const targetPreset = TARGET_PRESETS[effTargetPresetIdx];

    return factionData.units.map((unit: MergedUnit) => {
      const ds = unit.appDatasheet;
      if (!ds) return null;

      // Find average points cost (pricing now lives on the datasheet compositions)
      const validCosts = getDatasheetCosts(ds);
      if (validCosts.length === 0) return null;
      const avgCost = validCosts.reduce((sum, c) => sum + c.points, 0) / validCosts.length;
      const avgModels = validCosts.reduce((sum, c) => sum + c.models, 0) / validCosts.length;

      const firstModel = ds.models[0];
      if (!firstModel) return null;

      // Wounds/OC stats
      const modelW = parseInt(firstModel.stats.W, 10) || 1;
      const modelOc = parseInt(firstModel.stats.OC, 10) || 1;

      // Calculate Expected Damage for all weapons combined
      let totalExpectedDamage = 0;
      const weaponLogs: string[] = [];

      firstModel.weapons?.forEach(wp => {
        if (wp.wargearType !== 'weapon') return;

        wp.profiles.forEach(prof => {
          let bsValue = 4;
          const bsStr = prof.type === 'ranged' ? prof.ballisticSkill : prof.weaponSkill;
          if (bsStr && bsStr.includes('+')) {
            bsValue = parseInt(bsStr.replace('+', ''), 10);
          }

          const txt = `${prof.name} ${wp.name}`.toLowerCase();
          const pInput: MathhammerInput = {
            attacks: prof.attacks,
            bsWs: bsValue,
            strength: parseInt(prof.strength, 10) || 4,
            ap: parseInt(prof.armourPenetration, 10) || 0,
            damage: prof.damage,
            torrent: txt.includes('torrent'),
            twinLinked: txt.includes('twin-linked') || txt.includes('twin linked'),
            lethalHits: txt.includes('lethal hits'),
            sustainedHits: txt.includes('sustained hits') ? (txt.includes('sustained hits d3') ? 2 : 1) : 0,
            devastatingWounds: txt.includes('devastating wounds'),
            blast: txt.includes('blast'),
            hitReRoll: 'none',
            woundReRoll: 'none',
            plusToHit: 0,
            plusToWound: 0,
            antiKeyword: '',
            antiValue: 0
          };

          const damageRes = calculateExpectedDamage(pInput, targetPreset);
          // Scale by the number of weapons or weapon count (typically 1)
          totalExpectedDamage += damageRes.effectiveDamage;
          weaponLogs.push(`${prof.name}: ${damageRes.effectiveDamage.toFixed(1)} dmg`);
        });
      });

      // Calculate values per 100 points
      const woundsPer100 = (modelW * avgModels / avgCost) * 100;
      const ocPer100 = (modelOc * avgModels / avgCost) * 100;
      const damagePer100 = (totalExpectedDamage * avgModels / avgCost) * 100; // Expected output of full squad per 100 pts

      return {
        name: unit.name,
        points: avgCost,
        models: avgModels,
        wounds: modelW * avgModels,
        oc: modelOc * avgModels,
        totalExpectedDamage: totalExpectedDamage * avgModels,
        woundsPer100,
        ocPer100,
        damagePer100,
        weaponLogs
      };
    })
    .filter(e => e !== null)
    .sort((a, b) => {
      if (effMetric === 'wounds') return b.woundsPer100 - a.woundsPer100;
      if (effMetric === 'oc') return b.ocPer100 - a.ocPer100;
      return b.damagePer100 - a.damagePer100;
    });
  };

  const effRankings = getEfficiencyRanking();

  // Find all Transports in the current faction
  const transports = factionData?.units.filter((unit: MergedUnit) => {
    if (unit.isCombatPatrol) return false;
    const keywords = unit.appDatasheet?.models?.[0]?.keywords || [];
    return keywords.some(k => k.toLowerCase() === 'transport');
  }) || [];

  // Find all units that can embark (basically all Infantry that are not monsters/vehicles)
  const infantryUnits = factionData?.units.filter((unit: MergedUnit) => {
    if (unit.isCombatPatrol) return false;
    const keywords = unit.appDatasheet?.models?.[0]?.keywords || [];
    return keywords.some(k => k.toLowerCase() === 'infantry');
  }) || [];

  const handleAddEmbarkedUnit = (unitSlug: string) => {
    const unit = infantryUnits.find((u: MergedUnit) => u.slug === unitSlug);
    if (!unit) return;

    // Get default models count and points
    const defaultCost = getDatasheetCosts(unit.appDatasheet)[0] || { models: 1, points: 0 };
    setEmbarkedUnits([
      ...embarkedUnits,
      {
        unit,
        models: defaultCost.models || 1,
        points: defaultCost.points || 0
      }
    ]);
  };

  const handleRemoveEmbarkedUnit = (idx: number) => {
    setEmbarkedUnits(embarkedUnits.filter((_, i) => i !== idx));
  };

  // Calculate transport capacity occupancy
  const transportCapacity = selectedTransportUnit?.appDatasheet?.abilities
    .find(a => a.name.toLowerCase().includes('capacity') || a.rules.toLowerCase().includes('capacity'))
    ?.rules.match(/\d+/)?.[0] || '12'; // fallback average
  const maxCapacity = parseInt(transportCapacity, 10);

  const currentOccupancy = embarkedUnits.reduce((sum, item) => {
    // Mega Armor/Jump Pack models often count as 2 spaces
    let multiplier = 1;
    const kw = item.unit.appDatasheet?.models?.[0]?.keywords || [];
    if (kw.some(k => k.toLowerCase().includes('mega armour') || k.toLowerCase().includes('terminator'))) {
      multiplier = 2;
    }
    return sum + (item.models * multiplier);
  }, 0);

  const totalSynergyCost = (selectedTransportUnit?.pointsRange.min || 0) + embarkedUnits.reduce((sum, item) => sum + item.points, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Selector and Main Navigation */}
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', padding: '1.5rem 2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Deep Tactical Yield Playground</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Select a database faction to load localized unit profiles for matrix reviews and synergy planning.
          </p>
        </div>
        <div className="input-group" style={{ width: '250px', marginBottom: 0 }}>
          <label>Target Faction Data</label>
          <select
            className="input-control"
            value={selectedFaction}
            onChange={(e) => setSelectedFaction(e.target.value)}
          >
            {factionsList.map(f => (
              <option key={f.slug} value={f.slug}>{f.faction}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Analytical Mode Navigation */}
      <div className="nav-tabs" style={{ alignSelf: 'flex-start' }}>
        <button
          className={`tab-btn ${subTab === 'mathhammer' ? 'active' : ''}`}
          onClick={() => setSubTab('mathhammer')}
        >
          <Target size={16} /> Mathhammer Playground
        </button>
        <button
          className={`tab-btn ${subTab === 'efficiency' ? 'active' : ''}`}
          onClick={() => setSubTab('efficiency')}
        >
          <BarChart2 size={16} /> Points Efficiency Matrix
        </button>
        <button
          className={`tab-btn ${subTab === 'synergy' ? 'active' : ''}`}
          onClick={() => setSubTab('synergy')}
        >
          <UserCheck size={16} /> Synergy & Transport Planner
        </button>
      </div>

      {loadingFaction ? (
        <div className="empty-state">
          <RefreshCw className="animate-spin" size={48} style={{ color: 'var(--accent-teal)', marginBottom: '1rem' }} />
          <h2>Syncing tactical datacards...</h2>
        </div>
      ) : (
        <>
          {/* Mathhammer Playground */}
          {subTab === 'mathhammer' && (
            <div className="mathhammer-grid">

              {/* Weapon Config Panel */}
              <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)', marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                  <Flame size={18} />
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Attacking Weapon Config</h3>
                </div>

                <div className="input-group">
                  <label>Weapon Name</label>
                  <input type="text" className="input-control" value={weaponName} onChange={(e) => setWeaponName(e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Attacks (A) <span style={{ color: 'var(--text-muted)' }}>(e.g. 4, D6, 2D6+3)</span></label>
                    <input type="text" className="input-control" value={attacksExpr} onChange={(e) => setAttacksExpr(e.target.value)} />
                  </div>
                  <div className="input-group">
                    <label>Skill (BS/WS)</label>
                    <select className="input-control" value={bsWs} onChange={(e) => setBsWs(parseInt(e.target.value, 10))}>
                      <option value={2}>2+ (Elite)</option>
                      <option value={3}>3+ (Space Marine)</option>
                      <option value={4}>4+ (Ork / Guardsman)</option>
                      <option value={5}>5+ (Cultist)</option>
                      <option value={6}>6+ (Gretchin)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Strength (S)</label>
                    <input type="number" className="input-control" value={strength} onChange={(e) => setStrength(parseInt(e.target.value, 10) || 1)} />
                  </div>
                  <div className="input-group">
                    <label>AP</label>
                    <input type="number" className="input-control" value={ap} onChange={(e) => setAp(parseInt(e.target.value, 10) || 0)} />
                  </div>
                  <div className="input-group">
                    <label>Damage (D) <span style={{ color: 'var(--text-muted)' }}>(e.g. 1, D3, 3)</span></label>
                    <input type="text" className="input-control" value={damageExpr} onChange={(e) => setDamageExpr(e.target.value)} />
                  </div>
                </div>

                {/* Rules Checkboxes */}
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', margin: '1rem 0 0.5rem 0', textTransform: 'uppercase' }}>
                  Weapon Rules & Abilities
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={torrent} onChange={(e) => setTorrent(e.target.checked)} />
                    <span>Torrent (Auto-hits)</span>
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={twinLinked} onChange={(e) => setTwinLinked(e.target.checked)} />
                    <span>Twin-Linked (Re-roll wounds)</span>
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={lethalHits} onChange={(e) => setLethalHits(e.target.checked)} />
                    <span>Lethal Hits (Crit hit auto-wounds)</span>
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={devastatingWounds} onChange={(e) => setDevastatingWounds(e.target.checked)} />
                    <span>Devastating Wounds (Crit wounds bypass saves)</span>
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={blast} onChange={(e) => setBlast(e.target.checked)} />
                    <span>Blast (+1 A per 5 models in target)</span>
                  </label>
                  <div className="input-group" style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Sustained Hits</label>
                    <input type="number" className="input-control" style={{ width: '60px', padding: '0.2rem' }} value={sustainedHits} onChange={(e) => setSustainedHits(parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>

                {/* Custom Modifiers */}
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', margin: '1rem 0 0.5rem 0', textTransform: 'uppercase' }}>
                  Aura / Stratagem Modifiers
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="input-group">
                    <label>Hit Re-rolls</label>
                    <select className="input-control" value={hitReRoll} onChange={(e) => setHitReRoll(e.target.value as 'none' | 'ones' | 'all')}>
                      <option value="none">No Re-rolls</option>
                      <option value="ones">Re-roll 1s</option>
                      <option value="all">Re-roll All Fails</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label>Wound Re-rolls</label>
                    <select className="input-control" value={woundReRoll} onChange={(e) => setWoundReRoll(e.target.value as 'none' | 'ones' | 'all')}>
                      <option value="none">No Re-rolls</option>
                      <option value="ones">Re-roll 1s</option>
                      <option value="all">Re-roll All Fails</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>Hit Modifiers</label>
                    <select className="input-control" value={plusToHit} onChange={(e) => setPlusToHit(parseInt(e.target.value, 10))}>
                      <option value={0}>Flat (+0)</option>
                      <option value={1}>+1 to Hit (Buff)</option>
                      <option value={-1}>-1 to Hit (Debuff)</option>
                    </select>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>Wound Modifiers</label>
                    <select className="input-control" value={plusToWound} onChange={(e) => setPlusToWound(parseInt(e.target.value, 10))}>
                      <option value={0}>Flat (+0)</option>
                      <option value={1}>+1 to Wound (Buff)</option>
                      <option value={-1}>-1 to Wound (Debuff)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Target Config & Math Results Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Target Configuration Panel */}
                <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)' }}>
                      <Shield size={18} />
                      <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Defender Target Profile</h3>
                    </div>
                    <select
                      className="input-control"
                      style={{ width: '180px', padding: '0.3rem' }}
                      value={selectedTargetPreset}
                      onChange={(e) => applyTargetPreset(e.target.value)}
                    >
                      <option value="GEQ">Preset: GEQ (Guard)</option>
                      <option value="MEQ">Preset: MEQ (Marine)</option>
                      <option value="TEQ">Preset: TEQ (Terminator)</option>
                      <option value="VEQ">Preset: VEQ (Vehicle)</option>
                      <option value="HEAVY">Preset: Heavy Vehicle</option>
                      <option value="custom">-- Custom Defender --</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                    <div className="input-group">
                      <label>Toughness (T)</label>
                      <input type="number" className="input-control" value={targetT} disabled={selectedTargetPreset !== 'custom'} onChange={(e) => setTargetT(parseInt(e.target.value, 10) || 1)} />
                    </div>
                    <div className="input-group">
                      <label>Save (Sv)</label>
                      <input type="number" className="input-control" value={targetSv} disabled={selectedTargetPreset !== 'custom'} onChange={(e) => setTargetSv(parseInt(e.target.value, 10) || 1)} />
                    </div>
                    <div className="input-group">
                      <label>Invuln Save</label>
                      <select
                        className="input-control"
                        value={targetInv === null ? '' : targetInv}
                        disabled={selectedTargetPreset !== 'custom'}
                        onChange={(e) => setTargetInv(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                      >
                        <option value="">None</option>
                        <option value={3}>3++</option>
                        <option value={4}>4++</option>
                        <option value={5}>5++</option>
                        <option value={6}>6++</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Wounds (W)</label>
                      <input type="number" className="input-control" value={targetW} disabled={selectedTargetPreset !== 'custom'} onChange={(e) => setTargetW(parseInt(e.target.value, 10) || 1)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <div className="input-group">
                      <label>Feel No Pain</label>
                      <select
                        className="input-control"
                        value={targetFnp === null ? '' : targetFnp}
                        disabled={selectedTargetPreset !== 'custom'}
                        onChange={(e) => setTargetFnp(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                      >
                        <option value="">None</option>
                        <option value={4}>4+++</option>
                        <option value={5}>5+++</option>
                        <option value={6}>6+++</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label>Unit Size</label>
                      <input type="number" className="input-control" value={targetUnitSize} disabled={selectedTargetPreset !== 'custom'} onChange={(e) => setTargetUnitSize(parseInt(e.target.value, 10) || 1)} />
                    </div>
                    <div className="input-group">
                      <label>Keywords (comma list)</label>
                      <input type="text" className="input-control" value={targetKeywords} disabled={selectedTargetPreset !== 'custom'} onChange={(e) => setTargetKeywords(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Math Simulation Output Grid */}
                <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '1.5rem', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', marginBottom: '1.5rem' }}>
                    <Sparkles size={18} />
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Expected Combat Yield</h3>
                  </div>

                  {/* Calculations breakdown list */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expected Attacks</span>
                      <strong style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>{playgroundResult.expectedAttacks.toFixed(2)}</strong>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expected Hits</span>
                      <strong style={{ fontSize: '1.8rem', color: 'var(--accent-teal)' }}>{playgroundResult.expectedHits.toFixed(2)}</strong>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expected Wounds</span>
                      <strong style={{ fontSize: '1.8rem', color: 'var(--text-primary)' }}>{playgroundResult.expectedWounds.toFixed(2)}</strong>
                    </div>
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '1rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.25rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>Expected Model Casualties</span>
                      <strong style={{ fontSize: '1.8rem', color: 'var(--accent-red)' }}>{playgroundResult.casualties.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Progressive Bar Chart */}
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    Combat Funnel Efficiency
                  </span>
                  <div className="custom-bar-chart" style={{ gap: '0.75rem' }}>
                    {[
                      { name: 'Attacks', val: playgroundResult.expectedAttacks, color: 'var(--accent-indigo)', maxVal: Math.max(1, playgroundResult.expectedAttacks) },
                      { name: 'Hits', val: playgroundResult.expectedHits, color: 'var(--accent-teal)', maxVal: Math.max(1, playgroundResult.expectedAttacks) },
                      { name: 'Wounds', val: playgroundResult.expectedWounds, color: 'var(--accent-gold)', maxVal: Math.max(1, playgroundResult.expectedAttacks) },
                      { name: 'Casualties', val: playgroundResult.casualties, color: 'var(--accent-red)', maxVal: Math.max(1, playgroundResult.expectedAttacks) }
                    ].map(bar => (
                      <div key={bar.name} className="chart-bar-container">
                        <div style={{ width: '80px', fontSize: '0.85rem' }}>{bar.name}</div>
                        <div className="chart-bar-track" style={{ height: '14px' }}>
                          <div
                            className="chart-bar-fill"
                            style={{
                              width: `${(bar.val / bar.maxVal) * 100}%`,
                              background: bar.color
                            }}
                          />
                        </div>
                        <div style={{ width: '50px', textAlign: 'right', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                          {bar.val.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Points Efficiency Matrix */}
          {subTab === 'efficiency' && (
            <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)' }}>
                  <BarChart2 size={24} />
                  <h3 style={{ margin: 0 }}>Points Yield Analysis Ranking</h3>
                </div>

                {/* Options selectors */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="input-group" style={{ marginBottom: 0, width: '150px' }}>
                    <label>Sort Metric</label>
                    <select
                      className="input-control"
                      value={effMetric}
                      onChange={(e) => setEffMetric(e.target.value as 'wounds' | 'oc' | 'damage')}
                    >
                      <option value="wounds">Wounds / 100 Pts</option>
                      <option value="oc">OC / 100 Pts</option>
                      <option value="damage">Weapon Dmg / 100 Pts</option>
                    </select>
                  </div>
                  {effMetric === 'damage' && (
                    <div className="input-group" style={{ marginBottom: 0, width: '200px' }}>
                      <label>Target Defender</label>
                      <select
                        className="input-control"
                        value={effTargetPresetIdx}
                        onChange={(e) => setEffTargetPresetIdx(parseInt(e.target.value, 10))}
                      >
                        {TARGET_PRESETS.map((p, idx) => (
                          <option key={idx} value={idx}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                Ranks the active units of <strong className="text-gold" style={{ textTransform: 'uppercase' }}>{factionData?.factionName}</strong> by points efficiency.
                {effMetric === 'damage' && ` Expected squad damage output is calculated against the ${TARGET_PRESETS[effTargetPresetIdx].name} profile (T${TARGET_PRESETS[effTargetPresetIdx].t} Sv${TARGET_PRESETS[effTargetPresetIdx].sv}+ W${TARGET_PRESETS[effTargetPresetIdx].w}).`}
              </p>

              {effRankings.length === 0 ? (
                <div className="empty-state">
                  <AlertCircle size={32} style={{ color: 'var(--text-muted)' }} />
                  <p>Insufficient datasheet/pricing records available for rankings.</p>
                </div>
              ) : (
                <div className="custom-bar-chart">
                  {effRankings.slice(0, 15).map((item) => {
                    let fillPercent: number;
                    let valueDisplay: string;
                    let fillGradient: string;

                    if (effMetric === 'wounds') {
                      fillPercent = Math.min(100, (item.woundsPer100 / 25) * 100);
                      valueDisplay = `${item.woundsPer100.toFixed(1)} Wounds`;
                      fillGradient = "linear-gradient(90deg, var(--accent-indigo) 0%, var(--accent-green) 100%)";
                    } else if (effMetric === 'oc') {
                      fillPercent = Math.min(100, (item.ocPer100 / 25) * 100);
                      valueDisplay = `${item.ocPer100.toFixed(1)} OC`;
                      fillGradient = "linear-gradient(90deg, var(--accent-indigo) 0%, var(--accent-gold) 100%)";
                    } else {
                      // Damage
                      fillPercent = Math.min(100, (item.damagePer100 / 12) * 100);
                      valueDisplay = `${item.damagePer100.toFixed(1)} Dmg`;
                      fillGradient = "linear-gradient(90deg, var(--accent-indigo) 0%, var(--accent-red) 100%)";
                    }

                    return (
                      <div key={item.name} className="chart-bar-container">
                        <div className="chart-bar-label" style={{ width: '200px' }}>
                          <strong>{item.name}</strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {item.models} models ({item.points} pts)
                          </span>
                        </div>
                        <div className="chart-bar-track">
                          <div
                            className="chart-bar-fill"
                            style={{
                              width: `${fillPercent}%`,
                              background: fillGradient
                            }}
                          />
                        </div>
                        <div className="chart-bar-val" style={{ width: '120px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {valueDisplay}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Synergy & Transport Planner */}
          {subTab === 'synergy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              <div className="mathhammer-grid">

                {/* Transport Selector and Stats */}
                <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)', marginBottom: '1.25rem' }}>
                    <Truck size={20} />
                    <h3 style={{ margin: 0 }}>Transport Capacity Allocation</h3>
                  </div>

                  <div className="input-group">
                    <label>Select Transport Vehicle</label>
                    {transports.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transport units found in this faction.</p>
                    ) : (
                      <select
                        className="input-control"
                        value={selectedTransportUnit?.slug || ''}
                        onChange={(e) => setSelectedTransportUnit(transports.find((t: MergedUnit) => t.slug === e.target.value) || null)}
                      >
                        <option value="">-- Choose Transport --</option>
                        {transports.map((t: MergedUnit) => (
                          <option key={t.slug} value={t.slug}>{t.name} ({t.pointsRange.min} pts)</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedTransportUnit && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                      {/* Transport info stats */}
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Model Save:</span>
                          <span style={{ fontWeight: 600 }}>{selectedTransportUnit.appDatasheet?.models?.[0]?.stats.Sv}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Toughness:</span>
                          <span style={{ fontWeight: 600 }}>{selectedTransportUnit.appDatasheet?.models?.[0]?.stats.T}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Max Capacity Limit:</span>
                          <strong className="text-gold">{maxCapacity} slots</strong>
                        </div>
                      </div>

                      {/* Capacity gauge */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span>Capacity Usage</span>
                          <span style={{ color: currentOccupancy > maxCapacity ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 700 }}>
                            {currentOccupancy} / {maxCapacity} slots
                          </span>
                        </div>
                        <div className="chart-bar-track" style={{ height: '16px', background: 'var(--bg-primary)' }}>
                          <div
                            className="chart-bar-fill"
                            style={{
                              width: `${Math.min(100, (currentOccupancy / maxCapacity) * 100)}%`,
                              background: currentOccupancy > maxCapacity ? 'var(--accent-red)' : 'linear-gradient(90deg, var(--accent-green) 0%, var(--accent-teal) 100%)'
                            }}
                          />
                        </div>
                      </div>

                      {/* Synergy list costs */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', fontSize: '0.9rem' }}>
                        <span>Synergy Combined Cost:</span>
                        <strong className="text-teal" style={{ fontSize: '1.1rem' }}>{totalSynergyCost} pts</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Embarked Units Management */}
                <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '1.5rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-teal)' }}>
                    <Plus size={18} />
                    Embarked Detachment Allocation
                  </h3>

                  {selectedTransportUnit ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Dropdown to add squad */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          className="input-control"
                          style={{ flex: 1 }}
                          id="add-squad-select"
                          defaultValue=""
                        >
                          <option value="" disabled>-- Select Infantry squad to load --</option>
                          {infantryUnits.map((u: MergedUnit) => (
                            <option key={u.slug} value={u.slug}>{u.name} ({u.pointsRange.min} pts)</option>
                          ))}
                        </select>
                        <button
                          className="button"
                          onClick={() => {
                            const select = document.getElementById('add-squad-select') as HTMLSelectElement;
                            if (select.value) {
                              handleAddEmbarkedUnit(select.value);
                            }
                          }}
                        >
                          Embark
                        </button>
                      </div>

                      {/* List of currently embarked units */}
                      {embarkedUnits.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                          Transport is currently empty. Embark units from the options above.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {embarkedUnits.map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'var(--bg-tertiary)',
                                padding: '0.6rem 0.8rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.02)'
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.unit.name}</span>
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {item.models} models • {item.points} pts
                                </span>
                              </div>
                              <button
                                style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                onClick={() => handleRemoveEmbarkedUnit(idx)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
                      Select a transport vehicle to activate the synergy builder.
                    </div>
                  )}
                </div>

              </div>

              {/* Leaders and Bodyguard synergy dictionary */}
              <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '1.5rem 2rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-gold)' }}>
                  <UserCheck size={18} />
                  Faction Leaders & Attachment Directory
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  A lookup tool matching leaders (Characters) with compatible bodyguard squads based on companion-app datasheet constraints.
                </p>

                {factionData?.units ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {factionData.units
                      .filter((u: MergedUnit) => u.appDatasheet?.leads && u.appDatasheet.leads.length > 0)
                      .map((u: MergedUnit) => (
                        <div
                          key={u.slug}
                          style={{
                            background: 'var(--bg-tertiary)',
                            padding: '1.25rem',
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 255, 255, 0.03)'
                          }}
                        >
                          <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                            {u.name}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                            Buff: {u.appDatasheet?.abilities.find(a => a.name.toLowerCase() === u.name.toLowerCase())?.rules || 'Standard Character Aura'}
                          </span>
                          <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                              Bodyguard Options:
                            </span>
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {u.appDatasheet?.leads?.map(body => (
                                <span key={body} style={{ background: 'rgba(226, 168, 38, 0.05)', border: '1px solid rgba(226, 168, 38, 0.15)', color: 'var(--accent-gold)', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                                  {body}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)' }}>Load a faction to browse attachment options.</p>
                )}
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
};
