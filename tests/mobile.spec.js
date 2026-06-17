// Runs on the Pixel 7 project: touch events, coarse pointer, 412px viewport.
const {
    test, expect, TEST_RACE, DESCRIBED_RACE,
    openRaceDeepLink, chart, kmTooltip, touchScrub, cursorX,
} = require('./fixtures');

test('shows the welcome screen and opens the race list from it', async ({ page }) => {
    await page.goto('/index.html');

    const welcome = page.locator('#mobile-welcome');
    await expect(welcome).toBeVisible();
    await page.getByRole('button', { name: 'Velg løp fra listen' }).tap();
    await expect(welcome).toBeHidden();
    await expect(page.locator('#race-panel')).toHaveClass(/expanded/);
});

test('deep link skips the welcome screen', async ({ page }) => {
    await openRaceDeepLink(page);
    await expect(page.locator('#mobile-welcome')).toBeHidden();
});

test('tapping a race opens the detail minimized: title + chart, description hidden', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Velg løp fra listen' }).tap();
    await page.locator('#search-input').fill('Lommedalen');
    await page.locator(`.race-item[data-race="${DESCRIBED_RACE.name}"]`).tap();

    const overlay = page.locator('#race-detail-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveClass(/minimized/);
    await expect(page.locator('#race-detail-content h3')).toContainText(DESCRIBED_RACE.name);
    await expect(chart(page)).toBeVisible({ timeout: 15000 });
    // Minimized state hides the description and the race panel behind the card
    await expect(page.locator('.race-description')).toBeHidden();
    await expect(page.locator('#race-panel')).toBeHidden();
});

test('expanding the detail card reveals the description', async ({ page }) => {
    await openRaceDeepLink(page, DESCRIBED_RACE.slug);
    const overlay = page.locator('#race-detail-overlay');
    await expect(overlay).toHaveClass(/minimized/);

    await page.locator('#minimize-detail').tap();
    await expect(overlay).not.toHaveClass(/minimized/);
    await expect(page.locator('.race-description')).toBeVisible();
});

test('scrubbing a finger across the elevation chart moves the cursor and locks on release', async ({ page }) => {
    await openRaceDeepLink(page);
    const svg = chart(page);

    // Touch mode must be active: interactive class + touch-action none so the
    // scrub does not scroll the card
    await expect(svg).toHaveClass(/chart-interactive/);
    expect(await svg.evaluate(el => getComputedStyle(el).touchAction)).toBe('none');

    await touchScrub(page, svg, 0.3, 0.8);

    // Cursor and map km-marker visible, position near the right side of the chart
    await expect(page.locator('#elev-cursor')).toHaveAttribute('opacity', '0.5');
    await expect(kmTooltip(page)).toBeVisible();
    expect(await cursorX(page)).toBeGreaterThan(150);

    // Releasing after a scrub locks the position (orange marker)
    expect(await page.evaluate(() => dotFrozen)).toBe(true);
    expect(await page.evaluate(() => chartTouchMarker.options.color)).toBe('#e67e22');
});

test('tapping the chart moves the locked cursor to the tapped position', async ({ page }) => {
    await openRaceDeepLink(page);
    const svg = chart(page);

    await touchScrub(page, svg, 0.3, 0.8);
    const lockedX = await cursorX(page);

    const box = await svg.boundingBox();
    await svg.tap({ position: { x: box.width * 0.4, y: box.height / 2 } });

    await expect.poll(() => cursorX(page)).toBeLessThan(lockedX);
    expect(await page.evaluate(() => dotFrozen)).toBe(true);
});

test('selecting a race highlights only that route on the map', async ({ page }) => {
    await openRaceDeepLink(page);

    await expect.poll(() => page.evaluate(name => {
        const pl = racePolylines[name][0].options;
        return { weight: pl.weight, opacity: pl.opacity };
    }, TEST_RACE.name)).toEqual({ weight: 5, opacity: 1 });
});
