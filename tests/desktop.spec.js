const {
    test, expect, TEST_RACE, EXPLORING_ROUTE,
    openRaceDeepLink, chart, expandPanel, kmTooltip, hoverChart, cursorX,
} = require('./fixtures');

test('selecting a race from the list highlights it and dims the others', async ({ page }) => {
    await page.goto('/index.html');
    await expandPanel(page);
    await page.locator('#search-input').fill('NSM');
    await page.locator(`.race-item[data-race="${TEST_RACE.name}"]`).click();

    await expect(page.locator('#race-detail-overlay')).toBeVisible();
    await expect(page.locator('#race-detail-content h3')).toContainText(TEST_RACE.name);
    await expect(page).toHaveURL(new RegExp(`race=${TEST_RACE.slug}`));
    await expect(page.locator(`.race-item[data-race="${TEST_RACE.name}"]`)).toHaveClass(/selected/);

    // Selected polyline is emphasized, every other loaded race is dimmed
    await expect.poll(() => page.evaluate(name => {
        const selected = racePolylines[name][0].options;
        const others = Object.entries(racePolylines)
            .filter(([n, pls]) => n !== name && pls.length > 0)
            .map(([, pls]) => pls[0].options);
        return {
            selected: { weight: selected.weight, opacity: selected.opacity },
            othersDimmed: others.length > 0 && others.every(o => o.opacity === 0.15),
        };
    }, TEST_RACE.name), { timeout: 15000 }).toEqual({
        selected: { weight: 5, opacity: 1 },
        othersDimmed: true,
    });
});

test('hovering the elevation chart moves the cursor and shows a km marker on the map', async ({ page }) => {
    await openRaceDeepLink(page);

    await hoverChart(page, 0.3);
    await expect(page.locator('#elev-cursor')).toHaveAttribute('opacity', '0.5');
    await expect(page.locator('#elev-dot')).toHaveAttribute('opacity', '1');
    await expect(kmTooltip(page)).toBeVisible();
    const xLeft = await cursorX(page);

    await hoverChart(page, 0.7);
    const xRight = await cursorX(page);
    expect(xRight).toBeGreaterThan(xLeft);

    // Leaving the chart hides cursor and marker again (raw move — the detail
    // card overlays the map, so locator.hover() would be intercepted)
    await page.mouse.move(5, 5);
    await expect(page.locator('#elev-cursor')).toHaveAttribute('opacity', '0');
    await expect(kmTooltip(page)).toHaveCount(0);
});

test('clicking the elevation chart freezes the cursor, clicking again releases it', async ({ page }) => {
    await openRaceDeepLink(page);

    await hoverChart(page, 0.5);
    await chart(page).click({ position: await chartPos(page, 0.5) });
    expect(await page.evaluate(() => dotFrozen)).toBe(true);
    const frozenX = await cursorX(page);

    // Frozen: moving the mouse must not move the cursor
    await hoverChart(page, 0.8);
    expect(await cursorX(page)).toBe(frozenX);

    await chart(page).click({ position: await chartPos(page, 0.5) });
    expect(await page.evaluate(() => dotFrozen)).toBe(false);
    await expect(page.locator('#elev-cursor')).toHaveAttribute('opacity', '0');
});

test('clicking a route on the map opens its race detail', async ({ page }) => {
    await page.goto('/index.html');
    await expect.poll(() =>
        page.evaluate(name => (racePolylines[name] || []).length, TEST_RACE.name),
        { timeout: 15000 }
    ).toBeGreaterThan(0);

    // Fire the click directly on the transparent hit-area polyline rather than
    // using screen coordinates. Leaflet async tile ops between panTo and the
    // actual mouse event can shift the canvas under parallel load, causing
    // sub-pixel misses against the 50px hit area.
    await page.evaluate(name => {
        const hitArea = hitAreaPolylines[name][0];
        const latlngs = hitArea.getLatLngs();
        const ll = latlngs[Math.floor(latlngs.length / 2)];
        map.panTo(ll, { animate: false });
        hitArea.fire('click', { latlng: ll });
    }, TEST_RACE.name);

    // Overlapping routes open a picker popup instead of selecting directly
    const overlay = page.locator('#race-detail-overlay');
    const picker = page.locator('.race-picker-popup');
    await expect(overlay.or(picker).first()).toBeVisible();
    if (await picker.isVisible()) {
        await picker.locator('.race-picker-item', { hasText: TEST_RACE.name }).click();
    }
    await expect(overlay).toBeVisible();
    await expect(page.locator('#race-detail-content h3')).toContainText(TEST_RACE.name);
});

test('search filters the race list', async ({ page }) => {
    await page.goto('/index.html');
    await expandPanel(page);
    await expect.poll(() => page.locator('.race-item').count()).toBeGreaterThan(5);
    const totalRaces = await page.locator('.race-item').count();

    await page.locator('#search-input').fill('lommedalen');
    await expect(page.locator('.race-item').first()).toContainText('Lommedalen');
    const filtered = await page.locator('.race-item').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(totalRaces);

    await page.locator('#search-clear-btn').click();
    await expect(page.locator('.race-item')).toHaveCount(totalRaces);
});

test('route type filter separates exploring routes from official races', async ({ page }) => {
    await page.goto('/index.html');
    await expandPanel(page);
    await expect.poll(() => page.locator('.race-item').count()).toBeGreaterThan(5);

    await page.locator('#route-type-select').selectOption('exploring');
    const existingExploringCount = await page.locator('.race-item').count();

    const exploringName = await page.evaluate(() => {
        const officialRace = raceRoutes.find(race => (race.routeType || 'race') === 'race');
        officialRace.routeType = 'exploring';
        renderRaceList();
        return officialRace.name;
    });

    await expect(page.locator('.race-item')).toHaveCount(existingExploringCount + 1);
    await expect(page.locator(`.race-item[data-race="${exploringName}"]`)).toHaveCount(1);

    await page.locator('#route-type-select').selectOption('race');
    await expect(page.locator(`.race-item[data-race="${exploringName}"]`)).toHaveCount(0);
    await expect.poll(() => page.locator('.race-item').count()).toBeGreaterThan(5);
});

test('selecting an exploring route uses the exploring URL parameter', async ({ page }) => {
    await page.goto('/index.html');
    await expandPanel(page);
    await page.locator('#route-type-select').selectOption('exploring');
    await page.locator(`.race-item[data-race="${EXPLORING_ROUTE.name}"]`).click();

    await expect(page.locator('#race-detail-overlay')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`exploring=${EXPLORING_ROUTE.slug}`));
});

test('GPX download button downloads a .gpx file', async ({ page }) => {
    const minimalGpx = '<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="0" lon="0"><ele>0</ele></trkpt></trkseg></trk></gpx>';
    await page.route(/raw\.githubusercontent\.com/, route =>
        route.fulfill({ contentType: 'application/gpx+xml', body: minimalGpx }));

    await openRaceDeepLink(page);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.race-download-link').first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.gpx$/);
});

// Position within the chart element at a horizontal fraction, for click().
async function chartPos(page, relX) {
    const box = await chart(page).boundingBox();
    return { x: box.width * relX, y: box.height / 2 };
}
