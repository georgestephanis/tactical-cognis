# Dashboard (Faction Registry)

The **Dashboard** serves as the central hub of the application once a database is loaded. It displays core statistics about the active companion database and provides a filterable search grid of all playable Warhammer 40k factions.

---

## 📸 Component Reference

- **React Component:** [Dashboard.tsx](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/components/Dashboard.tsx)
- **Styling Hooks:** Styled using class definitions in [src/index.css](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/index.css) (`.panel`, `.faction-grid`, `.faction-card`, `.search-container`, `.search-input`, `.search-icon`, `.empty-state`).

---

## 🛠️ Methods & Rendering Logic

### 1. Database Initialization & Indexing
On component mount, `useEffect` triggers the asynchronous database setup:
- Confirms initialization of `/40k.sqlite` in memory.
- Calls `getDbStats()` (defined in [src/utils/db.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/utils/db.ts)) to retrieve general data counts.
- Calls `getFactionList()` to retrieve all unique faction definitions from the database and calculate the number of units and detachments associated with each.
- Resolves loading state once both metrics have finished fetching.

### 2. Search & Filtering
- Users can type a search term in the input bar.
- The component computes `filteredFactions` by checking if `fac.faction` contains the lowercase string from the search query.
- If no results match, an empty state panel is rendered displaying a database query fail warning.

---

## 🎨 Visual Design & Style Systems

The dashboard uses a grid layout styled with vanilla CSS:

| CSS Selector | Styling & Visual Effect |
| :--- | :--- |
| `.panel` | The main hero section uses an angled background gradient (`linear-gradient(135deg, rgba(22,30,54,0.9)...)`) with blurred backing halos (`var(--accent-gold-glow)`, `var(--accent-teal-glow)`) to separate metrics. |
| `.search-container` | Positioned search wrapper with an absolute-aligned search magnifying glass icon. |
| `.search-input` | Expands on focus with border-color transition to `--accent-teal` and shadow glow. |
| `.faction-grid` | Responsive grid structure using CSS Grid `repeat(auto-fill, minmax(280px, 1fr))`. |
| `.faction-card` | Interactive cards representing factions. Hover states apply translation (`translateY(-4px)`), a solid left border highlight, and box-shadow glows (`--glow-teal`). |

---

## 📊 Data Specifications

### Input Props
- `onSelectFaction: (slug: string) => void`: Callback triggered when a faction card is clicked, passing the dash-separated string slug (e.g., `'space-marines'`).

### Local State
- `factions` (Array of `FactionSummary`): A parsed array of factions including their slug, name, total unit count, and detachment count.
- `appStats` (`AppStats | null`): (The hero bar displays only Data Version, Datasheets, Miniatures, Weapons & Wargear and Active Factions; the other counts are fetched but unused.) Numerical counts of active sqlite table files, datasheets, miniatures, wargear profiles, stratagems, and enhancements.
- `searchQuery` (string): Text filter applied to the faction grid list.
- `loading` (boolean): Displays a spinning loading symbol while records compile.

### Database SQL Queries Used
- **Database counts:**
  ```sql
  SELECT count(*) as count FROM sqlite_master WHERE type='table';
  SELECT count(*) as count FROM datasheet;
  SELECT count(*) as count FROM miniature;
  SELECT count(*) as count FROM wargear_item;
  SELECT count(*) as count FROM stratagem;
  SELECT count(*) as count FROM enhancement;
  SELECT count(*) as count FROM detachment;
  SELECT dataVersion FROM metadata LIMIT 1;
  ```
- **Faction registry indexing:**
  ```sql
  SELECT DISTINCT fk.name as faction, fk.id
  FROM faction_keyword fk
  JOIN datasheet_faction_keyword dfk ON fk.id = dfk.factionKeywordId
  ORDER BY fk.name;
  ```
- **Faction unit counts query:**
  ```sql
  SELECT COUNT(DISTINCT datasheetId) as count 
  FROM datasheet_faction_keyword 
  WHERE factionKeywordId IN (<ids>);
  ```
  Detachment counts use the same shape against `detachment_faction_keyword` (`COUNT(DISTINCT detachmentId)`). Factions with no keyword ids, and meta-factions that are really sub-lists of another faction (Asuryani, Harlequins, Ynnari, the Chaos Legions entries, Heretic Astartes and similar), are filtered out of the list.

---

## 🔗 Links to Other Views

- **[Faction Browser](./faction_browser.md):** Clicking a faction card triggers `onSelectFaction(fac.slug)` which switches the active workspace view.
- **[Army Builder](./army_builder.md):** Navigation tabs at the top header allow shifting directly to the roster workspace.
- **[Deep Analysis](./deep_analysis.md):** Navigation tab at the header allows shifting to the Mathhammer Playground.
