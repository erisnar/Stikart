const { test, expect, TEST_RACE, openRaceDeepLink } = require('./fixtures');

// Cross-origin fetch triggers a CORS preflight (OPTIONS) before the POST.
// We must handle both so the browser doesn't block the actual request.
const WORKER_PATTERN = /stikart-submit\.stikart\.workers\.dev/;
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': 'http://localhost:8000',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
const FAKE_PR = { prNumber: 99, prUrl: 'https://github.com/erisnar/stikart/pull/99' };

async function routeWorker(page, { status = 200, body }, onPost) {
    await page.route(WORKER_PATTERN, async route => {
        if (route.request().method() === 'OPTIONS') {
            return route.fulfill({ status: 204, headers: CORS_HEADERS });
        }
        if (onPost) onPost(route.request());
        return route.fulfill({
            status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    });
}

async function openEditForm(page) {
    await openRaceDeepLink(page);
    await page.locator('.race-edit-btn').click();
    await expect(page.locator('#info-submit-panel')).toBeVisible();
}

test('edit form pre-fills race name and shows edit hint', async ({ page }) => {
    await openEditForm(page);

    await expect(page.locator('#submit-form-title')).toContainText('Foreslå endring');
    await expect(page.locator('#race-name-input')).toHaveValue(TEST_RACE.name);
    await expect(page.locator('#gpx-edit-hint')).toBeVisible();
    await expect(page.locator('#submit-race-btn')).toContainText('Send inn endring');
});

test('edit without GPX submits successfully and shows PR link', async ({ page }) => {
    await routeWorker(page, { body: FAKE_PR });

    await openEditForm(page);
    await page.locator('#submit-race-btn').click();

    await expect(page.locator('#submit-race-success')).toBeVisible();
    await expect(page.locator('#submit-race-success')).toContainText('PR #99');
    await expect(page.locator('#submit-race-error')).not.toBeVisible();
});

test('edit without GPX sends original category to worker', async ({ page }) => {
    let payload;
    await routeWorker(page, { body: FAKE_PR }, req => {
        payload = JSON.parse(req.postData());
    });

    await openEditForm(page);

    const expectedCategory = await page.evaluate(
        name => (raceRoutes.find(r => r.name === name) || {}).category,
        TEST_RACE.name
    );

    await page.locator('#submit-race-btn').click();
    await expect(page.locator('#submit-race-success')).toBeVisible();

    expect(payload.category).toBe(expectedCategory);
    expect(payload.originalId).toBeTruthy();
    expect(payload.gpxContent).toBeUndefined();
});

test('worker error is shown to user', async ({ page }) => {
    await routeWorker(page, { status: 500, body: { error: 'GitHub API 422' } });

    await openEditForm(page);
    await page.locator('#submit-race-btn').click();

    await expect(page.locator('#submit-race-error')).toBeVisible();
    await expect(page.locator('#submit-race-error')).toContainText('GitHub API 422');
    await expect(page.locator('#submit-race-success')).not.toBeVisible();
});
