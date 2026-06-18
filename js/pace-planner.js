let pacePlannerRace = null;
let _lastSplitsExport = null;

function gradeFactor(gradePct) {
    if (gradePct >= 0) {
        return 1 + 0.033 * gradePct;
    }
    const g = Math.abs(gradePct);
    return g <= 20 ? 1 - 0.015 * g : 0.7 + 0.01 * (g - 20);
}

// Arrival time at effort-progress p (0–1) with fatigue coefficient f.
// Integrates a linearly increasing pace penalty: at finish you are (1+f)x slower than start.
// Normalized so fatiguedArrival(1, t, f) === t always.
function fatiguedArrival(p, targetMinutes, f) {
    return targetMinutes * (p + f * p * p / 2) / (1 + f / 2);
}

function resolveCheckpoints(checkpoints, raceName) {
    if (!checkpoints || checkpoints.length === 0) return [];
    const routePoints = buildRoutePoints(raceName);
    return checkpoints.map(cp => {
        if (cp.km !== undefined) return cp;
        if (cp.lat !== undefined && cp.lng !== undefined && routePoints && routePoints.length > 0) {
            const nearest = nearestOnRoute(routePoints, cp.lat, cp.lng);
            return { name: cp.name, km: nearest.km };
        }
        return null;
    }).filter(Boolean);
}

function calcCheckpointSplits(raceName, checkpoints, targetMinutes) {
    const elevPoints = raceElevationData[raceName];
    if (!elevPoints || elevPoints.length < 2) return null;

    const totalKm = elevPoints[elevPoints.length - 1].km;
    const waypoints = [
        { name: 'Start', km: 0 },
        ...resolveCheckpoints(checkpoints, raceName)
            .filter(cp => cp.km > 0)
            .map(cp => ({ ...cp, km: Math.min(cp.km, totalKm) }))
            .sort((a, b) => a.km - b.km),
        { name: 'Mål', km: totalKm }
    ];

    function effortForSegment(fromKm, toKm) {
        let effort = 0;
        for (let i = 1; i < elevPoints.length; i++) {
            const p0 = elevPoints[i - 1], p1 = elevPoints[i];
            if (p1.km <= fromKm || p0.km >= toKm) continue;
            const segKm = Math.min(p1.km, toKm) - Math.max(p0.km, fromKm);
            if (segKm <= 0) continue;
            const rise = p1.ele - p0.ele;
            const horiz = (p1.km - p0.km) * 1000;
            const grade = horiz > 0 ? (rise / horiz) * 100 : 0;
            effort += segKm * gradeFactor(grade);
        }
        return effort;
    }

    const totalEffort = effortForSegment(0, totalKm);
    if (totalEffort === 0) return null;

    function eleGainForSegment(fromKm, toKm) {
        let gain = 0;
        for (let i = 1; i < elevPoints.length; i++) {
            const p0 = elevPoints[i - 1], p1 = elevPoints[i];
            if (p1.km <= fromKm || p0.km >= toKm) continue;
            const rise = p1.ele - p0.ele;
            if (rise > 0) gain += rise;
        }
        return Math.round(gain);
    }

    const targetHours = targetMinutes / 60;
    const fCenter = 0.1 + 0.02 * targetHours;
    const fLow = fCenter * 0.5;
    const fHigh = fCenter * 2.0;

    let cumEffort = 0;
    let prevArrival = 0;
    const splits = waypoints.map((wp, i) => {
        if (i === 0) return { ...wp, arrivalMinutes: 0, arrivalRange: null, segmentMinutes: 0, eleGain: 0 };
        const prev = waypoints[i - 1];
        const segEffort = effortForSegment(prev.km, wp.km);
        const eleGain = eleGainForSegment(prev.km, wp.km);
        cumEffort += segEffort;
        const p = cumEffort / totalEffort;
        const tA = fatiguedArrival(p, targetMinutes, fLow);
        const tB = fatiguedArrival(p, targetMinutes, fHigh);
        const arrivalMinutes = (tA + tB) / 2;
        const segmentMinutes = arrivalMinutes - prevArrival;
        prevArrival = arrivalMinutes;
        const isFinish = i === waypoints.length - 1;
        return {
            ...wp,
            arrivalMinutes,
            arrivalRange: isFinish ? null : [Math.min(tA, tB), Math.max(tA, tB)],
            segmentMinutes,
            eleGain
        };
    });

    return splits;
}

function zoomToCheckpoint(raceName, km) {
    const routePoints = buildRoutePoints(raceName);
    if (!routePoints) return;
    const pos = getLatLngAtKm(routePoints, km);
    if (!pos) return;

    activeCheckpointMarkers.forEach(({ marker, km: mKm, name: mName }) => {
        marker.setIcon(cpIcon);
        marker.unbindTooltip();
        marker.bindTooltip(`${mName} (${mKm.toFixed(1)} km)`, {
            permanent: false, direction: 'top', offset: [0, -6],
            className: 'distance-dot-tooltip'
        });
    });

    const entry = activeCheckpointMarkers.find(m => Math.abs(m.km - km) < 1.0);
    if (entry) {
        entry.marker.setIcon(cpIconHighlighted);
        entry.marker.unbindTooltip();
        entry.marker.bindTooltip(entry.name, {
            permanent: true, direction: 'top', offset: [0, -9],
            className: 'distance-dot-tooltip'
        });
        entry.marker.openTooltip();
    }

    map.setView([pos.lat, pos.lng], 14, { animate: true });
}

function renderPacePlanner(race) {
    if (!race.checkpoints || race.checkpoints.length === 0) return '';
    if (!raceElevationData[race.name] || raceElevationData[race.name].length < 2) return '';

    const safeName = race.name.replace(/'/g, "\\'");
    const autoNote = race.autoCheckpoints
        ? `<p class="pace-auto-splits-note">GPX-filen mangler sjekkpunkter — bruker standard 25/50/75 % deling.</p>`
        : '';

    if (isTouchDevice) {
        return `<button class="pace-section-toggle" onclick="openPacePlanner('${safeName}')">
            Pacing-kalkulator <span class="pace-section-chevron">›</span>
        </button>`;
    }

    return `<details class="pace-section">
        <summary class="pace-section-toggle">
            Pacing-kalkulator <span class="pace-section-chevron">›</span>
        </summary>
        <div class="pace-planner">
            ${autoNote}
            <div class="pace-planner-header">
                <div class="pace-inputs-row">
                    <span class="pace-input-label">Sluttid</span>
                    <input type="text" class="pace-target-input pace-target-input-sm" id="pace-target-input"
                        placeholder="0:00" maxlength="5"
                        oninput="updatePacePlanner()">
                    <span class="pace-input-label">Start</span>
                    <input type="text" class="pace-target-input pace-target-input-sm" id="pace-start-input"
                        placeholder="0:00" maxlength="5"
                        oninput="updatePacePlanner()">
                </div>
            </div>
            <div id="pace-splits-table"><p class="pace-hint">Skriv inn antatt sluttid for å se splits</p></div>
            <details class="pace-desc-details">
                <summary class="pace-desc-summary">Utregning av tid</summary>
                <p class="pace-desc">${PACE_DESC}</p>
            </details>
        </div>
    </details>`;
}

function copySplits() {
    if (!_lastSplitsExport) return;
    const { raceName, splits, startMinutes, targetMinutes } = _lastSplitsExport;
    const fmt = (e) => startMinutes !== null ? fmtClock(startMinutes, e) : fmtTime(e);

    const startStr = startMinutes !== null ? fmtClock(0, startMinutes) : null;
    const finishStr = fmt(targetMinutes);

    const rows = splits.slice(1).map(sp => {
        const arriveStr = sp.arrivalRange
            ? `${fmt(roundTo5(sp.arrivalRange[0]))} – ${fmt(roundTo5(sp.arrivalRange[1]))}`
            : fmt(sp.arrivalMinutes);
        return { name: sp.name, arrive: arriveStr, km: sp.km.toFixed(0) };
    });
    const timeW = Math.max(...rows.map(r => r.arrive.length)) + 2;

    const tableLines = rows.map(r =>
        `${r.arrive.padEnd(timeW)}${r.km.padStart(3)} km  ${r.name}`
    );

    const header = [];
    header.push(raceName);
    if (startStr) header.push(`Start: ${startStr}  ->  Mal: ~${finishStr}`);
    else header.push(`Antatt sluttid: ${fmtTime(targetMinutes)}`);

    const text = [...header, '', ...tableLines].join('\n');

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.pace-copy-btn');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = '✓ Kopiert';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1800);
    });
}

function openPacePlanner(raceName) {
    pacePlannerRace = raceName;
    document.getElementById('pace-overlay-title').textContent = raceName;
    document.getElementById('pace-overlay-input').value = '';
    document.getElementById('pace-overlay-start-input').value = '';
    document.getElementById('pace-overlay-desc').textContent = PACE_DESC;
    document.getElementById('pace-overlay-table').innerHTML = `<p class="pace-hint">Skriv inn måltid for å se splits per post</p>`;
    document.getElementById('pace-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('pace-overlay-input').focus(), 50);
}

function closePacePlanner() {
    document.getElementById('pace-overlay').classList.add('hidden');
    pacePlannerRace = null;
}

function updatePacePlanner() {
    const input = document.getElementById(isTouchDevice ? 'pace-overlay-input' : 'pace-target-input');
    const tableEl = document.getElementById(isTouchDevice ? 'pace-overlay-table' : 'pace-splits-table');
    if (!input || !tableEl || !pacePlannerRace) return;

    const raw = input.value.trim();
    const matchFull = raw.match(/^(\d+):(\d{1,2})$/);
    const matchHours = raw.match(/^(\d+)$/);
    if (!matchFull && !matchHours) {
        tableEl.innerHTML = raw
            ? '<p class="pace-hint pace-hint-err">Format: t:mm – f.eks. 24:00 eller 9:00</p>'
            : '<p class="pace-hint">Skriv inn måltid for å se splits per post</p>';
        return;
    }

    const hours = parseInt(matchFull ? matchFull[1] : matchHours[1]);
    const mins = matchFull ? parseInt(matchFull[2]) : 0;
    if (mins >= 60) { tableEl.innerHTML = '<p class="pace-hint pace-hint-err">Format: t:mm – f.eks. 24:00 eller 9:00</p>'; return; }
    const targetMinutes = hours * 60 + mins;

    const race = raceRoutes.find(r => r.name === pacePlannerRace);
    if (!race) return;
    const splits = calcCheckpointSplits(pacePlannerRace, race.checkpoints, targetMinutes);
    if (!splits) return;

    const startInput = document.getElementById(isTouchDevice ? 'pace-overlay-start-input' : 'pace-start-input');
    const startMinutes = startInput ? parseStartTime(startInput.value) : null;

    _lastSplitsExport = {
        raceName: pacePlannerRace,
        targetRaw: input.value.trim(),
        startRaw: startInput ? startInput.value.trim() : '',
        splits,
        startMinutes,
        targetMinutes
    };

    const fmt = (elapsed) => startMinutes !== null ? fmtClock(startMinutes, elapsed) : fmtTime(elapsed);

    const rows = splits.map((sp, i) => {
        if (i === 0) return '';
        const prev = splits[i - 1];
        const segKm = sp.km - prev.km;
        const pace = fmtPace(segKm, sp.segmentMinutes);
        const isFinish = i === splits.length - 1;
        const arriveStr = sp.arrivalRange
            ? `${fmt(roundTo5(sp.arrivalRange[0]))} – ${fmt(roundTo5(sp.arrivalRange[1]))}`
            : fmt(sp.arrivalMinutes);
        const escapedRace = pacePlannerRace.replace(/'/g, "\\'");
        return `<div class="spl-row spl-row-clickable${isFinish ? ' spl-row-finish' : ''}" onclick="zoomToCheckpoint('${escapedRace}', ${sp.km})">
            <span class="spl-name">${sp.name}</span>
            <span class="spl-arrive">${arriveStr}</span>
            <span class="spl-meta">${sp.km.toFixed(0)} km · +${segKm.toFixed(0)} km · +${sp.eleGain}m · ${pace}</span>
        </div>`;
    }).join('');

    tableEl.innerHTML = `<div class="splits-list">${rows}</div><button class="pace-copy-btn" onclick="copySplits()">Kopier tabell</button>`;
}
