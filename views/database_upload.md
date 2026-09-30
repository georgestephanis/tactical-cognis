# Database Upload View

The **Database Upload View** is the initial gatekeeper screen for the application. If `App.tsx`'s `initDatabase()` cannot fetch `/40k.sqlite` (a non-OK response, or an HTML fallback page from the server), the application blocks regular dashboard tabs and prompts the user to supply their own database backup.

---

## 📸 Component Reference

- **React Component:** [DatabaseUploadView.tsx](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/components/DatabaseUploadView.tsx)
- **Styling Hooks:** Defined under `DATABASE UPLOAD SCREEN - TACTICAL COGNIS THEME` in [src/index.css](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/index.css)

---

## 🛠️ Methods & Rendering Logic

### 1. Drag & Drop File Hooking
The component uses standard HTML5 drag-and-drop event listeners to handle local files:
- `handleDrag`: Toggles `dragActive` state (`true` on `dragenter`/`dragover`, `false` on `dragleave`) to apply visual hover highlights to the dropzone.
- `handleDrop` & `handleFileInput`: Extracts the first item from `e.dataTransfer.files` or `e.target.files` and passes it to the asynchronous processor `processFile(file)`.

### 2. Processing & Integrity Checks
The `processFile(file)` function runs the following asynchronous validation pipeline:
- **Sanity check:** Reads the first 15 bytes of the file using `Uint8Array.slice(0, 15)` and decodes them with `TextDecoder`. If the header does not start with `"SQLite format 3"`, it aborts with a formatting error.
- **WASM Database Mount:** Initializes the SQL.js database engine inside browser memory via `initDatabaseFromBuffer(uint8)` (defined in [src/utils/db.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/src/utils/db.ts)).
- **Content Verification:** Queries `getDbStats()`. If the result indicates zero records inside the `datasheet` table, it rejects the file as not containing Warhammer 40k companion schemas.
- **Success Handshake:** On validation, it triggers the parent callback `onDbLoaded(stats.dataVersion)`, which updates the top-level app state to unlocked.

---

## 🎨 Visual Design & Style Systems

The UI uses a dark cybernetic aesthetic styled using pure CSS variables:

| CSS Selector | Styling & Visual Effect |
| :--- | :--- |
| `.db-upload-screen` | Centered layout featuring a background grid (`linear-gradient` mask) simulating a head-up radar display. |
| `.db-upload-card` | Glassmorphic panel with `backdrop-filter: blur(20px)`, rounded borders, and golden corner brackets (`::before` / `::after`). |
| `.db-upload-icon-header` | Pulsing circular radar aura (`pulseGlow` animation) surrounding the shield icon. |
| `.db-upload-dropzone` | Cyber-dashed border box that highlights in teal (`#00f2fe`) on hover or active file drag. |
| `.cloud-icon` | Upload arrow with a floating transition (`bounceTeal`) when active. |
| `.file-upload-btn` | Interactive outline button that fills in teal with a soft box shadow. |
| `.db-upload-instructions` | Dark console command window (`rgba(5,7,12,0.95)`, gold top border) holding the macOS `find` + `sqlite3 .backup` steps for extracting the companion-app `db.sqlite`; with monospace instructions, a terminal nameplate header, and deep terminal command code blocks. |

---

## 📊 Data Specifications

### Input Props
- `onDbLoaded: (version: number) => void`: Callback triggered on successful parsing, passing the integer companion app database version number.

### Local State
- `dragActive` (boolean): Controls whether the dropzone borders highlight in active state.
- `loading` (boolean): Toggles loading spinners and hides file inputs.
- `error` (string | null): Displays validation alerts if the SQLite header or schemas are invalid.
- `success` (boolean): Triggers a checkmark confirmation alert.

---

## 🔗 Links to Other Views

- **[Dashboard](./dashboard.md):** Replaces this view automatically 1 second after `onDbLoaded` triggers successfully.
