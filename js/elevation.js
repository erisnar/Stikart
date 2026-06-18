function buildElevationProfile(coords, offsetKm) {
    const points = [];
    let cumKm = offsetKm || 0;
    for (let i = 0; i < coords.length; i++) {
        if (i > 0) cumKm += haversineKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
        if (coords[i][2] !== null && coords[i][2] !== undefined) {
            points.push({ km: cumKm, ele: coords[i][2] });
        }
    }
    return { points, totalKm: cumKm };
}

function renderElevationChart(elevPoints, color, raceName, checkpoints) {
    if (!elevPoints || elevPoints.length < 2) return '';

    const n = Math.min(elevPoints.length, 250);
    const step = (elevPoints.length - 1) / (n - 1);
    const sampled = Array.from({ length: n }, (_, i) => elevPoints[Math.round(i * step)]);

    const totalKm = sampled[sampled.length - 1].km;
    if (!totalKm) return '';

    const eles = sampled.map(p => p.ele);
    const minEle = Math.min(...eles);
    const maxEle = Math.max(...eles);
    const eleRange = maxEle - minEle || 1;

    if (raceName) raceChartMeta[raceName] = { totalKm, minEle, eleRange };

    const W = 300, H = 64;
    const padL = 36, padR = 4, padT = 4, padB = 16;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const toX = km => padL + (km / totalKm) * chartW;
    const toY = ele => padT + (1 - (ele - minEle) / eleRange) * chartH;

    const pts = sampled.map(p => `${toX(p.km).toFixed(1)},${toY(p.ele).toFixed(1)}`);
    const bottom = (padT + chartH).toFixed(1);
    const pathD = `M ${pts.join(' L ')} L ${toX(totalKm).toFixed(1)},${bottom} L ${padL},${bottom} Z`;

    const cpLines = resolveCheckpoints(checkpoints, raceName)
        .filter(cp => cp.km > 0)
        .map(cp => {
            const x = Math.min(toX(cp.km), padL + chartW).toFixed(1);
            const base = padT + chartH;
            return `<line x1="${x}" y1="${padT + 4}" x2="${x}" y2="${base}" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
                    <line x1="${x}" y1="${padT + 4}" x2="${x}" y2="${base}" stroke="rgba(0,0,0,0.45)" stroke-width="1" stroke-dasharray="3,2"/>
                    <circle cx="${x}" cy="${padT + 4}" r="2.5" fill="#444" stroke="white" stroke-width="1"/>
                    <line x1="${x}" y1="${base}" x2="${x}" y2="${base + 5}" stroke="#444" stroke-width="2"/>`;
        }).join('');

    return `<div class="elevation-chart-wrapper">
        <svg viewBox="0 0 ${W} ${H}" class="elevation-chart" xmlns="http://www.w3.org/2000/svg">
            <path d="${pathD}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
            ${cpLines}
            <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#ddd" stroke-width="0.5"/>
            <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#ddd" stroke-width="0.5"/>
            <text x="${padL - 3}" y="${padT + 8}" text-anchor="end" font-size="8" fill="#888">${Math.round(maxEle)}m</text>
            <text x="${padL - 3}" y="${padT + chartH}" text-anchor="end" font-size="8" fill="#888">${Math.round(minEle)}m</text>
            <text x="${padL}" y="${H - 2}" text-anchor="start" font-size="8" fill="#aaa">0</text>
            <text x="${padL + chartW}" y="${H - 2}" text-anchor="end" font-size="8" fill="#aaa">${Math.round(totalKm)}km</text>
            <line id="elev-cursor" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#333" stroke-width="1" stroke-dasharray="2,1" opacity="0" pointer-events="none"/>
            <circle id="elev-dot" cx="${padL}" cy="${padT + chartH / 2}" r="3" fill="#111" stroke="white" stroke-width="1.5" opacity="0" pointer-events="none"/>
        </svg>
    </div>`;
}

function updateElevCursor(raceName, km, visible) {
    const cursor = document.getElementById('elev-cursor');
    const dot = document.getElementById('elev-dot');
    if (!cursor || !dot) return;

    const meta = raceChartMeta[raceName];
    if (!meta || !visible) {
        cursor.setAttribute('opacity', '0');
        dot.setAttribute('opacity', '0');
        return;
    }

    const padL = 36, padR = 4, padT = 4, padB = 16;
    const W = 300, H = 64;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const x = (padL + (km / meta.totalKm) * chartW).toFixed(1);
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('opacity', '0.5');

    const ele = getElevAtKm(raceName, km);
    if (ele !== null) {
        const y = (padT + (1 - (ele - meta.minEle) / meta.eleRange) * chartH).toFixed(1);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('opacity', '1');
    }
}
