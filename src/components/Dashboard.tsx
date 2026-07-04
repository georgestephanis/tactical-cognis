import React, { useState, useEffect } from 'react';
import { Shield, Sparkles, Database, Search } from 'lucide-react';

interface DashboardProps {
  onSelectFaction: (slug: string) => void;
}

interface FactionSummary {
  faction: string;
  slug: string;
  detachments: number;
  units: number;
}

interface AppStats {
  dataVersion: number;
  extractedAt: string;
  counts: {
    tables: number;
    datasheets: number;
    miniatures: number;
    wargearItems: number;
    stratagems: number;
    enhancements: number;
    detachments: number;
  };
}

import { initDatabase, getDbStats, getFactionList } from '../utils/db';

export const Dashboard: React.FC<DashboardProps> = ({ onSelectFaction }) => {
  const [factions, setFactions] = useState<FactionSummary[]>([]);
  const [appStats, setAppStats] = useState<AppStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIndexes() {
      try {
        await initDatabase('/40k.sqlite');
        const [stats, list] = await Promise.all([
          getDbStats(),
          getFactionList()
        ]);
        setAppStats(stats);
        setFactions(list);
      } catch (error) {
        console.error("Error loading index data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadIndexes();
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <Sparkles className="animate-spin" size={48} style={{ color: 'var(--accent-teal)', marginBottom: '1rem' }} />
        <h2>Initializing WH40k Tactical Cognis Database...</h2>
        <p>Loading Munitorum Field Manual and Companion records.</p>
      </div>
    );
  }

  const filteredFactions = factions.filter(f =>
    f.faction.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Hero Header */}
      <div
        className="panel"
        style={{
          background: 'linear-gradient(135deg, rgba(22, 30, 54, 0.9) 0%, rgba(15, 19, 31, 0.9) 100%)',
          textAlign: 'left',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)', marginBottom: '0.75rem', fontWeight: 600, letterSpacing: '0.1em' }}>
            <Shield size={18} />
            MUNITORUM FIELD MANUAL COGNIS ENGINE
          </div>
          <h1 style={{ fontSize: '3rem', margin: '0 0 1rem 0' }}>Tactical Deep Yield Analysis</h1>
          <p style={{ maxWidth: '750px', fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            A statistical intelligence interface designed for Warhammer 40,000. Reconciles companion database definitions with active Munitorum Field Manual points allocations to analyze point yield, expected damage, and battlefield functionality.
          </p>

          {/* Quick Metrics Bar */}
          {appStats && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', padding: '1.5rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Data Version</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-teal)' }}>v{appStats.dataVersion}</div>
              </div>
              <div style={{ width: '1px', background: 'var(--glass-border)' }} />
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Datasheets</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{appStats.counts.datasheets}</div>
              </div>
              <div style={{ width: '1px', background: 'var(--glass-border)' }} />
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Miniatures</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{appStats.counts.miniatures}</div>
              </div>
              <div style={{ width: '1px', background: 'var(--glass-border)' }} />
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Weapons & Wargear</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{appStats.counts.wargearItems}</div>
              </div>
              <div style={{ width: '1px', background: 'var(--glass-border)' }} />
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Active Factions</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-gold)' }}>{factions.length}</div>
              </div>
            </div>
          )}
        </div>

        {/* Subtle background graphics */}
        <div
          style={{
            position: 'absolute',
            right: '-50px',
            top: '-50px',
            width: '300px',
            height: '300px',
            background: 'var(--accent-gold-glow)',
            borderRadius: '50%',
            filter: 'blur(80px)',
            opacity: 0.5,
            zIndex: 1
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '200px',
            bottom: '-100px',
            width: '250px',
            height: '250px',
            background: 'var(--accent-teal-glow)',
            borderRadius: '50%',
            filter: 'blur(80px)',
            opacity: 0.3,
            zIndex: 1
          }}
        />
      </div>

      {/* Factions Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          <h2>Strategic Factions Registry</h2>
          <div className="search-container">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="Filter factions (e.g. Orks, Space Marines)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {filteredFactions.length === 0 ? (
          <div className="empty-state">
            <Database size={32} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            <p>No factions matching "{searchQuery}" found in the cognis database.</p>
          </div>
        ) : (
          <div className="faction-grid">
            {filteredFactions.map((fac) => (
              <div
                key={fac.slug}
                className="faction-card"
                onClick={() => onSelectFaction(fac.slug)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <h3 style={{ textTransform: 'uppercase', letterSpacing: '0.02em', fontSize: '1.25rem' }}>
                    {fac.faction}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    /{fac.slug}
                  </span>
                </div>

                <div className="faction-card-meta">
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>{fac.units}</strong> Units
                    </span>
                    <span style={{ color: 'var(--glass-border)' }}>|</span>
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>{fac.detachments}</strong> Detachments
                    </span>
                  </div>
                  <div className="faction-card-badge">Browse</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
