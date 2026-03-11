const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'index.m3u');
const OUTPUT_PATH = path.join(ROOT, 'data', 'iptv-data.json');

function parseExtinfAttributes(extinfLine) {
    const attributes = {};
    const attributeRegex = /([a-zA-Z0-9-]+)="([^"]*)"/g;
    let match;
    while ((match = attributeRegex.exec(extinfLine)) !== null) {
        attributes[match[1]] = match[2];
    }
    return attributes;
}

function normalizeId(value, fallback) {
    return `${value || fallback}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
}

function preprocessIndex(m3uText) {
    const lines = m3uText.split(/\r?\n/);
    const channels = [];
    const countryCodes = new Set();
    const categoryMap = new Map();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('#EXTINF:')) continue;

        const streamUrl = (lines[i + 1] || '').trim();
        if (!streamUrl || streamUrl.startsWith('#') || !streamUrl.startsWith('http')) continue;

        const attrs = parseExtinfAttributes(line);
        const nameFromTitle = line.includes(',') ? line.split(',').slice(1).join(',').trim() : '';
        const name = attrs['tvg-name'] || nameFromTitle || 'Unknown Channel';
        const id = attrs['tvg-id'] || attrs['tvg-name'] || name || streamUrl;
        const country = (attrs['tvg-country'] || '').toUpperCase();
        const categoryName = attrs['group-title'] || 'General';

        if (country) countryCodes.add(country);
        if (!categoryMap.has(categoryName)) {
            const normalizedCategoryId = normalizeId(categoryName, 'general');
            categoryMap.set(categoryName, {
                id: normalizedCategoryId,
                name: categoryName
            });
        }

        const normalizedId = normalizeId(id, 'channel');
        channels.push({
            id: `${normalizedId}-${streamUrl}`,
            name,
            country: country || 'Unknown',
            categories: [categoryMap.get(categoryName).id],
            thumbnail: attrs['tvg-logo'] || '',
            logo: attrs['tvg-logo'] || '',
            streamUrl
        });
    }

    const countryNames = typeof Intl !== 'undefined' && Intl.DisplayNames
        ? new Intl.DisplayNames(['en'], { type: 'region' })
        : null;

    const regions = Array.from(countryCodes)
        .filter(code => code && code !== 'UNKNOWN')
        .sort((a, b) => a.localeCompare(b))
        .map(code => ({
            code,
            name: countryNames ? (countryNames.of(code) || code) : code,
            countries: [code]
        }));

    const categories = Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    channels.sort((a, b) => a.name.localeCompare(b.name));

    return {
        generatedAt: new Date().toISOString(),
        channelCount: channels.length,
        channels,
        regions,
        categories
    };
}

function main() {
    const m3uText = fs.readFileSync(INPUT_PATH, 'utf8');
    const processed = preprocessIndex(m3uText);
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(processed, null, 2));
    console.log(`Wrote ${OUTPUT_PATH} with ${processed.channelCount} channels`);
}

main();
