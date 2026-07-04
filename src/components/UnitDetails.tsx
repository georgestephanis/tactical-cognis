import React, { useState } from 'react';
import { X, Shield, Target, BookOpen } from 'lucide-react';
import type { MergedUnit, Weapon, WeaponProfile } from '../types/data';
import { calculateExpectedDamage, TARGET_PRESETS } from '../utils/mathhammer';
import type { MathhammerInput } from '../utils/mathhammer';
import { getDatasheetCosts } from '../utils/dataMapper';

interface UnitDetailsProps {
  unit: MergedUnit;
  onClose: () => void;
}

export const UnitDetails: React.FC<UnitDetailsProps> = ({ unit, onClose }) => {
  const datasheet = unit.appDatasheet;
  const costs = getDatasheetCosts(datasheet);
  const leads = datasheet?.leads || [];
  const [viewMode, setViewMode] = useState<'tactical' | 'datasheet'>('tactical');


  // Selected weapon for mathhammer calculations, defaulting to the first
  // weapon of the first armed model. (App keys this component by unit slug,
  // so state resets when the displayed unit changes.)
  const firstWeapon = datasheet?.models?.find(m => m.weapons && m.weapons.length > 0)?.weapons[0] || null;
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(firstWeapon);
  const [selectedProfile, setSelectedProfile] = useState<WeaponProfile | null>(firstWeapon?.profiles?.[0] || null);

  // Custom modifiers for mathhammer calculations
  const [hitReRoll, setHitReRoll] = useState<'none' | 'ones' | 'all'>('none');
  const [woundReRoll, setWoundReRoll] = useState<'none' | 'ones' | 'all'>('none');
  const [plusToHit, setPlusToHit] = useState<number>(0);
  const [plusToWound, setPlusToWound] = useState<number>(0);

  if (!datasheet) {
    return (
      <div className="overlay">
        <div className="detail-modal" style={{ maxWidth: '500px' }}>
          <div className="modal-header">
            <h3>{unit.name}</h3>
            <button className="close-btn" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <p>Full database details for this unit are unavailable.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get baseline points cost for point-yield calculation
  const unitPoints = unit.pointsRange.min || 0;

  // Gather all unique weapons from all models in the datasheet
  const allWeaponsMap = new Map<string, Weapon>();
  datasheet.models.forEach(model => {
    model.weapons?.forEach(wp => {
      allWeaponsMap.set(wp.name, wp);
    });
  });
  const allWeapons = Array.from(allWeaponsMap.values());

  const handleWeaponChange = (weaponName: string) => {
    const weapon = allWeapons.find(w => w.name === weaponName) || null;
    setSelectedWeapon(weapon);
    if (weapon && weapon.profiles && weapon.profiles.length > 0) {
      setSelectedProfile(weapon.profiles[0]);
    } else {
      setSelectedProfile(null);
    }
  };

  // Check weapon abilities from profiles/names
  const detectAbilities = (profile: WeaponProfile, weaponName: string) => {
    const textToSearch = `${profile.name} ${weaponName}`.toLowerCase();

    return {
      torrent: textToSearch.includes('torrent'),
      blast: textToSearch.includes('blast'),
      lethalHits: textToSearch.includes('lethal hits'),
      twinLinked: textToSearch.includes('twin-linked') || textToSearch.includes('twin linked'),
      devastatingWounds: textToSearch.includes('devastating wounds'),
      sustainedHits: textToSearch.includes('sustained hits')
        ? (textToSearch.includes('sustained hits D3') ? 2 : 1) // average of D3 is 2
        : 0
    };
  };

  // Run Mathhammer calculations vs all presets
  const mathResults = selectedProfile && selectedWeapon ? TARGET_PRESETS.map(target => {
    const abilities = detectAbilities(selectedProfile, selectedWeapon.name);

    // Parse BS/WS (e.g. "3+" -> 3, "Melee" is not BS/WS but BS/WS is determined by type)
    let bsWsValue = 4;
    const bsWsStr = selectedProfile.type === 'ranged' ? selectedProfile.ballisticSkill : selectedProfile.weaponSkill;
    if (bsWsStr && bsWsStr.includes('+')) {
      bsWsValue = parseInt(bsWsStr.replace('+', ''), 10);
    }

    const input: MathhammerInput = {
      attacks: selectedProfile.attacks,
      bsWs: bsWsValue,
      strength: parseInt(selectedProfile.strength, 10) || 4,
      ap: parseInt(selectedProfile.armourPenetration, 10) || 0,
      damage: selectedProfile.damage,
      torrent: abilities.torrent,
      twinLinked: abilities.twinLinked,
      lethalHits: abilities.lethalHits,
      sustainedHits: abilities.sustainedHits,
      devastatingWounds: abilities.devastatingWounds,
      blast: abilities.blast,
      hitReRoll,
      woundReRoll,
      plusToHit,
      plusToWound,
      antiKeyword: '',
      antiValue: 0
    };

    const res = calculateExpectedDamage(input, target);

    // Calculate yield (expected casualties per 100 points of the unit)
    const yieldPer100Pts = unitPoints > 0 ? (res.casualties / unitPoints) * 100 : 0;

    return {
      target,
      res,
      yieldPer100Pts
    };
  }) : [];

  // Gather ranged and melee profiles for datasheet render mode
  const rangedProfiles: { weaponName: string; profile: WeaponProfile }[] = [];
  const meleeProfiles: { weaponName: string; profile: WeaponProfile }[] = [];

  allWeapons.forEach(wp => {
    wp.profiles?.forEach(prof => {
      if (prof.type === 'ranged') {
        rangedProfiles.push({ weaponName: wp.name, profile: prof });
      } else {
        meleeProfiles.push({ weaponName: wp.name, profile: prof });
      }
    });
  });

  return (
    <div className="overlay" style={{ display: 'flex', outline: 'none' }} tabIndex={-1}>
      <div className="detail-modal">
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ textTransform: 'uppercase', fontSize: '1.6rem', color: 'var(--text-primary)' }}>
              {datasheet.name}
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Faction: {datasheet.faction} | Source: {datasheet.publication}
            </span>
          </div>

          {/* Mode Selector Toggle */}
          <div className="nav-tabs" style={{ margin: '0 1.5rem', background: 'rgba(0,0,0,0.2)' }}>
            <button
              className={`tab-btn ${viewMode === 'tactical' ? 'active' : ''}`}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
              onClick={() => setViewMode('tactical')}
            >
              Tactical Simulator
            </button>
            <button
              className={`tab-btn ${viewMode === 'datasheet' ? 'active' : ''}`}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
              onClick={() => setViewMode('datasheet')}
            >
              Standard Datasheet
            </button>
          </div>

          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {viewMode === 'datasheet' ? (
            <div className="datasheet-card-render">
              {/* Header Banner */}
              <div className="datasheet-header-banner">
                <div>
                  <span className="datasheet-faction-label">{datasheet.faction}</span>
                  <h3 style={{ textTransform: 'uppercase', fontSize: '1.5rem', color: '#fff', marginTop: '0.25rem' }}>
                    {datasheet.name}
                  </h3>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Points Cost</span>
                  <strong className="text-gold" style={{ fontSize: '1.25rem' }}>{unitPoints > 0 ? `${unitPoints} pts` : 'Combat Patrol'}</strong>
                </div>
              </div>

              {/* Statlines */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {datasheet.models.map(model => (
                  <div key={model.id}>
                    {datasheet.models.length > 1 && (
                      <div style={{ background: '#171d2f', padding: '0.25rem 1rem', fontSize: '0.8rem', color: 'var(--accent-teal)', fontWeight: 600 }}>
                        {model.name}
                      </div>
                    )}
                    <div className="datasheet-stats-row">
                      <div className="datasheet-stat-cell"><span className="datasheet-stat-lbl">M</span><span className="datasheet-stat-val">{model.stats.M}</span></div>
                      <div className="datasheet-stat-cell"><span className="datasheet-stat-lbl">T</span><span className="datasheet-stat-val">{model.stats.T}</span></div>
                      <div className="datasheet-stat-cell"><span className="datasheet-stat-lbl">Sv</span><span className="datasheet-stat-val">{model.stats.Sv}</span></div>
                      <div className="datasheet-stat-cell"><span className="datasheet-stat-lbl">W</span><span className="datasheet-stat-val" style={{ color: 'var(--accent-red)' }}>{model.stats.W}</span></div>
                      <div className="datasheet-stat-cell"><span className="datasheet-stat-lbl">Ld</span><span className="datasheet-stat-val">{model.stats.Ld}</span></div>
                      <div className="datasheet-stat-cell"><span className="datasheet-stat-lbl">OC</span><span className="datasheet-stat-val" style={{ color: 'var(--accent-gold)' }}>{model.stats.OC}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Abilities */}
                <div>
                  <div className="datasheet-section-title">Abilities</div>

                  {datasheet.abilities.filter(a => a.type === 'core').length > 0 && (
                    <div className="datasheet-ability-block">
                      <span className="datasheet-ability-name" style={{ color: 'var(--text-secondary)' }}>Core:</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {datasheet.abilities.filter(a => a.type === 'core').map(a => a.name).join(', ')}
                      </span>
                    </div>
                  )}

                  {datasheet.abilities.filter(a => a.type === 'faction').length > 0 && (
                    <div className="datasheet-ability-block">
                      <span className="datasheet-ability-name" style={{ color: 'var(--accent-gold)' }}>Faction:</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {datasheet.abilities.filter(a => a.type === 'faction').map(a => a.name).join(', ')}
                      </span>
                    </div>
                  )}

                  {datasheet.abilities.filter(a => a.type === 'datasheet').map((ab, idx) => (
                    <div key={idx} className="datasheet-ability-block">
                      <span className="datasheet-ability-name">{ab.name}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{ab.rules}</span>
                    </div>
                  ))}

                  {datasheet.damageProfiles && datasheet.damageProfiles.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      {datasheet.damageProfiles.map((dp, idx) => (
                        <div key={idx} className="datasheet-ability-block" style={{ borderLeft: '3px solid var(--accent-red)', paddingLeft: '0.5rem' }}>
                          <span className="datasheet-ability-name" style={{ color: 'var(--accent-red)' }}>{dp.name}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{dp.rules}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ranged Weapons */}
                {rangedProfiles.length > 0 && (
                  <div>
                    <div className="datasheet-section-title">Ranged Weapons</div>
                    <table className="datasheet-weapon-table">
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
                        {rangedProfiles.map(({ weaponName, profile }, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="datasheet-weapon-name">{weaponName}</span>
                              {profile.name !== weaponName && profile.name !== 'Standard' && (
                                <span className="datasheet-weapon-desc">{profile.name}</span>
                              )}
                            </td>
                            <td>{profile.range}</td>
                            <td>{profile.attacks}</td>
                            <td>{profile.ballisticSkill}</td>
                            <td>{profile.strength}</td>
                            <td>{profile.armourPenetration}</td>
                            <td>{profile.damage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Melee Weapons */}
                {meleeProfiles.length > 0 && (
                  <div>
                    <div className="datasheet-section-title">Melee Weapons</div>
                    <table className="datasheet-weapon-table">
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
                        {meleeProfiles.map(({ weaponName, profile }, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="datasheet-weapon-name">{weaponName}</span>
                              {profile.name !== weaponName && profile.name !== 'Standard' && (
                                <span className="datasheet-weapon-desc">{profile.name}</span>
                              )}
                            </td>
                            <td>{profile.range}</td>
                            <td>{profile.attacks}</td>
                            <td>{profile.weaponSkill}</td>
                            <td>{profile.strength}</td>
                            <td>{profile.armourPenetration}</td>
                            <td>{profile.damage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Composition & Attachments */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                      Unit Composition
                    </span>
                    {costs.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {costs.map((cost, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-primary)' }}>{cost.label}</span>
                            <span className="text-gold" style={{ fontWeight: 600 }}>{cost.points} pts</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No composition pricing records.</span>
                    )}
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                      Combat Attachments & Roles
                    </span>
                    {leads.length > 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                        <div style={{ marginBottom: '0.25rem' }}>
                          <strong>Leads:</strong> {leads.join(', ')}
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Operates independently.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Keywords */}
              <div className="datasheet-keywords-row">
                <div style={{ marginBottom: '0.4rem' }}>
                  <span className="datasheet-keywords-label">Faction Keywords:</span>
                  <span style={{ color: '#fff' }}>{datasheet.factionKeywords.join(', ')}</span>
                </div>
                <div>
                  <span className="datasheet-keywords-label">Keywords:</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{datasheet.models[0]?.keywords.join(', ')}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Stats Bar & Keywords */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Stat Pill Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Unit Statlines
                  </span>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {datasheet.models.map(model => (
                      <div key={model.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {datasheet.models.length > 1 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-teal)' }}>{model.name}</span>
                        )}
                        <div className="stat-pill-container">
                          <div className="stat-pill">
                            <span className="stat-pill-label">M</span>
                            <span className="stat-pill-val">{model.stats.M}</span>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-label">T</span>
                            <span className="stat-pill-val">{model.stats.T}</span>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-label">Sv</span>
                            <span className="stat-pill-val">{model.stats.Sv}</span>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-label">W</span>
                            <span className="stat-pill-val" style={{ color: 'var(--accent-red)' }}>{model.stats.W}</span>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-label">Ld</span>
                            <span className="stat-pill-val">{model.stats.Ld}</span>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill-label">OC</span>
                            <span className="stat-pill-val" style={{ color: 'var(--accent-gold)' }}>{model.stats.OC}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Keywords */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '350px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Combat Keywords
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {datasheet.factionKeywords.map(fk => (
                      <span key={fk} style={{ background: 'rgba(226, 168, 38, 0.1)', border: '1px solid rgba(226, 168, 38, 0.3)', color: 'var(--accent-gold)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                        {fk}
                      </span>
                    ))}
                    {datasheet.models[0]?.keywords.map(kw => (
                      <span key={kw} className="badge badge-legends" style={{ fontSize: '0.75rem' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lore description */}
              {datasheet.lore && (
                <div style={{ background: 'rgba(255,255,255,0.01)', borderLeft: '3px solid var(--accent-gold)', padding: '0.75rem 1.25rem', borderRadius: '0 8px 8px 0', fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {datasheet.lore}
                </div>
              )}

              {/* Unit Composition & Costs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Compositions (from companion app data) */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <BookOpen size={16} style={{ color: 'var(--accent-teal)' }} />
                    Unit Composition & Pricing
                  </h4>

                  {costs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {costs.map((cost, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{cost.label}</span>
                          <strong style={{ color: 'var(--accent-gold)', fontSize: '0.9rem' }}>{cost.points} pts</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      No point values defined for this unit.
                    </div>
                  )}
                </div>

                {/* Leadership Capabilities */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <h4 style={{ textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Shield size={16} style={{ color: 'var(--accent-gold)' }} />
                    Leader & Support Rules
                  </h4>
                  {leads.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Can Lead (Bodyguards):
                        </span>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {leads.map(lead => (
                            <span key={lead} style={{ background: 'rgba(0, 242, 254, 0.05)', border: '1px solid rgba(0, 242, 254, 0.15)', color: 'var(--accent-teal)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                              {lead}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      This unit operates independently.
                    </div>
                  )}
                </div>
              </div>

              {/* Weapon Sheets */}
              <div>
                <h4 style={{ textTransform: 'uppercase', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.4rem' }}>
                  Weapons Inventory
                </h4>
                {allWeapons.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No base weapons resolved for this datasheet.</p>
                ) : (
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Weapon</th>
                        <th>Range</th>
                        <th>Attacks</th>
                        <th>BS/WS</th>
                        <th>S</th>
                        <th>AP</th>
                        <th>Damage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allWeapons.map(wp => (
                        <React.Fragment key={wp.name}>
                          {wp.profiles.map((prof, pidx) => (
                            <tr key={`${wp.name}-${pidx}`}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {wp.profiles.length > 1 ? `${wp.name} (${prof.name})` : wp.name}
                                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 500, marginTop: '0.15rem' }}>
                                  {prof.type}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{prof.range}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{prof.attacks}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>
                                {prof.type === 'ranged' ? prof.ballisticSkill : prof.weaponSkill}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{prof.strength}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{prof.armourPenetration}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }} className="text-teal">{prof.damage}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Abilities & Special Rules */}
              <div>
                <h4 style={{ textTransform: 'uppercase', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.4rem' }}>
                  Special Abilities
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {datasheet.abilities.map((ab, idx) => (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <strong style={{ color: 'var(--accent-gold)', fontSize: '0.95rem', textTransform: 'uppercase' }}>
                          {ab.name}
                        </strong>
                        <span className="badge badge-legends" style={{ fontSize: '0.65rem' }}>{ab.type}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>
                        {ab.rules}
                      </p>
                    </div>
                  ))}
                  {datasheet.damageProfiles && datasheet.damageProfiles.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-red)', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                        Damage Bracket Rules (DAMAGED)
                      </span>
                      {datasheet.damageProfiles.map((dp, idx) => (
                        <div key={idx} style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '0.5rem' }}>
                          <strong style={{ color: 'var(--accent-red)', fontSize: '0.85rem' }}>{dp.name}</strong>
                          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-primary)' }}>{dp.rules}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive Mathhammer Section */}
              {allWeapons.length > 0 && (
                <div
                  style={{
                    background: 'rgba(0, 242, 254, 0.02)',
                    border: '1px solid rgba(0, 242, 254, 0.15)',
                    borderRadius: '16px',
                    padding: '1.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)', marginBottom: '1rem' }}>
                    <Target size={20} />
                    <h3 style={{ margin: 0 }}>Weapon Yield Simulator (Mathhammer)</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Simulate offensive yields for this unit's weapons vs standard enemy targets. Points efficiency is calculated using the unit's base points (<strong className="text-gold">{unitPoints} pts</strong>).
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                    {/* Simulator Inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid rgba(255,255,255,0.05)', paddingRight: '1.5rem' }}>
                      {/* Select weapon */}
                      <div className="input-group">
                        <label>Weapon to Fire</label>
                        <select
                          className="input-control"
                          value={selectedWeapon?.name || ''}
                          onChange={(e) => handleWeaponChange(e.target.value)}
                        >
                          {allWeapons.map(w => (
                            <option key={w.name} value={w.name}>{w.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Select profile if multiple */}
                      {selectedWeapon && selectedWeapon.profiles.length > 1 && (
                        <div className="input-group">
                          <label>Weapon Profile</label>
                          <select
                            className="input-control"
                            value={selectedProfile?.name || ''}
                            onChange={(e) => setSelectedProfile(selectedWeapon.profiles.find(p => p.name === e.target.value) || null)}
                          >
                            {selectedWeapon.profiles.map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Hit modifiers */}
                      <div className="input-group">
                        <label>Hit Re-rolls</label>
                        <select
                          className="input-control"
                          value={hitReRoll}
                          onChange={(e) => setHitReRoll(e.target.value as 'none' | 'ones' | 'all')}
                        >
                          <option value="none">No Re-rolls</option>
                          <option value="ones">Re-roll 1s</option>
                          <option value="all">Re-roll All Fails</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label>Wound Re-rolls</label>
                        <select
                          className="input-control"
                          value={woundReRoll}
                          onChange={(e) => setWoundReRoll(e.target.value as 'none' | 'ones' | 'all')}
                        >
                          <option value="none">No Re-rolls</option>
                          <option value="ones">Re-roll 1s</option>
                          <option value="all">Re-roll All Fails</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                          <label>Hit Modifier</label>
                          <select
                            className="input-control"
                            value={plusToHit}
                            onChange={(e) => setPlusToHit(parseInt(e.target.value, 10))}
                          >
                            <option value={0}>Flat (0)</option>
                            <option value={1}>+1 to Hit</option>
                            <option value={-1}>-1 to Hit</option>
                          </select>
                        </div>
                        <div className="input-group" style={{ flex: 1 }}>
                          <label>Wound Modifier</label>
                          <select
                            className="input-control"
                            value={plusToWound}
                            onChange={(e) => setPlusToWound(parseInt(e.target.value, 10))}
                          >
                            <option value={0}>Flat (0)</option>
                            <option value={1}>+1 to Wound</option>
                            <option value={-1}>-1 to Wound</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Simulator Results */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {selectedProfile ? (
                        <div>
                          {/* Active profile stats tag */}
                          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '0.5rem 0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.02)' }}>
                            <span>A: {selectedProfile.attacks}</span>
                            <span>BS/WS: {selectedProfile.type === 'ranged' ? selectedProfile.ballisticSkill : selectedProfile.weaponSkill}</span>
                            <span>S: {selectedProfile.strength}</span>
                            <span>AP: {selectedProfile.armourPenetration}</span>
                            <span>D: {selectedProfile.damage}</span>
                          </div>

                          {/* Yield results table */}
                          <table className="stats-table" style={{ fontSize: '0.85rem' }}>
                            <thead>
                              <tr>
                                <th>Target</th>
                                <th style={{ textAlign: 'center' }}>Avg Hits</th>
                                <th style={{ textAlign: 'center' }}>Avg Wounds</th>
                                <th style={{ textAlign: 'center' }}>Casualties</th>
                                <th style={{ textAlign: 'right' }}>Casualties / 100 Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mathResults.map((item, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <strong style={{ color: 'var(--text-primary)' }}>{item.target.name}</strong>
                                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                      T{item.target.t} Sv{item.target.sv}+ W{item.target.w} {item.target.inv && `Inv${item.target.inv}++`}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{item.res.expectedHits.toFixed(2)}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{item.res.expectedWounds.toFixed(2)}</td>
                                  <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)', fontWeight: 600 }}>
                                    {item.res.casualties.toFixed(2)}
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700 }}>
                                    {unitPoints > 0 ? item.yieldPer100Pts.toFixed(3) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                          Select a valid weapon and profile to run simulation.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button className="button-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

