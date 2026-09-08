import RulesText from './RulesText';
import type { MergedDetachment } from '../types/data';

// Rich hover content for a selected-detachment chip in the Army Builder — summarizes
// what a detachment actually grants (dispositions, enhancements, stratagems, rules)
// so the player can see what they're adding without leaving the roster screen.
export default function DetachmentHovercard({ detachment }: { detachment: MergedDetachment }) {
  const { forceDispositions, enhancements, stratagems, rules, details, linkedDatasheets } = detachment;

  return (
    <div className="detachment-hovercard" role="tooltip">
      <p className="detachment-hovercard-title">{detachment.name}</p>

      {forceDispositions.length > 0 && (
        <div className="detachment-hovercard-section">
          <div className="detachment-hovercard-section-title">
            Force Disposition{forceDispositions.length > 1 ? 's' : ''}
          </div>
          {forceDispositions.map(d => <div key={d.id}>{d.name}</div>)}
        </div>
      )}

      {linkedDatasheets && linkedDatasheets.length > 0 && (
        <div className="detachment-hovercard-section">
          <div className="detachment-hovercard-section-title">Comes With</div>
          {linkedDatasheets.map((ld, idx) => (
            <div key={idx}>
              {ld.count > 1 ? `${ld.count}x ` : ''}{ld.datasheetName}{ld.isWarlord ? ' (Warlord)' : ''}
            </div>
          ))}
        </div>
      )}

      {details && details.length > 0 && (
        <div className="detachment-hovercard-section">
          {details.map(d => (
            <div className="detachment-hovercard-item" key={d.id}>
              <div className="detachment-hovercard-item-name">{d.title}</div>
              <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.1rem' }}>
                {d.bullets.map((b, idx) => <li key={idx}><RulesText text={b} /></li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {enhancements.length > 0 && (
        <div className="detachment-hovercard-section">
          <div className="detachment-hovercard-section-title">Enhancements</div>
          {enhancements.map(e => (
            <div className="detachment-hovercard-item" key={e.id || e.name}>
              <div className="detachment-hovercard-item-name">
                {e.name}
                {e.pointsCost ? <span className="detachment-hovercard-item-meta"> ({e.pointsCost} pts)</span> : null}
              </div>
              {e.rules && <div><RulesText text={e.rules} /></div>}
            </div>
          ))}
        </div>
      )}

      {stratagems.length > 0 && (
        <div className="detachment-hovercard-section">
          <div className="detachment-hovercard-section-title">Stratagems</div>
          {stratagems.map(s => (
            <div className="detachment-hovercard-item" key={s.id}>
              <div className="detachment-hovercard-item-name">
                {s.name}
                {s.cpCost ? <span className="detachment-hovercard-item-meta"> ({s.cpCost} CP)</span> : null}
              </div>
              {s.effect && <div><RulesText text={s.effect} /></div>}
            </div>
          ))}
        </div>
      )}

      {rules.length > 0 && (
        <div className="detachment-hovercard-section">
          <div className="detachment-hovercard-section-title">Detachment Rules</div>
          {rules.map(r => (
            <div className="detachment-hovercard-item" key={r.id}>
              <div className="detachment-hovercard-item-name">{r.name}</div>
              {r.rules && <div><RulesText text={r.rules} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
