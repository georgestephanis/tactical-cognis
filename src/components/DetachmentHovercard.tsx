import RulesText from './RulesText';
import type { MergedDetachment } from '../types/data';

// Rich hover content for a selected-detachment chip in the Army Builder — summarizes
// what a detachment actually grants (dispositions, enhancements, stratagems, rules)
// so the player can see what they're adding without leaving the roster screen.
export default function DetachmentHovercard({ detachment }: { detachment: MergedDetachment }) {
  const { forceDispositions, enhancements, stratagems, rules } = detachment;

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
