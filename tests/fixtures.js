const { test: base, expect } = require('@playwright/test');

// 1×1 transparent PNG served instead of real map tiles — keeps tests fast,
// offline-friendly and deterministic. Leaflet itself still loads from unpkg.
const BLANK_TILE = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

const test = base.extend({
    page: async ({ page }, use) => {
        await page.route(/gc\.zgo\.at|goatcounter\.com/, route => route.abort());
        await page.route(/tile\.openstreetmap\.org|cache\.kartverket\.no/, route =>
            route.fulfill({ contentType: 'image/png', body: BLANK_TILE }));
        await use(page);
    },
});

// Stable single-file race with elevation data and useCalculatedStats — used by
// most tests. If it is ever removed from raceRoutes, point this at another one.
const TEST_RACE = { name: 'NSM Ultra 2025', slug: 'nsm-ultra-2025' };

const EXPLORING_ROUTE = {
    name: 'Rundvannsåsen - Bjerringåsen - Haukåsen',
    slug: 'rundvannsaasen-bjerringaasen-haukaasen',
};

// Race with a `description` field, used to verify the minimized mobile state.
const DESCRIBED_RACE = { name: 'Lommedalen Rundt', slug: 'lommedalen-rundt' };

async function openRaceDeepLink(page, slug = TEST_RACE.slug) {
    await page.goto(`/index.html?race=${slug}`);
    await expect(page.locator('#race-detail-overlay')).toBeVisible();
    await expect(page.locator('#race-detail-content .elevation-chart')).toBeVisible({ timeout: 15000 });
}

function chart(page) {
    return page.locator('#race-detail-content .elevation-chart');
}

// The race panel starts collapsed (only the 38px handle visible) on both
// desktop and mobile — expand it before interacting with search or the list.
async function expandPanel(page) {
    await page.locator('#panel-handle').click();
    await expect(page.locator('#race-panel')).toHaveClass(/expanded/);
}

// The km tooltip of the chart cursor marker. `.distance-dot-tooltip` is shared
// with the map-hover distance dot, which can leave an empty stale tooltip —
// filter on content to get the live one.
function kmTooltip(page) {
    return page.locator('.distance-dot-tooltip').filter({ hasText: 'km' });
}

// Move the mouse to a horizontal fraction of the elevation chart (desktop).
async function hoverChart(page, relX) {
    const box = await chart(page).boundingBox();
    await page.mouse.move(box.x + box.width * relX, box.y + box.height / 2);
}

// Scrub a finger across a locator using real CDP touch events (Chromium only).
async function touchScrub(page, locator, fromRel, toRel, steps = 12) {
    const box = await locator.boundingBox();
    const y = box.y + box.height / 2;
    const xAt = rel => box.x + box.width * rel;
    const cdp = await page.context().newCDPSession(page);
    try {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart', touchPoints: [{ x: xAt(fromRel), y }],
        });
        for (let i = 1; i <= steps; i++) {
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: xAt(fromRel + (toRel - fromRel) * (i / steps)), y }],
            });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
        await cdp.detach();
    }
}

async function cursorX(page) {
    return parseFloat(await page.locator('#elev-cursor').getAttribute('x1'));
}

module.exports = {
    test, expect,
    TEST_RACE, EXPLORING_ROUTE, DESCRIBED_RACE,
    openRaceDeepLink, chart, expandPanel, kmTooltip, hoverChart, touchScrub, cursorX,
};
