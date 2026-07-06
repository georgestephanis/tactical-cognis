import React, { useState, useEffect } from 'react';
import { ChevronLeft, Shield, Sparkles, AlertCircle, RefreshCw, BarChart2, Compass, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { loadAndMergeFaction, getDatasheetCosts } from '../utils/dataMapper';
import type { MergedFaction } from '../utils/dataMapper';
import type { MergedUnit, WeaponProfile } from '../types/data';
import RulesText from './RulesText';

interface FactionBrowserProps {
  factionSlug: string;
  onBack: () => void;
  onSelectUnit: (unit: MergedUnit) => void;
  appDataVersion?: number;
}

export const FactionBrowser: React.FC<FactionBrowserProps> = ({
  factionSlug,
  onBack,
  onSelectUnit,
  appDataVersion = 875
}) => {
  const [factionData, setFactionData] = useState<MergedFaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'units' | 'detachments' | 'rules' | 'yield'>('units');

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [showCombatPatrol, setShowCombatPatrol] = useState(false);

  // Print Selection States
  const [selectedUnits, setSelectedUnits] = useState<MergedUnit[]>([]);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [printLayout, setPrintLayout] = useState<'skim' | 'cards'>('skim');
  const [expandedDetachment, setExpandedDetachment] = useState<string | null>(null);


  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const merged = await loadAndMergeFaction(factionSlug);
        if (merged) {
          setFactionData(merged);
        } else {
          setError(`Could not merge data for faction slug: ${factionSlug}`);
        }
      } catch (err) {
        console.error(err);
        setError("An unexpected error occurred while loading faction data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [factionSlug]);

  if (loading) {
    return (
      <div className="empty-state">
        <RefreshCw className="animate-spin" size={48} style={{ color: 'var(--accent-teal)', marginBottom: '1rem' }} />
        <h2>Decoding Data Shards for {factionSlug.toUpperCase()}...</h2>
        <p>Reconciling unit sheets, weapon loadouts, and Munitorum manual prices.</p>
      </div>
    );
  }

  if (error || !factionData) {
    return (
      <div className="empty-state">
        <AlertCircle size={48} style={{ color: 'var(--accent-red)', marginBottom: '1rem' }} />
        <h2>Database Synapse Failure</h2>
        <p>{error || "No records found."}</p>
        <button className="button" onClick={onBack} style={{ marginTop: '1.5rem' }}>
          <ChevronLeft size={16} /> Return to Registry
        </button>
      </div>
    );
  }

  // Filter Units
  const filteredUnits = factionData.units.filter(unit => {
    // Filter out combat patrol units unless explicitly enabled
    if (!showCombatPatrol && unit.isCombatPatrol) return false;

    const matchesSearch = unit.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedRole === 'all') return true;

    // Check keywords on the first model
    const firstModel = unit.appDatasheet?.models?.[0];
    const keywords = firstModel?.keywords || [];

    if (selectedRole === 'character') return keywords.some(k => k.toLowerCase() === 'character');
    if (selectedRole === 'battleline') return keywords.some(k => k.toLowerCase() === 'battleline');
    if (selectedRole === 'vehicle') return keywords.some(k => k.toLowerCase() === 'vehicle' || k.toLowerCase() === 'frame');
    if (selectedRole === 'monster') return keywords.some(k => k.toLowerCase() === 'monster');
    if (selectedRole === 'infantry') return keywords.some(k => k.toLowerCase() === 'infantry');
    if (selectedRole === 'transport') return keywords.some(k => k.toLowerCase() === 'transport');
    if (selectedRole === 'legends') return unit.appDatasheet?.isLegends;

    return true;
  });

  // Extract Faction-wide Army Rules
  const armyRulesMap = new Map<string, string>();
  factionData.units.forEach(unit => {
    unit.appDatasheet?.abilities?.forEach(ability => {
      if (ability.type === 'faction' && ability.rules && ability.rules !== '-') {
        armyRulesMap.set(ability.name, ability.rules);
      }
    });
  });
  const armyRules = Array.from(armyRulesMap.entries()).map(([name, rules]) => ({ name, rules }));

  // Yield Analysis Calculations (points efficiency within the faction)
  // Calculate average point-efficiency metrics: Wounds per Point, OC per Point, Toughness per Point
  const efficiencyMetrics = factionData.units
    .map(unit => {
      const datasheet = unit.appDatasheet;
      if (!datasheet) return null;

      // Find average points cost (pricing now lives on the datasheet compositions)
      const validCosts = getDatasheetCosts(datasheet);
      if (validCosts.length === 0) return null;

      const avgCost = validCosts.reduce((sum, c) => sum + c.points, 0) / validCosts.length;

      // Calculate total models in composition
      const avgModels = validCosts.reduce((sum, c) => sum + c.models, 0) / validCosts.length;

      // Get base stats from the first model
      const model = datasheet.models[0];
      if (!model) return null;

      const wounds = parseInt(model.stats.W, 10);
      const oc = parseInt(model.stats.OC, 10);
      const toughness = parseInt(model.stats.T, 10);

      if (isNaN(wounds) || isNaN(oc) || isNaN(toughness) || avgCost === 0) return null;

      // Multiply stats by number of models in unit to get total unit stats
      const unitWounds = wounds * avgModels;
      const unitOc = oc * avgModels;

      return {
        name: unit.name,
        woundsPerPoint: (unitWounds / avgCost) * 100, // Show per 100 pts for readable scale
        ocPerPoint: (unitOc / avgCost) * 100,
        toughnessEfficiency: toughness / avgCost,
        points: avgCost,
        isLegends: datasheet.isLegends
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.woundsPerPoint - a.woundsPerPoint);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Navigation Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button className="button-outline" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <ChevronLeft size={16} /> Registry
        </button>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Companion App Data Version: {appDataVersion}
          </span>
        </div>
      </div>

      {/* Faction Header Card */}
      <div
        className="panel"
        style={{
          background: 'linear-gradient(135deg, rgba(23, 29, 47, 0.8) 0%, rgba(15, 19, 31, 0.8) 100%)',
          textAlign: 'left',
          marginBottom: '0.5rem',
          padding: '1.5rem 2rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.05em' }}>
          <Compass size={16} />
          SECTOR COMBAT REPORT
        </div>
        <h2 style={{ fontSize: '2.2rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          {factionData.factionName}
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Active deployment includes <strong className="text-teal">{factionData.units.length}</strong> unit profiles and <strong className="text-gold">{factionData.detachments.length}</strong> combat detachments.
        </p>
      </div>

      {/* Tabs */}
      <div className="nav-tabs" style={{ alignSelf: 'flex-start' }}>
        <button
          className={`tab-btn ${activeTab === 'units' ? 'active' : ''}`}
          onClick={() => setActiveTab('units')}
        >
          Units Registry
        </button>
        <button
          className={`tab-btn ${activeTab === 'detachments' ? 'active' : ''}`}
          onClick={() => setActiveTab('detachments')}
        >
          Detachments ({factionData.detachments.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Faction Rules ({armyRules.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'yield' ? 'active' : ''}`}
          onClick={() => setActiveTab('yield')}
        >
          Yield Analysis (Stats/Pts)
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'units' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Search */}
              <div className="search-container">
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search unit by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Combat Patrol Toggle */}
              <label className="checkbox-row" style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={showCombatPatrol}
                  onChange={(e) => setShowCombatPatrol(e.target.checked)}
                />
                <span>Include Combat Patrol</span>
              </label>
            </div>

            {/* Role filter buttons */}
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'character', label: 'Characters' },
                { id: 'infantry', label: 'Infantry' },
                { id: 'vehicle', label: 'Vehicles' },
                { id: 'monster', label: 'Monsters' },
                { id: 'battleline', label: 'Battleline' },
                { id: 'transport', label: 'Transports' },
                { id: 'legends', label: 'Legends' }
              ].map(role => (
                <button
                  key={role.id}
                  style={{
                    background: selectedRole === role.id ? 'var(--bg-tertiary)' : 'transparent',
                    border: 'none',
                    color: selectedRole === role.id ? 'var(--accent-teal)' : 'var(--text-secondary)',
                    padding: '0.4rem 0.8rem',
                    fontSize: '0.85rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: selectedRole === role.id ? 600 : 400
                  }}
                  onClick={() => setSelectedRole(role.id)}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Units Grid */}
          {filteredUnits.length === 0 ? (
            <div className="panel empty-state">
              <AlertCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
              <p>No units match the search and filter parameters.</p>
            </div>
          ) : (
            <div className="faction-grid">
              {filteredUnits.map(unit => {
                const datasheet = unit.appDatasheet;
                const isLegends = datasheet?.isLegends;

                // Get keywords from first model
                const firstModel = datasheet?.models?.[0];
                const keywords = firstModel?.keywords || [];
                const stats = firstModel?.stats;

                // Points Label
                let pointsLabel = "Combat Patrol";
                if (unit.pointsRange.min > 0) {
                  pointsLabel = unit.pointsRange.min === unit.pointsRange.max
                    ? `${unit.pointsRange.min} pts`
                    : `${unit.pointsRange.min}-${unit.pointsRange.max} pts`;
                }

                // Leads count (bodyguard targets); support data is not available in the SQLite source
                const leadsCount = datasheet?.leads?.length || 0;
                const supportCount = 0;

                const isSelected = selectedUnits.some(u => u.slug === unit.slug);

                return (
                  <div
                    key={unit.slug}
                    className={`faction-card ${isSelected ? 'is-selected' : ''}`}
                    style={{ height: 'auto', minHeight: '220px', padding: '1.25rem' }}
                    onClick={() => onSelectUnit(unit)}
                  >
                    {/* Checkbox overlay */}
                    <input
                      type="checkbox"
                      className="card-select-checkbox no-print"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUnits(prev => [...prev, unit]);
                        } else {
                          setSelectedUnits(prev => prev.filter(u => u.slug !== unit.slug));
                        }
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                          {unit.name}
                        </h3>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          {datasheet?.pointsSteps && datasheet.pointsSteps.length > 0 && (
                            <span className="badge badge-monster" style={{ fontSize: '0.65rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }} title="This unit has stepped pricing (costs more for duplicate units)">
                              Stepped Pricing
                            </span>
                          )}
                          {unit.isFactionPack && <span className="badge badge-faction-pack">Faction Pack</span>}
                          {isLegends && <span className="badge badge-legends">Legends</span>}
                        </div>
                      </div>


                      {/* Keywords Badges */}
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', margin: '0.25rem 0' }}>
                        {keywords.slice(0, 3).map(kw => {
                          const kwLower = kw.toLowerCase();
                          let badgeClass = "badge badge-legends";
                          if (kwLower === 'character') badgeClass = "badge badge-character";
                          else if (kwLower === 'vehicle') badgeClass = "badge badge-vehicle";
                          else if (kwLower === 'monster') badgeClass = "badge badge-monster";
                          else if (kwLower === 'infantry') badgeClass = "badge badge-infantry";
                          return (
                            <span key={kw} className={badgeClass} style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}>
                              {kw}
                            </span>
                          );
                        })}
                      </div>

                      {/* Statline Quick Preview */}
                      {stats && !firstModel.statlineHidden && (
                        <div style={{
                          display: 'flex',
                          gap: '0.4rem',
                          background: 'rgba(0,0,0,0.15)',
                          padding: '0.4rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.02)',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          <div>M: <span style={{ color: 'var(--text-primary)' }}>{stats.M}</span></div>
                          <div>T: <span style={{ color: 'var(--text-primary)' }}>{stats.T}</span></div>
                          <div>Sv: <span style={{ color: 'var(--text-primary)' }}>{stats.Sv}</span></div>
                          <div>W: <span style={{ color: 'var(--text-primary)' }}>{stats.W}</span></div>
                          <div>OC: <span style={{ color: 'var(--text-primary)' }}>{stats.OC}</span></div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', width: '100%', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.75rem' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                        {pointsLabel}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {leadsCount > 0 && `Leads (${leadsCount})`}
                        {supportCount > 0 && `Support (${supportCount})`}
                        {leadsCount === 0 && supportCount === 0 && 'Independent'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'detachments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {factionData.detachments.length === 0 ? (
            <div className="panel empty-state">
              <Shield size={32} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
              <p>No detachments found for this faction.</p>
            </div>
          ) : (
            factionData.detachments.map((det) => {
              const isExpanded = expandedDetachment === det.slug;
              return (
                <div
                  key={det.slug}
                  className="panel"
                  style={{
                    textAlign: 'left',
                    background: 'var(--bg-secondary)',
                    border: isExpanded ? '1px solid var(--accent-gold)' : '1px solid var(--glass-border)',
                    padding: '0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {/* Detachment Header Trigger */}
                  <div
                    onClick={() => setExpandedDetachment(isExpanded ? null : det.slug)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1.5rem 2rem',
                      cursor: 'pointer',
                      background: isExpanded ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, textTransform: 'uppercase', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={18} style={{ color: 'var(--accent-gold)' }} />
                        {det.name}
                      </h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {det.isFactionPack && <span className="badge badge-faction-pack">Faction Pack</span>}
                        {det.isCombatPatrol && <span className="badge badge-legends">Combat Patrol</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {det.detachmentPointsCost && (
                        <span style={{
                          background: 'rgba(226, 168, 38, 0.15)',
                          border: '1px solid var(--accent-gold)',
                          color: 'var(--accent-gold)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600
                        }}>
                          Cost: {det.detachmentPointsCost} DP
                        </span>
                      )}
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>

                  {/* Expanded Detachment Content */}
                  {isExpanded && (
                    <div style={{ padding: '0 2rem 2rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>

                      {/* Detachment restrictions */}
                      {det.restrictions && det.restrictions.length > 0 && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-red)', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                            Restrictions:
                          </span>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            {det.restrictions.map((res, idx) => <li key={idx}>{res}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Detachment Rules */}
                      {det.rules && det.rules.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-gold)', marginBottom: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem' }}>
                            Detachment Rules
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {det.rules.map((rule) => (
                              <div key={rule.id} style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                                <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', textTransform: 'uppercase', fontSize: '0.95rem' }}>{rule.name}</h5>
                                {rule.lore && <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>{rule.lore}</p>}
                                {rule.rules && <p style={{ whiteSpace: 'pre-line', margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.5' }}><RulesText text={rule.rules} /></p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Enhancements with points & leader constraints */}
                      {det.enhancements && det.enhancements.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-gold)', marginBottom: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem' }}>
                            Enhancements
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                            {det.enhancements.map((enh) => (
                              <div
                                key={enh.name}
                                style={{
                                  background: 'var(--bg-tertiary)',
                                  padding: '1.25rem',
                                  borderRadius: '10px',
                                  border: '1px solid rgba(255, 255, 255, 0.03)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.5rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>{enh.name}</span>
                                  <span style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.9rem', background: 'rgba(226, 168, 38, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>
                                    {enh.pointsCost !== null ? `${enh.pointsCost} pts` : '—'}
                                  </span>
                                </div>
                                 <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.1rem', marginBottom: '0.2rem' }}>
                                   {enh.cannotBeWarlord && (
                                     <span style={{ fontSize: '0.7rem', color: 'var(--accent-red)', fontWeight: 700, background: 'rgba(239, 68, 68, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                                       Cannot be Warlord
                                     </span>
                                   )}
                                   {enh.isEquipableByNonCharacterUnit && (
                                     <span style={{ fontSize: '0.7rem', color: 'var(--accent-teal)', fontWeight: 700, background: 'rgba(0, 242, 254, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                                       Non-Character Squad
                                     </span>
                                   )}
                                   {enh.limit !== undefined && enh.limit > 1 && (
                                     <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: 700, background: 'rgba(226, 168, 38, 0.1)', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                                       Limit: {enh.limit}
                                     </span>
                                   )}
                                   {enh.isIncludedInEnhancementLimit === false && (
                                     <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, background: 'rgba(156, 163, 175, 0.15)', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                                       Free from Limit
                                     </span>
                                   )}
                                 </div>
                                 {enh.lore && (
                                  <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>
                                    {enh.lore}
                                  </p>
                                )}
                                {enh.rules && (
                                  <p style={{ whiteSpace: 'pre-line', color: 'var(--text-primary)', fontSize: '0.85rem', margin: 0, lineHeight: '1.4' }}>
                                    <RulesText text={enh.rules} />
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stratagems layout as a tactical grid of cards */}
                      {det.stratagems && det.stratagems.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1.1rem', color: 'var(--accent-gold)', marginBottom: '0.75rem', textTransform: 'uppercase', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.5rem' }}>
                            Stratagems
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
                            {det.stratagems.map((strat) => (
                              <div
                                key={strat.id || strat.name}
                                style={{
                                  background: 'linear-gradient(145deg, var(--bg-tertiary) 0%, rgba(20, 25, 40, 0.7) 100%)',
                                  borderRadius: '10px',
                                  border: '1px solid rgba(255, 255, 255, 0.04)',
                                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                                  overflow: 'hidden',
                                  display: 'flex',
                                  flexDirection: 'column'
                                }}
                              >
                                {/* Stratagem Card Header */}
                                <div style={{
                                  padding: '1rem 1.25rem',
                                  background: 'rgba(255,255,255,0.02)',
                                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <div>
                                    <h5 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem', textTransform: 'uppercase', fontWeight: 600 }}>
                                      {strat.name}
                                    </h5>
                                    {strat.category && (
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {strat.category}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{
                                    background: 'rgba(0, 242, 254, 0.1)',
                                    border: '1px solid var(--accent-teal)',
                                    color: 'var(--accent-teal)',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)'
                                  }}>
                                    {strat.cpCost || '—'}
                                  </span>
                                </div>

                                {/* Stratagem Content */}
                                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, fontSize: '0.85rem' }}>

                                  {strat.lore && (
                                    <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0 0 0.25rem 0', fontSize: '0.8rem', lineHeight: '1.3' }}>
                                      {strat.lore}
                                    </p>
                                  )}

                                  {strat.when && (
                                    <div>
                                      <strong style={{ color: 'var(--accent-teal)', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block', marginBottom: '0.1rem' }}>When:</strong>
                                      <span style={{ color: 'var(--text-primary)' }}><RulesText text={strat.when} /></span>
                                    </div>
                                  )}

                                  {strat.target && (
                                    <div>
                                      <strong style={{ color: 'var(--accent-gold)', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block', marginBottom: '0.1rem' }}>Target:</strong>
                                      <span style={{ color: 'var(--text-primary)' }}><RulesText text={strat.target} /></span>
                                    </div>
                                  )}

                                  {strat.effect && (
                                    <div>
                                      <strong style={{ color: 'var(--accent-green)', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block', marginBottom: '0.1rem' }}>Effect:</strong>
                                      <p style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-line', lineHeight: '1.4' }}><RulesText text={strat.effect} /></p>
                                    </div>
                                  )}

                                  {strat.restrictions && (
                                    <div style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
                                      <strong style={{ color: 'var(--accent-red)', textTransform: 'uppercase', fontSize: '0.75rem', display: 'block', marginBottom: '0.1rem' }}>Restrictions:</strong>
                                      <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}><RulesText text={strat.restrictions} /></span>
                                    </div>
                                  )}

                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {armyRules.length === 0 ? (
            <div className="panel empty-state">
              <Shield size={32} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
              <p>No faction army rules found in active unit datasheets.</p>
            </div>
          ) : (
            armyRules.map((rule) => (
              <div
                key={rule.name}
                className="panel"
                style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}
              >
                <h3 style={{ textTransform: 'uppercase', color: 'var(--accent-gold)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                  {rule.name}
                </h3>
                <p style={{ whiteSpace: 'pre-line', color: 'var(--text-primary)', lineHeight: '1.7', fontSize: '1.05rem' }}>
                  <RulesText text={rule.rules} />
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'yield' && (
        <div className="panel" style={{ textAlign: 'left', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)', marginBottom: '1rem' }}>
            <BarChart2 size={24} />
            <h3 style={{ margin: 0 }}>Point Efficiency Breakdown (Wounds/OC per 100 Points)</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            This analysis evaluates the raw defensive efficiency (Wounds per 100 points) and control efficiency (OC per 100 points) of all units in this faction, calculated using their average points and composition model counts.
          </p>

          {efficiencyMetrics.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <AlertCircle size={24} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
              <p>Insufficient data to calculate point efficiencies for this faction.</p>
            </div>
          ) : (
            <div className="custom-bar-chart">
              {efficiencyMetrics.slice(0, 15).map(item => (
                <div key={item.name} className="chart-bar-container">
                  <div className="chart-bar-label">
                    {item.name} {item.isLegends && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Legends)</span>}
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                    {/* Wounds bar */}
                    <div className="chart-bar-track" style={{ height: '18px' }} title={`Wounds/100 pts: ${item.woundsPerPoint.toFixed(1)}`}>
                      <div
                        className="chart-bar-fill"
                        style={{
                          width: `${Math.min(100, (item.woundsPerPoint / 25) * 100)}%`,
                          background: 'linear-gradient(90deg, #6366f1 0%, #10b981 100%)'
                        }}
                      />
                    </div>
                    {/* OC bar */}
                    <div className="chart-bar-track" style={{ height: '18px' }} title={`OC/100 pts: ${item.ocPerPoint.toFixed(1)}`}>
                      <div
                        className="chart-bar-fill"
                        style={{
                          width: `${Math.min(100, (item.ocPerPoint / 25) * 100)}%`,
                          background: 'linear-gradient(90deg, #6366f1 0%, #e2a826 100%)'
                        }}
                      />
                    </div>
                  </div>
                  <div className="chart-bar-val" style={{ width: '150px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <span style={{ color: 'var(--accent-green)' }}>W:{item.woundsPerPoint.toFixed(1)}</span>
                    <span style={{ color: 'var(--accent-gold)' }}>OC:{item.ocPerPoint.toFixed(1)}</span>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--accent-green)', borderRadius: '3px' }} />
                  <span>Wounds / 100 Points</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--accent-gold)', borderRadius: '3px' }} />
                  <span>OC / 100 Points</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Print Action Bar */}
      {selectedUnits.length > 0 && (
        <div className="print-action-bar no-print">
          <span className="print-action-bar-text">
            {selectedUnits.length} {selectedUnits.length === 1 ? 'unit' : 'units'} selected for reference sheet
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="button"
              style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
              onClick={() => setIsPrintPreviewOpen(true)}
            >
              Open Print Slate
            </button>
            <button
              className="button-outline"
              style={{ fontSize: '0.85rem', padding: '0.4rem 1rem', borderColor: 'var(--text-muted)' }}
              onClick={() => setSelectedUnits([])}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Print Preview Overlay Modal */}
      {isPrintPreviewOpen && (
        <div className="overlay" style={{ zIndex: 1100 }}>
          <div className="print-preview-modal">
            {/* Modal Header (No Print) */}
            <div className="modal-header no-print">
              <div>
                <h3 style={{ textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                  Print Reference Slate Builder
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Configure print layout. Print preview content below is shown in clean black-and-white.
                </span>
              </div>

              {/* Layout Toggle */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="nav-tabs" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <button
                    className={`tab-btn ${printLayout === 'skim' ? 'active' : ''}`}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => setPrintLayout('skim')}
                  >
                    Quick Skim Table
                  </button>
                  <button
                    className={`tab-btn ${printLayout === 'cards' ? 'active' : ''}`}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => setPrintLayout('cards')}
                  >
                    Datasheet Cards
                  </button>
                </div>

                <button
                  className="button"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  Print Slate
                </button>

                <button
                  className="button-outline"
                  onClick={() => setIsPrintPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body / Print Preview Content */}
            <div className="print-preview-body" id="print-slate-root">
              <div className="no-print" style={{ color: '#000', borderBottom: '1px solid #ccc', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <h4 style={{ margin: 0, textTransform: 'uppercase' }}>Print Preview Mode</h4>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
                  This content will print in black and white. Use the browser print settings to save as PDF or print.
                </p>
              </div>

              {printLayout === 'skim' ? (
                <div>
                  <h2 style={{ textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#000', fontSize: '1.5rem' }}>
                    {factionData.factionName} - Combat Quick Reference Slate
                  </h2>
                  <table className="print-bw-skim-table">
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Unit Name</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>Points</th>
                        <th style={{ width: '5%', textAlign: 'center' }}>M</th>
                        <th style={{ width: '5%', textAlign: 'center' }}>T</th>
                        <th style={{ width: '5%', textAlign: 'center' }}>Sv</th>
                        <th style={{ width: '5%', textAlign: 'center' }}>W</th>
                        <th style={{ width: '5%', textAlign: 'center' }}>Ld</th>
                        <th style={{ width: '5%', textAlign: 'center' }}>OC</th>
                        <th style={{ width: '20%' }}>Keywords</th>
                        <th style={{ width: '27%' }}>Weapons / Key Abilities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUnits.map(unit => {
                        const ds = unit.appDatasheet;
                        const firstModel = ds?.models?.[0];
                        const stats = firstModel?.stats;

                        let pts = "Combat Patrol";
                        if (unit.pointsRange.min > 0) {
                          pts = unit.pointsRange.min === unit.pointsRange.max
                            ? `${unit.pointsRange.min}`
                            : `${unit.pointsRange.min}-${unit.pointsRange.max}`;
                        }

                        // Get weapons names
                        const weaponsList: string[] = [];
                        ds?.models.forEach(m => {
                          m.weapons?.forEach(w => {
                            if (!weaponsList.includes(w.name)) {
                              weaponsList.push(w.name);
                            }
                          });
                        });

                        // Get abilities names
                        const abilitiesList = ds?.abilities.map(a => a.name) || [];

                        return (
                          <tr key={unit.slug}>
                            <td><strong>{unit.name}</strong></td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{pts}</td>
                            <td style={{ textAlign: 'center' }}>{stats?.M || '—'}</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt' }}>{stats?.T || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{stats?.Sv || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{stats?.W || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{stats?.Ld || '—'}</td>
                            <td style={{ textAlign: 'center' }}>{stats?.OC || '—'}</td>
                            <td>{firstModel?.keywords.join(', ') || '—'}</td>
                            <td>
                              {weaponsList.length > 0 && (
                                <div style={{ marginBottom: '0.25rem' }}>
                                  <strong>Weapons:</strong> {weaponsList.slice(0, 4).join(', ')}
                                </div>
                              )}
                              {abilitiesList.length > 0 && (
                                <div>
                                  <strong>Abilities:</strong> {abilitiesList.slice(0, 3).join(', ')}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div>
                  <h2 className="no-print" style={{ textTransform: 'uppercase', color: '#000', marginBottom: '1.5rem', fontSize: '1.4rem' }}>
                    {factionData.factionName} - Reference Datasheet Slate
                  </h2>
                  {selectedUnits.map(unit => {
                    const ds = unit.appDatasheet;
                    if (!ds) return null;

                    const unitPts = unit.pointsRange.min;

                    const ranged: { name: string; prof: WeaponProfile }[] = [];
                    const melee: { name: string; prof: WeaponProfile }[] = [];

                    ds.models.forEach(m => {
                      m.weapons?.forEach(w => {
                        w.profiles.forEach(p => {
                          if (p.type === 'ranged') {
                            ranged.push({ name: w.name, prof: p });
                          } else {
                            melee.push({ name: w.name, prof: p });
                          }
                        });
                      });
                    });

                    return (
                      <div key={unit.slug} className="print-bw-datasheet">
                        {/* Header */}
                        <div className="print-bw-header">
                          <h3 className="print-bw-title">{unit.name}</h3>
                          <span className="print-bw-points">{unitPts > 0 ? `${unitPts} pts` : 'Combat Patrol'}</span>
                        </div>

                        {/* Model Stats */}
                        <table className="print-bw-stats-table">
                          <thead>
                            <tr>
                              <th>Model / Miniature</th>
                              <th>M</th>
                              <th>T</th>
                              <th>Sv</th>
                              <th>W</th>
                              <th>Ld</th>
                              <th>OC</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ds.models.map(m => (
                              <tr key={m.id}>
                                <td><strong>{m.name}</strong></td>
                                <td>{m.stats.M}</td>
                                <td><strong>{m.stats.T}</strong></td>
                                <td>{m.stats.Sv}</td>
                                <td>{m.stats.W}</td>
                                <td>{m.stats.Ld}</td>
                                <td>{m.stats.OC}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Abilities */}
                        <div className="print-bw-section-title">Abilities</div>
                        {ds.abilities.map((ab, idx) => (
                          <div key={idx} className="print-bw-ability">
                            <span className="print-bw-ability-name">{ab.name} ({ab.type}): </span>
                            <span><RulesText text={ab.rules} /></span>
                          </div>
                        ))}

                        {/* Ranged Weapons */}
                        {ranged.length > 0 && (
                          <>
                            <div className="print-bw-section-title">Ranged Weapons</div>
                            <table className="print-bw-table">
                              <thead>
                                <tr>
                                  <th>Weapon</th>
                                  <th>Range</th>
                                  <th>A</th>
                                  <th>BS</th>
                                  <th>S</th>
                                  <th>AP</th>
                                  <th>D</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ranged.map(({ name, prof }, idx) => (
                                  <tr key={idx}>
                                    <td>
                                      <strong>{name}</strong>
                                      {prof.name !== name && prof.name !== 'Standard' && ` (${prof.name})`}
                                    </td>
                                    <td>{prof.range}</td>
                                    <td>{prof.attacks}</td>
                                    <td>{prof.ballisticSkill}</td>
                                    <td>{prof.strength}</td>
                                    <td>{prof.armourPenetration}</td>
                                    <td>{prof.damage}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}

                        {/* Melee Weapons */}
                        {melee.length > 0 && (
                          <>
                            <div className="print-bw-section-title">Melee Weapons</div>
                            <table className="print-bw-table">
                              <thead>
                                <tr>
                                  <th>Weapon</th>
                                  <th>Range</th>
                                  <th>A</th>
                                  <th>WS</th>
                                  <th>S</th>
                                  <th>AP</th>
                                  <th>D</th>
                                </tr>
                              </thead>
                              <tbody>
                                {melee.map(({ name, prof }, idx) => (
                                  <tr key={idx}>
                                    <td>
                                      <strong>{name}</strong>
                                      {prof.name !== name && prof.name !== 'Standard' && ` (${prof.name})`}
                                    </td>
                                    <td>{prof.range}</td>
                                    <td>{prof.attacks}</td>
                                    <td>{prof.weaponSkill}</td>
                                    <td>{prof.strength}</td>
                                    <td>{prof.armourPenetration}</td>
                                    <td>{prof.damage}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}

                        {/* Keywords */}
                        <div className="print-bw-keywords">
                          <strong>FACTION KEYWORDS:</strong> {ds.factionKeywords.join(', ')}<br />
                          <strong>KEYWORDS:</strong> {ds.models[0]?.keywords.join(', ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

