// Cloudflare Worker for Stikart race submissions
// Deploy: wrangler deploy
// Set secret: wrangler secret put GITHUB_TOKEN
//
// env.GITHUB_TOKEN  — fine-grained PAT: Contents (write) + Pull requests (write)
// env.ALLOWED_ORIGINS — optional comma-separated list, defaults to stikart.no + localhost

const GITHUB_OWNER = 'erisnar';
const GITHUB_REPO = 'stikart';

const darkColorPool = [
    '#e63946', '#d62828', '#9b2335', '#c1121f', '#ff006e',
    '#f72585', '#b5179e', '#e91e63', '#c2185b', '#ad1457',
    '#e76f51', '#f4a261', '#fb5607', '#ff5400', '#e65100',
    '#ff6d00', '#f57c00', '#ef6c00', '#d84315', '#bf360c',
    '#8338ec', '#7209b7', '#6a1b9a', '#4a148c', '#311b92',
    '#5e35b1', '#512da8', '#4527a0', '#7c4dff', '#651fff',
    '#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#0277bd',
    '#01579b', '#023e8a', '#0353a4', '#3a86ff', '#4361ee',
    '#1b5e20', '#2e7d32', '#388e3c', '#087f5b', '#0b7285',
    '#5d4037', '#4e342e', '#6d4c41', '#795548', '#8d6e63'
];

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function distanceToCategory(km) {
    if (km < 42) return 'short-trail';
    if (km < 50) return 'marathon-trail';
    if (km < 65) return '50k';
    if (km < 130) return '50-miles';
    if (km < 160) return '100k';
    if (km < 165) return '100-miles';
    return '100-miles-plus';
}

function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64.replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

// Find the start/end positions of a race entry block by its id or name.
// Uses bracket-counting so nested objects (e.g. checkpoints) are handled correctly.
function findEntryBounds(appJs, originalId, originalName) {
    let searchPos = -1;
    const candidates = [
        `id: ${JSON.stringify(originalId)}`,          // new entries with id field
        `name: ${JSON.stringify(originalName)}`,       // legacy double-quoted name
        `name: '${originalName}'`                      // legacy single-quoted name
    ];
    for (const c of candidates) {
        const idx = appJs.indexOf(c);
        if (idx !== -1) { searchPos = idx; break; }
    }
    if (searchPos === -1) return null;

    // Scan backwards to opening {
    let depth = 0;
    let openBrace = searchPos;
    while (openBrace > 0) {
        openBrace--;
        if (appJs[openBrace] === '}') depth++;
        else if (appJs[openBrace] === '{') {
            if (depth === 0) break;
            depth--;
        }
    }

    // Include leading whitespace (the 4-space indent before {)
    let lineStart = openBrace;
    while (lineStart > 0 && appJs[lineStart - 1] !== '\n') lineStart--;

    // Scan forward to matching }
    depth = 0;
    let closeBrace = openBrace;
    while (closeBrace < appJs.length) {
        if (appJs[closeBrace] === '{') depth++;
        else if (appJs[closeBrace] === '}') { depth--; if (depth === 0) break; }
        closeBrace++;
    }

    // Consume trailing comma and newline
    let blockEnd = closeBrace + 1;
    if (blockEnd < appJs.length && appJs[blockEnd] === ',') blockEnd++;
    if (blockEnd < appJs.length && appJs[blockEnd] === '\n') blockEnd++;

    return { start: lineStart, end: blockEnd };
}

function buildRaceEntry(raceData) {
    const fields = [
        `        id: ${JSON.stringify(raceData.id)}`,
        `        name: ${JSON.stringify(raceData.name)}`,
        `        files: [${raceData.files.map(f => JSON.stringify(f)).join(', ')}]`,
        `        color: ${JSON.stringify(raceData.color)}`,
    ];
    if (raceData.url)          fields.push(`        url: ${JSON.stringify(raceData.url)}`);
    if (raceData.description)  fields.push(`        description: ${JSON.stringify(raceData.description)}`);
    if (raceData.gpxUpdated)   fields.push(`        gpxUpdated: ${JSON.stringify(raceData.gpxUpdated)}`);
    fields.push(`        useCalculatedStats: true`);
    if (raceData.manualDistance) fields.push(`        manualDistance: ${raceData.manualDistance}`);
    fields.push(`        category: ${JSON.stringify(raceData.category)}`);
    if (raceData.date)         fields.push(`        date: ${JSON.stringify(raceData.date)}`);
    return `    {\n${fields.join(',\n')}\n    }`;
}

function buildPRBody({ name, url, date, description, category, loopDistances, isEdit, originalName, submitter }) {
    const catLabels = {
        'short-trail': '< 42 km', 'marathon-trail': '42–50 km', '50k': '50 km', '50-miles': '80 km',
        '100k': '100 km', '100-miles': '100 miles (~160 km)', '100-miles-plus': '100+ miles'
    };
    const title = isEdit ? `## Endring: ${originalName}` : `## Nytt løp: ${name}`;
    const rows = [title, '', '| Felt | Verdi |', '|---|---|'];
    if (loopDistances?.length > 0) {
        loopDistances.forEach(ld => {
            rows.push(`| Distanse | ${ld.km} km (${catLabels[distanceToCategory(ld.km)] || ''}) |`);
        });
    } else {
        rows.push(`| Kategori | ${catLabels[category] || category} |`);
    }
    if (date)        rows.push(`| Dato | ${date} |`);
    if (url)         rows.push(`| Nettside | ${url} |`);
    if (description) rows.push(`| Beskrivelse | ${description} |`);
    if (submitter)   rows.push(`| Sendt inn av | ${submitter} |`);
    rows.push('', '_Sendt inn via stikart.no_');
    return rows.filter(r => r !== null).join('\n');
}

async function createRacePR(payload, token) {
    const {
        name, url, date, description, category, loopDistances,
        originalId, originalName, originalFiles, originalColor,
        gpxContent, gpxFilename
    } = payload;

    const isEdit = !!originalId;
    const slug = slugify(name);
    const branch = `${isEdit ? 'edit' : 'add'}-race/${slug}-${Date.now().toString(36)}`;
    const apiBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'stikart-worker/1.0'
    };

    async function gh(path, options = {}) {
        const res = await fetch(apiBase + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || `GitHub API ${res.status}`);
        }
        return res.json();
    }

    // 1. Create branch from main
    const mainRef = await gh('/git/ref/heads/main');
    await gh('/git/refs', {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainRef.object.sha })
    });

    // 2. Upload GPX if provided
    let filePaths = originalFiles || [];
    if (gpxContent && gpxFilename) {
        const gpxFileSlug = slugify(gpxFilename.replace(/\.gpx$/i, '')) + '.gpx';
        const gpxPath = `race-calendar/${slug}/${gpxFileSlug}`;

        // Check if a file already exists at this path on the branch (needed for update)
        let existingSha;
        try {
            const existing = await gh(`/contents/${gpxPath}?ref=${encodeURIComponent(branch)}`);
            existingSha = existing.sha;
        } catch (_) { /* new file */ }

        await gh(`/contents/${gpxPath}`, {
            method: 'PUT',
            body: JSON.stringify({
                message: `${isEdit ? 'Update' : 'Add'} GPX for ${name}`,
                content: toBase64(gpxContent),
                ...(existingSha ? { sha: existingSha } : {}),
                branch
            })
        });
        filePaths = [gpxPath];
    }

    // 3. Fetch js/races.js and build new entries
    const appJsFile = await gh(`/contents/js/races.js?ref=${encodeURIComponent(branch)}`);
    let appJs = fromBase64(appJsFile.content);

    const color = originalColor || darkColorPool[Math.floor(Math.random() * darkColorPool.length)];

    let newEntries;
    if (loopDistances?.length > 0) {
        const multi = loopDistances.length > 1;
        newEntries = loopDistances.map(ld => {
            const label = `${Math.round(ld.km)}K`;
            const fullName = multi ? `${name} ${label}` : name;
            return buildRaceEntry({
                id: slugify(fullName), name: fullName, files: filePaths,
                color: darkColorPool[Math.floor(Math.random() * darkColorPool.length)],
                url, date, description,
                manualDistance: ld.km,
                category: distanceToCategory(ld.km)
            });
        });
    } else {
        newEntries = [buildRaceEntry({
            id: isEdit ? originalId : slug,
            name, files: filePaths, color, url, date, description, category,
            gpxUpdated: gpxContent ? new Date().toISOString().substring(0, 10) : undefined
        })];
    }

    // 4. Remove old entry for edits, then prepend new entries
    if (isEdit) {
        const bounds = findEntryBounds(appJs, originalId, originalName);
        if (!bounds) throw new Error(`Fant ikke løpet "${originalName}" i js/races.js`);
        appJs = appJs.slice(0, bounds.start) + appJs.slice(bounds.end);
    }

    const marker = 'const raceRoutes = [';
    const insertAt = appJs.indexOf(marker) + marker.length;
    if (insertAt < marker.length) throw new Error('raceRoutes not found in js/races.js');
    appJs = appJs.slice(0, insertAt) + '\n' + newEntries.join(',\n') + ',' + appJs.slice(insertAt);

    // 5. Commit js/races.js
    await gh('/contents/js/races.js', {
        method: 'PUT',
        body: JSON.stringify({
            message: isEdit ? `Update race: ${name}` : `Add race: ${name}`,
            content: toBase64(appJs),
            sha: appJsFile.sha,
            branch
        })
    });

    // 6. Open PR
    const prTitle = isEdit
        ? `Update race: ${name}`
        : loopDistances?.length > 1
            ? `Add race: ${name} (${loopDistances.length} distanser)`
            : `Add race: ${name}`;

    return gh('/pulls', {
        method: 'POST',
        body: JSON.stringify({
            title: prTitle,
            body: buildPRBody({ name, url, date, description, category, loopDistances, isEdit, originalName, submitter: payload.submitter }),
            head: branch,
            base: 'main'
        })
    });
}

export default {
    async fetch(request, env) {
        const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://stikart.no,http://localhost:8000')
            .split(',').map(s => s.trim());
        const origin = request.headers.get('Origin') || '';
        const corsHeaders = {
            'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        if (!allowedOrigins.includes(origin)) {
            return new Response('Forbidden', { status: 403, headers: corsHeaders });
        }
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }
        if (!env.GITHUB_TOKEN) {
            return new Response(JSON.stringify({ error: 'Worker ikke konfigurert (mangler GITHUB_TOKEN)' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            const payload = await request.json();
            const { name, originalId, gpxContent, gpxFilename, category, loopDistances } = payload;

            const isEdit = !!originalId;
            const hasGpx = !!(gpxContent && gpxFilename);

            if (!name) {
                return new Response(JSON.stringify({ error: 'Mangler løpsnavn' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            if (!isEdit && !hasGpx) {
                return new Response(JSON.stringify({ error: 'GPX-fil er påkrevd for nye løp' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            if (!loopDistances?.length && !category) {
                return new Response(JSON.stringify({ error: 'Mangler kategori' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const pr = await createRacePR(payload, env.GITHUB_TOKEN);

            return new Response(JSON.stringify({ prNumber: pr.number, prUrl: pr.html_url }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
