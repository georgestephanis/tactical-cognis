import { useState, useEffect } from 'react';
import { Shield, Target } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { FactionBrowser } from './components/FactionBrowser';
import { UnitDetails } from './components/UnitDetails';
import { DeepAnalysis } from './components/DeepAnalysis';
import { ArmyBuilder } from './components/ArmyBuilder';
import { DatabaseUploadView } from './components/DatabaseUploadView';
import type { MergedUnit } from './types/data';
import { loadAndMergeFaction } from './utils/dataMapper';
import { initDatabase, getDbStats } from './utils/db';

function App() {
  const [view, setView] = useState<'dashboard' | 'faction' | 'analysis' | 'builder'>('dashboard');
  const [activeFactionSlug, setActiveFactionSlug] = useState<string | null>(null);
  const [activeUnit, setActiveUnit] = useState<MergedUnit | null>(null);
  const [dbVersion, setDbVersion] = useState<number>(875);

  const [isDbLoadedState, setIsDbLoadedState] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. Auto-initialize database on mount (pre-baked public/40k.sqlite, if present)
  useEffect(() => {
    const initializeDatabase = async () => {
      setLoading(true);
      try {
        const loaded = await initDatabase();
        if (loaded) {
          setIsDbLoadedState(true);
          const stats = await getDbStats();
          setDbVersion(stats.dataVersion);
        } else {
          setIsDbLoadedState(false);
        }
      } catch (err) {
        console.error('Error during database initialization:', err);
        setIsDbLoadedState(false);
      } finally {
        setLoading(false);
      }
    };

    initializeDatabase();
  }, []);

  // 2. Sync state from URL and popstate listeners — ONLY run after DB is loaded
  useEffect(() => {
    if (!isDbLoadedState) return;

    const handleLocationChange = async () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('view');
      const f = params.get('faction');
      const u = params.get('unit');

      if (v === 'builder') {
        setView('builder');
      } else if (v === 'analysis') {
        setView('analysis');
      } else if (v === 'faction' && f) {
        setActiveFactionSlug(f);
        setView('faction');

        // Deep link into a unit
        if (u) {
          const factionData = await loadAndMergeFaction(f);
          if (factionData) {
            const unit = factionData.units.find(un => un.slug === u);
            if (unit) setActiveUnit(unit);
            else setActiveUnit(null);
          }
        } else {
          setActiveUnit(null);
        }
      } else {
        setView('dashboard');
        setActiveFactionSlug(null);
        setActiveUnit(null);
      }
    };

    // Run once on mount
    handleLocationChange();

    // Fetch DB stats for global display
    getDbStats().then(stats => {
      setDbVersion(stats.dataVersion);
    }).catch(err => console.error("Could not fetch DB version", err));

    // Listen for back/forward browser buttons
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, [isDbLoadedState]);

  // 3. Update URL whenever view, faction, or unit changes (pushState)
  useEffect(() => {
    if (!isDbLoadedState) return;

    const params = new URLSearchParams(window.location.search);
    const currentView = params.get('view');
    const currentFaction = params.get('faction');
    const currentUnit = params.get('unit');

    if (view === 'dashboard' && currentView) {
      window.history.pushState({ view: 'dashboard' }, '', '/');
    } else if (view === 'faction' && activeFactionSlug) {
      if (activeUnit) {
        if (currentView !== 'faction' || currentFaction !== activeFactionSlug || currentUnit !== activeUnit.slug) {
          window.history.pushState(
            { view: 'faction', faction: activeFactionSlug, unit: activeUnit.slug },
            '',
            `?view=faction&faction=${activeFactionSlug}&unit=${activeUnit.slug}`
          );
        }
      } else if (currentView !== 'faction' || currentFaction !== activeFactionSlug || currentUnit) {
        window.history.pushState(
          { view: 'faction', faction: activeFactionSlug },
          '',
          `?view=faction&faction=${activeFactionSlug}`
        );
      }
    } else if (view === 'builder' && currentView !== 'builder') {
      window.history.pushState({ view: 'builder' }, '', '?view=builder');
    } else if (view === 'analysis' && currentView !== 'analysis') {
      window.history.pushState({ view: 'analysis' }, '', '?view=analysis');
    }
  }, [view, activeFactionSlug, activeUnit, isDbLoadedState]);

  // 4. SEO: Dynamically update title and meta descriptions
  useEffect(() => {
    if (!isDbLoadedState) return;

    let title = 'WH40k Tactical Cognis Database | Yield & Efficiency Analysis';
    let description = 'Interactive tactical analyzer for Warhammer 40k. Reconcile companion datasheets and MFM rules to compute expected damage and points yield.';

    if (view === 'faction' && activeFactionSlug) {
      const factionName = activeFactionSlug.replace(/-/g, ' ').toUpperCase();
      title = `${factionName} Data Slate | WH40k Cognis Engine`;
      description = `Browse unit datasheets, detachment enhancements, and rules for ${factionName} with points yield calculators.`;
    } else if (view === 'analysis') {
      title = 'Mathhammer Playground & Points Matrix | WH40k Cognis Engine';
      description = 'Simulate expected combat yields and compare points efficiency rankings across all Warhammer 40,000 factions.';
    } else if (view === 'builder') {
      title = 'Force Roster Builder | WH40k Tactical Cognis';
      description = 'Construct competitive army lists, assign detachments, attach leaders and supports, and validate points limitations in real-time.';
    }

    document.title = title;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);
  }, [view, activeFactionSlug, isDbLoadedState]);

  const handleSelectFaction = (slug: string) => {
    setActiveFactionSlug(slug);
    setView('faction');
  };

  const handleBackToDashboard = () => {
    setActiveFactionSlug(null);
    setView('dashboard');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0c0f12', color: 'var(--accent-gold)', gap: '1rem', fontFamily: 'var(--font-mono)' }}>
        <div className="spinner" style={{ border: '3px solid rgba(197, 160, 89, 0.1)', borderTop: '3px solid var(--accent-gold)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }}></div>
        <span>BOOTING COGNIS ENGINE...</span>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header bar */}
      <header className="header">
        <div className="header-title-section">
          <Shield className="logo-icon" size={28} />
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.25rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
              Tactical Cognis
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              SYS.SEC.MUNITORUM // v1.0
            </span>
          </div>
        </div>

        {/* Navigation Tab Links */}
        {isDbLoadedState && (
          <nav className="nav-tabs">
            <button
              id="nav-btn-registry"
              className={`tab-btn ${view === 'dashboard' || view === 'faction' ? 'active' : ''}`}
              onClick={() => {
                if (activeFactionSlug) {
                  setView('faction');
                } else {
                  setView('dashboard');
                }
              }}
            >
              Factions Registry
            </button>
            <button
              id="nav-btn-builder"
              className={`tab-btn ${view === 'builder' ? 'active' : ''}`}
              onClick={() => setView('builder')}
            >
              Army Builder
            </button>
            <button
              id="nav-btn-analysis"
              className={`tab-btn ${view === 'analysis' ? 'active' : ''}`}
              onClick={() => setView('analysis')}
            >
              <Target size={14} /> Global Analysis
            </button>
          </nav>
        )}
      </header>

      {/* Main Content Areas */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!isDbLoadedState ? (
          <DatabaseUploadView onDbLoaded={(version) => {
            setDbVersion(version);
            setIsDbLoadedState(true);
          }} />
        ) : (
          <>
            {view === 'dashboard' && (
              <Dashboard onSelectFaction={handleSelectFaction} />
            )}

            {view === 'faction' && activeFactionSlug && (
              <FactionBrowser
                factionSlug={activeFactionSlug}
                onBack={handleBackToDashboard}
                onSelectUnit={(unit) => setActiveUnit(unit)}
                appDataVersion={dbVersion}
              />
            )}

            {view === 'builder' && (
              <ArmyBuilder
                initialFactionSlug={activeFactionSlug || undefined}
                onSelectFaction={(slug) => setActiveFactionSlug(slug)}
              />
            )}

            {view === 'analysis' && (
              <DeepAnalysis />
            )}
          </>
        )}
      </main>

      {/* Unit Detail Overlay Modal */}
      {activeUnit && (
        <UnitDetails
          key={activeUnit.slug}
          unit={activeUnit}
          onClose={() => setActiveUnit(null)}
        />
      )}

      {/* Footer bar */}
      <footer style={{ marginTop: '4rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <div>
          © Games Workshop. Unofficial companion analysis tool. Re-scraped under MFM v1.0.
        </div>
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          SEC_KEY: COMPANION_APP_DB_{dbVersion}
        </div>
      </footer>
    </div>
  );
}

export default App;
