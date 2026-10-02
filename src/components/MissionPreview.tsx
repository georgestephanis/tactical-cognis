import RulesText from './RulesText';
import { getPresetLetter } from '../utils/missionIntel';
import type { AppSecondaryMission, DispositionIntel, PrimaryMissionObjective } from '../types/data';

// Collapsible in-builder preview of what the army's force disposition leads to:
// the primary mission and recommended map presets against each opposing
// disposition, how often each deployment map comes up, and the secondary deck.
// The same data the print slate's "Disposition & Map Intel" section prints, so a
// player can compare dispositions before committing to one.

interface MissionPreviewProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  /** False while the detachments offer several dispositions and none is chosen. */
  hasDisposition: boolean;
  /** True while intel for the current disposition is still being fetched. */
  loading: boolean;
  intel: DispositionIntel | null;
  secondaryMissions: AppSecondaryMission[];
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
  color: 'var(--text-muted)', margin: '0 0 0.4rem 0'
};

const nestedDetails: React.CSSProperties = {
  marginTop: '0.4rem', borderTop: '1px dashed var(--glass-border)', paddingTop: '0.35rem'
};

function ObjectiveList({ objectives }: { objectives: PrimaryMissionObjective[] | AppSecondaryMission['objectives'] }) {
  if (objectives.length === 0) return null;
  return (
    <ul style={{ margin: '0.3rem 0 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
      {objectives.map(obj => (
        <li key={obj.id} style={{ marginBottom: '0.2rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{obj.name}</span>
          {obj.whenText && <span> — {obj.whenText}</span>}
          {obj.scoring.map(sc => (
            <div key={sc.id} style={{ marginLeft: '0.5rem' }}>
              • <RulesText text={sc.scoringCriteria} />{' '}
              <strong style={{ color: 'var(--accent-gold)' }}>({sc.victoryPoints} VP{sc.isCumulative ? ', cumulative' : ''})</strong>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

export default function MissionPreview({ open, onToggle, hasDisposition, loading, intel, secondaryMissions }: MissionPreviewProps) {
  let body: React.ReactNode;
  if (!hasDisposition) {
    body = <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Choose a force disposition above to preview its missions and maps.</p>;
  } else if (loading) {
    body = <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Loading mission data…</p>;
  } else if (!intel) {
    body = <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>This database has no mission-pack data for this disposition.</p>;
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Crossed with your opponent's disposition, <strong>{intel.friendlyDispositionName}</strong> sets the primary
          mission and a set of recommended map presets — {intel.matchups.length} possible pairings,
          {' '}{intel.totalPresets} presets in total.
        </p>

        <div>
          <p style={sectionTitle}>Primary Mission by Opponent</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {intel.matchups.map(m => (
              <div key={m.oppositionDispositionId} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '0.5rem 0.65rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>vs {m.oppositionDispositionName}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-teal)' }}>{m.primaryMission.name}</div>
                {m.presets.length > 0 && (
                  <ul style={{ margin: '0.3rem 0 0 0', paddingLeft: 0, listStyle: 'none', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {m.presets.map((p, idx) => (
                      <li key={p.presetId} title={p.layoutName}>
                        <strong style={{ color: 'var(--text-primary)' }}>{getPresetLetter(p.presetName, p.layoutName, idx)}</strong>
                        {' '}{p.deploymentName}
                      </li>
                    ))}
                  </ul>
                )}
                {(m.primaryMission.description || m.primaryMission.objectives.length > 0) && (
                  <details style={nestedDetails}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rules &amp; scoring</summary>
                    {m.primaryMission.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        <RulesText text={m.primaryMission.description} />
                      </div>
                    )}
                    <ObjectiveList objectives={m.primaryMission.objectives} />
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>

        {intel.deploymentFrequencies.length > 0 && (
          <div>
            <p style={sectionTitle}>Deployment Map Odds</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.4rem 0' }}>Assumes each opposing disposition is equally likely.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {intel.deploymentFrequencies.map(freq => (
                <div key={freq.deploymentName} title={freq.matchups.join(', ')} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr auto', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{freq.deploymentName}</span>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '3px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ width: `${freq.percentage}%`, height: '100%', background: 'var(--accent-teal)' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {freq.count}/{freq.totalPresets} ({Math.round(freq.percentage)}%)
                  </span>
                </div>
              ))}
            </div>
            {intel.neverEncounteredDeployments.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0' }}>
                Never under this disposition: {intel.neverEncounteredDeployments.join(', ')}
              </p>
            )}
          </div>
        )}

        {secondaryMissions.length > 0 && (
          <details>
            <summary style={{ ...sectionTitle, cursor: 'pointer', margin: 0 }}>Secondary Missions Deck ({secondaryMissions.length})</summary>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.4rem 0' }}>
              The data links no secondaries to a disposition — this is the full deck whichever you choose.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
              {secondaryMissions.map(sm => (
                <div key={sm.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '0.5rem 0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{sm.name}</strong>
                    <span style={{ fontSize: '0.68rem', color: sm.isFixedSecondary ? 'var(--accent-gold)' : 'var(--accent-teal)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {sm.isFixedSecondary ? 'Fixed / Tac' : 'Tactical'}{sm.isScorableFirstTurn ? '' : ' · Rd 2+'}
                    </span>
                  </div>
                  <ObjectiveList objectives={sm.objectives} />
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  return (
    <details
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      style={{ marginTop: '0.6rem', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', padding: '0.6rem 0.9rem' }}
    >
      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--accent-gold)', textTransform: 'uppercase' }}>
        Mission Preview{intel && hasDisposition && !loading ? ` — ${intel.friendlyDispositionName}` : ''}
      </summary>
      <div style={{ marginTop: '0.6rem' }}>{body}</div>
    </details>
  );
}
