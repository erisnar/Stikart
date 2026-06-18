# Stikart - Trail Running Map

Interactive map for discovering trail running and ultra race routes in Norway. Live at [stikart.no](https://stikart.no).

## Features

- ~50 Norwegian trail and ultra races with GPX routes on an interactive Leaflet map
- Elevation profiles with interactive cursor and pace planner with checkpoint splits
- Filter by month, distance category, or search by name
- GPX download for every race
- Submit new races or propose edits via a built-in form (Cloudflare Worker → GitHub PR → auto-merge)

## Running locally

```bash
python3 server.py
# Open http://localhost:8000/index.html
```

The Python server is needed to avoid CORS errors when fetching local GPX files.

## Adding races

The preferred way is through the submission form on the site ("Mangler det et løp?"). This opens a GitHub PR that is auto-validated and merged.

To add directly:

1. Create a folder under `race-calendar/` and add the GPX file
2. Add an entry to `raceRoutes` in `js/races.js` — see the race entry format in [CLAUDE.md](CLAUDE.md)
3. Run the `gpxUpdated` stamping script from CLAUDE.md if adding multiple files at once

## Integration tests

Playwright end-to-end tests in `tests/`:

```bash
npm install && npx playwright install chromium   # one-time setup
npm test
```

## Tech stack

- Vanilla JS, HTML, CSS — no build step, no framework
- [Leaflet.js](https://leafletjs.com/) 1.9.4
- [Kartverket](https://www.kartverket.no/) and OpenStreetMap base layers
- Cloudflare Worker for race submissions (writes to GitHub via API)
- GitHub Actions for GPX validation and auto-merge
- GitHub Pages for hosting, GoatCounter for privacy-friendly analytics

See [CLAUDE.md](CLAUDE.md) for full technical documentation.
