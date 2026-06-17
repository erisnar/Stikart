const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:8000',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'python3 server.py',
        url: 'http://localhost:8000/index.html',
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'desktop',
            testMatch: /(desktop|shared)\.spec\.js/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            // Pixel 7 emulation: touch events, coarse pointer, mobile viewport —
            // makes app.js isTouchDevice/isMobile take the mobile code paths.
            name: 'mobile',
            testMatch: /(mobile|shared)\.spec\.js/,
            use: { ...devices['Pixel 7'] },
        },
    ],
});
