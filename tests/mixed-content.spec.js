const { test, expect } = require('@playwright/test');

test.describe('Mixed content handling', () => {
    test('keeps http stream URL when app is served over http', async ({ page }) => {
        const testChannel = {
            id: 'test-http-channel',
            name: 'HTTP Channel',
            country: 'IN',
            categories: ['news'],
            thumbnail: '',
            logo: '',
            streamUrl: 'http://iptvcasomsapi.jprdigital.in/x-media/C0575/master.m3u8'
        };

        await page.route('**/data/iptv-data.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    generatedAt: '2026-03-11T00:00:00.000Z',
                    channelCount: 1,
                    channels: [testChannel],
                    regions: [],
                    categories: [{ id: 'news', name: 'News' }]
                })
            });
        });

        await page.goto('/');
        await expect(page.locator('.channel-card')).toHaveCount(1);

        await page.evaluate(() => {
            class MockHls {
                static isSupported() { return true; }
                static Events = {
                    MANIFEST_PARSED: 'manifestParsed',
                    FRAG_BUFFERED: 'fragBuffered',
                    BUFFER_STALLED: 'bufferStalled',
                    ERROR: 'error'
                };
                static ErrorTypes = {
                    NETWORK_ERROR: 'networkError',
                    MEDIA_ERROR: 'mediaError'
                };

                constructor() {
                    this.handlers = {};
                }

                loadSource(url) {
                    window.__lastLoadedHlsSource = url;
                }

                attachMedia() { }
                destroy() { }
                startLoad() { }
                recoverMediaError() { }

                on(event, callback) {
                    this.handlers[event] = callback;
                    if (event === MockHls.Events.MANIFEST_PARSED) {
                        setTimeout(() => callback(), 0);
                    }
                }
            }

            window.Hls = MockHls;
        });

        await page.locator('.channel-card .channel-name').first().click();
        await expect(page.locator('#player-modal')).toBeVisible();

        await expect.poll(async () => page.evaluate(() => window.__lastLoadedHlsSource)).toBe(
            'http://iptvcasomsapi.jprdigital.in/x-media/C0575/master.m3u8'
        );
    });
});
