import { useEffect, useState } from 'react';
import { Sparkles, Printer, BookOpen, FileDown, FileCode } from 'lucide-react';
import { initDatabase, getCoreRules, getCoreRulesFaqs } from '../utils/db';
import type { CoreRuleSection, CoreRuleComponent, CoreRuleFaqEntry } from '../types/data';
import RulesText from './RulesText';
import { downloadCoreRulesRtf } from '../utils/rtfExport';
import { downloadCoreRulesHtml } from '../utils/htmlExport';

function CoreRuleComponentView({ c }: { c: CoreRuleComponent }) {
  switch (c.type) {
    case 'header':
      return <h5 className="core-rules-header">{c.title && <RulesText text={c.title} />}</h5>;

    case 'textBold':
      return (
        <p className="core-rules-text core-rules-text-bold">
          {c.title && <><strong><RulesText text={c.title} /></strong>{' '}</>}
          {c.textContent && <RulesText text={c.textContent} />}
        </p>
      );

    case 'loreAccordion':
      return (
        <div className="core-rules-box core-rules-lore">
          {c.title && <div className="core-rules-box-title">{c.title}</div>}
          {c.textContent && <p className="core-rules-text"><RulesText text={c.textContent} /></p>}
        </div>
      );

    case 'accordion':
      return (
        <div className="core-rules-box core-rules-accordion">
          {(c.title || c.subtitle) && (
            <div className="core-rules-box-title">
              {c.title && <RulesText text={c.title} />}
              {c.subtitle && <span className="core-rules-box-subtitle"> ({c.subtitle})</span>}
            </div>
          )}
          {c.textContent && <p className="core-rules-text"><RulesText text={c.textContent} /></p>}
        </div>
      );

    case 'triggerEffectAccordion':
      return (
        <div className="core-rules-box core-rules-trigger-effect">
          {c.title && <div className="core-rules-box-title"><RulesText text={c.title} /></div>}
          {c.trigger && (
            <p className="core-rules-text"><strong>When:</strong> <RulesText text={c.trigger} /></p>
          )}
          {c.effect && (
            <p className="core-rules-text"><strong>Then:</strong> <RulesText text={c.effect} /></p>
          )}
        </div>
      );

    case 'quote':
      return (
        <blockquote className="core-rules-quote">
          {c.textContent && <RulesText text={c.textContent} />}
        </blockquote>
      );

    case 'boxedText':
      return (
        <div className="core-rules-box core-rules-boxed">
          {c.textContent && <p className="core-rules-text"><RulesText text={c.textContent} /></p>}
        </div>
      );

    case 'image':
      return c.imageUrl ? (
        <img
          className="core-rules-image"
          src={c.imageUrl}
          loading="lazy"
          alt={c.title || ''}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : null;

    case 'bullets':
      return c.bulletPoints.length > 0 ? (
        <ul className="core-rules-bullets">
          {c.bulletPoints.map((b, i) => <li key={i}><RulesText text={b} /></li>)}
        </ul>
      ) : (c.textContent ? <p className="core-rules-text"><RulesText text={c.textContent} /></p> : null);

    case 'text':
    default:
      return c.textContent ? (
        <p className="core-rules-text"><RulesText text={c.textContent} /></p>
      ) : null;
  }
}

function CoreRulesFaqAside({ faqs, includeInPrint }: { faqs: CoreRuleFaqEntry[]; includeInPrint: boolean }) {
  return (
    <details className={`core-rules-faq${includeInPrint ? '' : ' no-print'}`} open={includeInPrint}>
      <summary className="core-rules-faq-summary">
        FAQ &amp; Rules Commentary ({faqs.length})
      </summary>
      {faqs.map(faq => (
        <div key={faq.id} className="core-rules-faq-entry">
          {faq.question && <p className="core-rules-faq-q"><strong>Q:</strong> <RulesText text={faq.question} /></p>}
          {faq.answer && <p className="core-rules-faq-a"><strong>A:</strong> <RulesText text={faq.answer} /></p>}
          {faq.errataHeader && <p className="core-rules-faq-q"><strong><RulesText text={faq.errataHeader} /></strong></p>}
          {faq.errataText && <p className="core-rules-faq-a"><RulesText text={faq.errataText} /></p>}
        </div>
      ))}
    </details>
  );
}

export function CoreRules() {
  const [sections, setSections] = useState<CoreRuleSection[]>([]);
  const [faqsByContainer, setFaqsByContainer] = useState<Record<string, CoreRuleFaqEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [includeFaqsInPrint, setIncludeFaqsInPrint] = useState(false);
  const [exportingRtf, setExportingRtf] = useState(false);

  async function handleDownloadRtf() {
    setExportingRtf(true);
    try {
      await downloadCoreRulesRtf(sections);
    } finally {
      setExportingRtf(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        await initDatabase('/40k.sqlite');
        const [rules, faqs] = await Promise.all([getCoreRules(), getCoreRulesFaqs()]);
        setSections(rules);
        setFaqsByContainer(faqs);
      } catch (err) {
        console.error('Error loading core rules:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <Sparkles className="animate-spin" size={48} style={{ color: 'var(--accent-teal)', marginBottom: '1rem' }} />
        <h2>Loading Core Rules...</h2>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="empty-state">
        <BookOpen size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
        <h2>Core Rules Not Found</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          This database doesn't include the "Core Rules" publication, or its rule text tables are missing.
        </p>
      </div>
    );
  }

  return (
    <div className="core-rules-layout">
      <aside className="core-rules-toc no-print">
        {sections.map(section => (
          <div key={section.id} className="core-rules-toc-section">
            <div className="core-rules-toc-section-title">{section.name}</div>
            {section.containers.map(container => (
              <a key={container.id} href={`#rc-${container.id}`} className="core-rules-toc-link">
                {container.subtitle && <span className="core-rules-toc-number">{container.subtitle}</span>}
                {container.title}
              </a>
            ))}
          </div>
        ))}
      </aside>

      <div className="core-rules-content">
        <div className="core-rules-page-header no-print">
          <div>
            <h2>Core Rules</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Extracted from the loaded database. Use the browser's print dialog for a clean printout.
            </p>
          </div>
          <div className="core-rules-page-actions">
            <label className="core-rules-faq-toggle">
              <input
                type="checkbox"
                checked={includeFaqsInPrint}
                onChange={(e) => setIncludeFaqsInPrint(e.target.checked)}
              />
              Include FAQ/Commentary when printing
            </label>
            <button className="button-outline" onClick={() => downloadCoreRulesHtml(sections)}>
              <FileCode size={16} /> Download HTML
            </button>
            <button className="button-outline" onClick={handleDownloadRtf} disabled={exportingRtf}>
              <FileDown size={16} /> {exportingRtf ? 'Fetching images…' : 'Download RTF'}
            </button>
            <button className="button" onClick={() => window.print()}>
              <Printer size={16} /> Print Core Rules
            </button>
          </div>
        </div>

        <div className="core-rules-doc">
          {sections.map(section => (
            <section key={section.id} className="core-rules-section">
              <h3 className="core-rules-section-title">{section.name}</h3>
              {section.containers.map(container => (
                <div key={container.id} id={`rc-${container.id}`} className="core-rules-container">
                  {container.title && (
                    <h4 className="core-rules-container-title">
                      {container.subtitle && <span className="core-rules-container-number">{container.subtitle}</span>}
                      {container.title}
                    </h4>
                  )}
                  {container.components.map(c => <CoreRuleComponentView key={c.id} c={c} />)}
                  {faqsByContainer[container.id] && (
                    <CoreRulesFaqAside faqs={faqsByContainer[container.id]} includeInPrint={includeFaqsInPrint} />
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
