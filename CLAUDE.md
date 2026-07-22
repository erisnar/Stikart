# Stikart

Interactive map for Norwegian trail running and ultra race routes. Deployed at stikart.no via GitHub Pages.

## Running locally

```bash
python3 server.py
# Open http://localhost:8000/index.html
```

The Python server is needed to avoid CORS errors when fetching local GPX files.

## Integration tests

Playwright end-to-end tests in `tests/` — the only npm usage in the repo (dev-only; the app itself still has no build step).

```bash
npm install && npx playwright install chromium   # one-time setup
npm test            # run all tests (starts server.py automatically)
npm run test:ui     # interactive UI mode
npx playwright test --project=mobile             # mobile only
```

- Two projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7 emulation — touch events + coarse pointer, so `isTouchDevice`/`isMobile` code paths run)
- `tests/fixtures.js` blocks analytics and serves blank map tiles (offline-safe), and has helpers: `touchScrub` (real CDP touch events for chart finger-scrubbing), `expandPanel`, `openRaceDeepLink`
- Tests reference the races `nsm-ultra-2025` and `lommedalen-rundt` (`TEST_RACE`/`DESCRIBED_RACE` in fixtures) — update fixtures if those entries are ever removed
- Covered: race list/search, race selection + map highlight/dim, elevation chart mouse hover and touch scrub (cursor, km marker, freeze/lock), mobile welcome screen, minimized detail card, deep links

## Tech stack

- Vanilla JS, HTML, CSS — no build step, no framework, no npm
- [Leaflet.js](https://leafletjs.com/) 1.9.4 for the map
- [leaflet-polylinedecorator](https://github.com/bbecquet/Leaflet.PolylineDecorator) for route arrows
- Kartverket (Norgeskart) and OpenStreetMap as base layers
- GoatCounter for privacy-friendly analytics

## File structure

| File | Purpose |
|------|---------|
| `js/config.js` | Constants: `WORKER_URL`, `isTouchDevice`, `darkColorPool`, `raceCategories` |
| `js/races.js` | `raceRoutes` data array — one entry per race |
| `js/utils.js` | Pure utility functions: `slugify`, `formatDate`, `haversineKm`, `fmtTime`, `fmtPace`, etc. |
| `js/map.js` | Leaflet map init, tile layers, icons, layer state, `loadRace`/`loadRaces`, `highlightRace`, `resetRaceStyles`, `regenerateColors`, race picker popup, custom layer control |
| `js/filters.js` | Filter state and functions: `applyFilters`, `filterByMonth`, `filterByCategory`, `filterBySearch`, `clearSearch` |
| `js/elevation.js` | `buildElevationProfile`, `renderElevationChart`, `updateElevCursor` |
| `js/cursor.js` | Shared cursor state (`dotFrozen`, `chartTouchMarker`), `enableDistanceDot`/`disableDistanceDot`, `enableChartMouse`/`enableChartTouch`, `minimizeDetail`/`expandDetail` |
| `js/pace-planner.js` | Pace math (`gradeFactor`, `fatiguedArrival`, `calcCheckpointSplits`), `renderPacePlanner`, `openPacePlanner`/`closePacePlanner`/`updatePacePlanner`, `zoomToCheckpoint` |
| `js/race-panel.js` | Race list panel, race detail overlay, `selectRace`, `showRaceDetailOverlay`, `closeRaceDetail`, `shareRace`, `changeRaceColor`; extends `applyFilters` and `regenerateColors` |
| `js/submission.js` | Race submit/edit form: `showSubmitRaceForm`, `openEditRaceForm`, `handleRaceSubmit`, `parseGPXForStats` |
| `js/main.js` | Entry point: `showInfoOverlay`, `downloadGpx`, startup sequence (`regenerateColors`, URL params, initial `loadRace`/`loadRaces`) |
| `gpx-parser.js` | Parses GPX XML → GeoJSON; Haversine distance + elevation gain; extracts `<wpt>` waypoints |
| `index.html` | Shell: map div, filter bar, panels, overlays |
| `style.css` | All styles |
| `server.py` | Local dev server |
| `worker.js` | Cloudflare Worker — handles race submission/edit PRs server-side (holds GitHub PAT) |
| `wrangler.toml` | Cloudflare Worker config |
| `race-calendar/` | GPX files, one folder per race |
| `.github/workflows/validate-race.yml` | CI: validates GPX and auto-merges valid race PRs |

Scripts load in order: `config → races → utils → map → filters → elevation → cursor → pace-planner → race-panel → submission → main`. Each file can reference globals from earlier files; forward references (e.g. `selectRace` called from `loadRace`) work because they're only resolved at call time, not definition time.

## Race entry format

Each entry in the `raceRoutes` array in `js/races.js`:

```javascript
{
    id: 'race-slug',            // slugified name — used by worker to find/replace entry on edit
    name: 'Race Name',
    files: ['race-calendar/RaceName/route.gpx'],
    color: '#e63946',
    url: 'https://race-website.no/',
    useCalculatedStats: true,   // must be true to build elevation profile and auto-splits
    gpxUpdated: '2026-05-18',   // date GPX was last committed — update when file changes
    category: '50k',
    date: '2026-08-15'          // next race date, YYYY-MM-DD
}
```

Optional fields:

```javascript
manualDistance: 100,    // km — overrides GPX-calculated distance (required for loop races)
gpxYear: 2025,          // shown as a warning label if GPX is from a prior year
description: 'Text',    // shown in the race detail popup; set via submission form
routeType: 'exploring', // 'race' or 'exploring' — defaults to 'race' when omitted
```

**Checkpoints are not stored in js/races.js entries.** They are loaded at runtime in `loadRace`:
1. From `<wpt>` waypoint elements in the GPX file — preferred, set by the race organizer
2. Auto-generated at 25/50/75% of race distance if no waypoints found

Races using auto-splits show a small italic note above the pace planner (`race.autoCheckpoints === true`).

Checkpoints power: elevation profile marker lines, pace planner split table, and map dot markers when a race is active.

## Distance categories

| Category value | Distance |
|---|---|
| `short-trail` | < 42K |
| `marathon-trail` | 42–50 km |
| `50k` | 50–65 km |
| `50-miles` | 65–130 km |
| `100k` | 130–160 km |
| `100-miles` | 160–500 km |
| `100-miles-plus` | > 500 km |

## GPX conventions

- Use track files (`<trk>`), not route or waypoint files — the CI validator requires `<trkpt>` elements
- Include `<ele>` elevation data — powers the elevation profile and pace planner
- Add `<wpt>` elements for aid stations — they become pace planner checkpoint splits automatically
- Multi-segment races: list GPX files in order under `files`
- Prefer official organizer GPX over Strava exports (Strava recordings can have 40K+ points)
- After replacing a GPX file, update `gpxUpdated` in the race entry to today's date

**Parser behavior (`gpx-parser.js`):** supports both `<trkpt>` (track) and `<rtept>` (route) formats — falls back to `<rtept>` if no track points found. Dense recordings are automatically downsampled to ≤ 3000 points for rendering performance; the full file is still downloaded by the browser.

## Loop races

For races where the GPX contains only one loop, set `manualDistance` to the full race distance. This overrides the GPX-calculated distance for display and category detection. Multiple distances of the same loop (e.g. 50K and 100K) each need a separate entry pointing to the same GPX file. The submission form handles this automatically with a multi-distance list when GPX distance < 10 km, pre-filled with the parsed GPX distance on the assumption of a single loop.

## Mobile UI notes

- Race detail overlay starts **minimized** on mobile (shows title + elevation chart only)
- `.race-description` and `.race-popup-details` are both hidden in the minimized state — keep this in mind when adding new content to the race detail: add a corresponding `minimized` hide rule in CSS if needed
- Elevation chart touch interaction (`enableChartTouch`) requires `useCalculatedStats: true` and elevation data — it attaches `touch-action: none` to the SVG so touch doesn't scroll the card
- Pace planner on mobile opens a full-screen overlay (`pace-overlay`); on desktop it is an inline `<details>` section, collapsed by default

## Key features (for context when editing)

- **Elevation profile** — drawn from GPX `<ele>` data; interactive cursor synced to map; `raceChartMeta[raceName]` holds viewport metadata used by the touch/mouse handlers
- **Pace planner** — checkpoint splits based on estimated finish time + fatigue model (`gradeFactor`, `fatiguedArrival` ~line 950); collapsed by default behind a chevron toggle (`pace-section-toggle`)
- **Distance dot** — hover/click on map to show nearest km along active route (desktop only)
- **Race panel** — slide-up list on mobile; sidebar on desktop; search + filter by month/category
- **Color regeneration** — Fisher-Yates shuffle over `darkColorPool`; unique colors per race
- **Deep linking** — `?race=<slug>` opens a race directly on load
- **GPX date** — `gpxUpdated` shown inline next to the GPX download link in italic

## Race submission form

Users submit new races and propose edits via "Mangler det et løp?" in the info overlay.

**New race flow:**
1. User uploads GPX → client parses distance/elevation/waypoints client-side
2. If GPX < 10 km: loop course detected → multi-distance list appears (each distance creates a separate entry), pre-filled with the parsed distance
3. Client POSTs to the Cloudflare Worker
4. Worker: creates branch → uploads GPX → inserts entry/entries into `raceRoutes` → opens PR
5. GitHub Actions validates and auto-merges

**Edit flow:** "Foreslå endring" button in every race detail popup. Pre-fills the form. Worker locates the entry by `id` field (falls back to name search for legacy entries without `id`), removes it, and inserts the updated entry at the top of `raceRoutes` in `js/races.js`.

**Honeypot:** hidden `#race-hp` input — if non-empty on submit, request is silently dropped.

## Cloudflare Worker

- **URL config**: `WORKER_URL` constant in `js/config.js`
- **Deploy**: `wrangler deploy` from the repo root
- **Secret**: `wrangler secret put GITHUB_TOKEN` — fine-grained PAT: `Contents: write` + `Pull requests: write` on this repo
- **CORS**: origin-checked against `ALLOWED_ORIGINS` env var (default: `https://stikart.no,http://localhost:8000`)

## GitHub Actions

**`validate-race.yml`** — triggers on `add-race/*` and `edit-race/*` PR branches:
- Validates GPX has `<trkpt>` track points and total distance ≥ 10 km
- Loop race exception: if GPX < 10 km, checks `manualDistance` in the `js/races.js` diff instead
- Comments result on the PR; squash-merges and deletes branch on pass

## Updating `gpxUpdated` for all races

After bulk GPX changes, re-stamp all entries from git history (run from repo root):

```bash
node << 'EOF'
const fs = require('fs'), { execSync } = require('child_process');
let src = fs.readFileSync('js/races.js', 'utf8'), count = 0;
src = src.replace(/(        files: \[[\s\S]*?\],)(\n        (?!gpxUpdated))/g, (m, filesBlock, nextLine) => {
    const paths = [...filesBlock.matchAll(/['"]([^'"]+\.gpx)['"]/g)].map(m => m[1]);
    const dates = paths.map(p => { try { return execSync(`git log -1 --format="%aI" -- "${p}"`).toString().trim().substring(0,10); } catch { return null; } }).filter(Boolean).sort();
    const latest = dates.pop();
    if (!latest) return m;
    count++;
    return filesBlock + `\n        gpxUpdated: '${latest}',` + nextLine;
});
fs.writeFileSync('js/races.js', src);
console.log(`Stamped ${count} entries`);
EOF
```

## Deployment

GitHub Pages from `main` branch. Custom domain via `CNAME` (stikart.no). Push to main → live immediately.
