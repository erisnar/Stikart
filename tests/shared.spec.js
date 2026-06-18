// Smoke tests that run on both the desktop and mobile projects.
const { test, expect, TEST_RACE, openRaceDeepLink, chart } = require('./fixtures');

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
