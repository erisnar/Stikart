// Smoke tests that run on both the desktop and mobile projects.
const { test, expect, TEST_RACE, EXPLORING_ROUTE, openRaceDeepLink, chart } = require('./fixtures');
const fs = require('fs');
const path = require('path');

// The load order is the dependency DAG — each file may only reference globals
// from files that appear before it. This test will catch accidental reorderings.
const JS_LOAD_ORDER = [
    'js/config.js',       // WORKER_URL, isTouchDevice, darkColorPool, raceCategories
    'js/races.js',        // raceRoutes
    'js/utils.js',        // slugify, haversineKm, fmtTime, formatDate, …
    'js/map.js',          // map, raceLayers, loadRace, highlightRace, regenerateColors, …
    'js/filters.js',      // applyFilters, filterByMonth, filterByCategory, filterByRouteType, …
    'js/elevation.js',    // buildElevationProfile, renderElevationChart, updateElevCursor
    'js/cursor.js',       // enableDistanceDot, enableChartMouse/Touch, dotFrozen
    'js/pace-planner.js', // calcCheckpointSplits, renderPacePlanner, openPacePlanner, …
    'js/race-panel.js',   // selectRace, showRaceDetailOverlay, closeRaceDetail, …
    'js/submission.js',   // handleRaceSubmit, openEditRaceForm, …
    'js/main.js',         // showInfoOverlay, downloadGpx, startup sequence
];

test('js/ scripts in index.html are in the correct dependency order', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const found = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
    expect(found).toEqual(JS_LOAD_ORDER);
});

test('each module exposes its key globals after page load', async ({ page }) => {
    await page.goto('/index.html');

    const checks = await page.evaluate(() => ({
        // config.js
        WORKER_URL:            typeof WORKER_URL === 'string',
        isTouchDevice:         typeof isTouchDevice === 'boolean',
        darkColorPool:         Array.isArray(darkColorPool) && darkColorPool.length > 0,
        raceCategories:        Array.isArray(raceCategories),
        routeTypes:            Array.isArray(routeTypes),
        // races.js
        raceRoutes:            Array.isArray(raceRoutes) && raceRoutes.length > 0,
        // utils.js
        slugify:               typeof slugify === 'function',
        routeQuery:            typeof routeQuery === 'function',
        routeFromSearchParams: typeof routeFromSearchParams === 'function',
        haversineKm:           typeof haversineKm === 'function',
        formatDate:            typeof formatDate === 'function',
        // map.js
        loadRace:              typeof loadRace === 'function',
        highlightRace:         typeof highlightRace === 'function',
        racePolylines:         typeof racePolylines === 'object' && racePolylines !== null,
        // filters.js
        applyFilters:          typeof applyFilters === 'function',
        filterByMonth:         typeof filterByMonth === 'function',
        filterByRouteType:     typeof filterByRouteType === 'function',
        // elevation.js
        buildElevationProfile: typeof buildElevationProfile === 'function',
        renderElevationChart:  typeof renderElevationChart === 'function',
        // cursor.js
        enableDistanceDot:     typeof enableDistanceDot === 'function',
        enableChartMouse:      typeof enableChartMouse === 'function',
        dotFrozen:             typeof dotFrozen === 'boolean',
        // pace-planner.js
        calcCheckpointSplits:  typeof calcCheckpointSplits === 'function',
        renderPacePlanner:     typeof renderPacePlanner === 'function',
        // race-panel.js
        selectRace:            typeof selectRace === 'function',
        showRaceDetailOverlay: typeof showRaceDetailOverlay === 'function',
        closeRaceDetail:       typeof closeRaceDetail === 'function',
        // submission.js
        handleRaceSubmit:      typeof handleRaceSubmit === 'function',
        openEditRaceForm:      typeof openEditRaceForm === 'function',
        // main.js
        showInfoOverlay:       typeof showInfoOverlay === 'function',
        downloadGpx:           typeof downloadGpx === 'function',
    }));

    for (const [name, ok] of Object.entries(checks)) {
        expect(ok, `${name} should be defined by its module`).toBe(true);
    }
});

test('loads without page errors and renders the race list', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/index.html');
    await expect.poll(() => page.locator('.race-item').count()).toBeGreaterThan(5);
    expect(errors).toEqual([]);
});

test('deep link ?race=<slug> opens the race detail with an elevation chart', async ({ page }) => {
    await openRaceDeepLink(page, TEST_RACE.slug);

    await expect(page.locator('#race-detail-content h3')).toContainText(TEST_RACE.name);
    await expect(chart(page)).toBeVisible();
    // The selected route is highlighted on the map
    await expect.poll(() =>
        page.evaluate(name => racePolylines[name][0].options.weight, TEST_RACE.name)
    ).toBe(5);
});

test('deep link ?exploring=<slug> opens an exploring route', async ({ page }) => {
    await page.goto(`/index.html?exploring=${EXPLORING_ROUTE.slug}`);

    await expect(page.locator('#race-detail-overlay')).toBeVisible();
    await expect(page.locator('#race-detail-content h3')).toContainText(EXPLORING_ROUTE.name);
    await expect(chart(page)).toBeVisible({ timeout: 15000 });
});
