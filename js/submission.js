let _parsedGpxStats = null;
let _editMode = null;

function _resetSubmitForm() {
    document.getElementById('submit-race-form').reset();
    document.getElementById('gpx-file-text').textContent = 'Velg GPX-fil…';
    document.getElementById('gpx-stats').style.display = 'none';
    document.getElementById('manual-distance-group').style.display = 'none';
    document.getElementById('loop-distances-list').innerHTML = '';
    document.getElementById('submit-race-error').style.display = 'none';
    document.getElementById('submit-race-success').style.display = 'none';
    document.getElementById('submit-race-btn').style.display = '';
    document.getElementById('submit-race-btn').disabled = false;
    _parsedGpxStats = null;
}

function _setFormMode(isEdit) {
    document.getElementById('submit-form-title').textContent = isEdit ? 'Foreslå endring' : 'Legg til løp';
    document.getElementById('submit-form-intro').textContent = isEdit
        ? 'Endre informasjon om løpet. Last kun opp ny GPX-fil ved endring av løype.'
        : 'Fyll inn info og last opp GPX-filen. Løpet legges til automatisk hvis GPX-en er gyldig og distansen er over 30 km.';
    document.getElementById('gpx-required-label').textContent = isEdit ? '' : '*';
    document.getElementById('gpx-file-input').required = !isEdit;
    document.getElementById('gpx-edit-hint').style.display = isEdit ? '' : 'none';
    document.getElementById('submit-race-btn').textContent = isEdit ? 'Send inn endring' : 'Send inn løp';
    document.getElementById('original-race-id').value = isEdit ? (_editMode?.originalId || '') : '';
}

function showSubmitRaceForm() {
    _editMode = null;
    _resetSubmitForm();
    _setFormMode(false);
    document.getElementById('info-main-panel').style.display = 'none';
    document.getElementById('info-submit-panel').style.display = '';
}

function closeSubmitRaceForm() {
    _editMode = null;
    document.getElementById('info-submit-panel').style.display = 'none';
    document.getElementById('info-main-panel').style.display = '';
}

function showMissingRacesPanel() {
    document.getElementById('info-main-panel').style.display = 'none';
    document.getElementById('info-missing-panel').style.display = '';
}

function closeMissingRacesPanel() {
    document.getElementById('info-missing-panel').style.display = 'none';
    document.getElementById('info-main-panel').style.display = '';
}

function openEditRaceForm(raceName) {
    const race = raceRoutes.find(r => r.name === raceName);
    if (!race) return;
    closeRaceDetail();
    _editMode = {
        originalId: race.id || slugify(raceName),
        originalName: raceName,
        originalFiles: race.files,
        originalColor: race.color
    };
    _resetSubmitForm();
    _setFormMode(true);
    document.getElementById('race-name-input').value = race.name;
    document.getElementById('race-url-input').value = race.url || '';
    document.getElementById('race-date-input').value = race.date || '';
    document.getElementById('race-description-input').value = race.description || '';
    document.getElementById('info-overlay').classList.remove('hidden');
    document.getElementById('info-main-panel').style.display = 'none';
    document.getElementById('info-submit-panel').style.display = '';
}

function addLoopDistance(defaultKm = '') {
    const list = document.getElementById('loop-distances-list');
    const isFirst = list.children.length === 0;
    const div = document.createElement('div');
    div.className = 'loop-distance-entry';
    div.innerHTML = `
        <input type="number" class="form-input loop-dist-km" placeholder="km, f.eks. 50"
               step="0.1" min="1" required ${defaultKm ? `value="${defaultKm}"` : ''}>
        ${!isFirst ? `<button type="button" class="loop-dist-remove" onclick="this.parentElement.remove()">×</button>` : '<span></span>'}
    `;
    list.appendChild(div);
}

function onGpxFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('gpx-file-text').textContent = file.name;
    _parsedGpxStats = null;

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = parseGPXForStats(e.target.result);
        const statsEl = document.getElementById('gpx-stats');
        const manualGroup = document.getElementById('manual-distance-group');
        if (result.error) {
            statsEl.textContent = result.error;
            statsEl.className = 'gpx-stats gpx-stats-error';
            statsEl.style.display = '';
            manualGroup.style.display = 'none';
            return;
        }
        _parsedGpxStats = result;
        const cpNote = result.checkpoints.length ? ` · ${result.checkpoints.length} sjekkpunkter` : '';
        statsEl.textContent = `${result.distance.toFixed(1)} km · ${result.elevation} hm · ${result.points} punkter${cpNote}`;
        statsEl.className = 'gpx-stats gpx-stats-ok';
        statsEl.style.display = '';
        const isLoop = result.distance < 30;
        if (isLoop && manualGroup.style.display === 'none') {
            document.getElementById('loop-distances-list').innerHTML = '';
            addLoopDistance();
        }
        manualGroup.style.display = isLoop ? '' : 'none';
    };
    reader.readAsText(file);
}

function parseGPXForStats(gpxText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxText, 'text/xml');
    if (doc.querySelector('parsererror')) return { error: 'Ugyldig GPX-fil (XML-feil)' };
    const trkpts = doc.querySelectorAll('trkpt');
    if (!trkpts.length) return { error: 'GPX-filen mangler sporpunkter (<trkpt>)' };
    const coords = Array.from(trkpts).map(pt => [
        parseFloat(pt.getAttribute('lat')),
        parseFloat(pt.getAttribute('lon')),
        pt.querySelector('ele') ? parseFloat(pt.querySelector('ele').textContent) : null
    ]);
    const geoCoords = coords.map(([lat, lon, ele]) => [lon, lat, ele]);
    const stats = calculateGPXStats(geoCoords);

    const checkpoints = Array.from(doc.querySelectorAll('wpt'))
        .map(wpt => ({
            name: wpt.querySelector('name')?.textContent?.trim() || 'Sjekkpunkt',
            lat: parseFloat(wpt.getAttribute('lat')),
            lng: parseFloat(wpt.getAttribute('lon'))
        }))
        .filter(cp => !isNaN(cp.lat) && !isNaN(cp.lng));

    return { distance: stats.distance, elevation: stats.elevationGain, points: trkpts.length, checkpoints };
}

async function handleRaceSubmit(event) {
    event.preventDefault();

    const errorEl = document.getElementById('submit-race-error');
    const successEl = document.getElementById('submit-race-success');
    const btn = document.getElementById('submit-race-btn');
    const isEdit = !!_editMode;

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = '';
        successEl.style.display = 'none';
    }

    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    if (document.getElementById('race-hp').value) return;

    const gpxFile = document.getElementById('gpx-file-input').files[0];

    if (!isEdit && !gpxFile) {
        showError('Last opp en GPX-fil.');
        return;
    }
    if (gpxFile && !_parsedGpxStats) {
        showError('GPX-filen kunne ikke leses. Sjekk at filen er gyldig.');
        return;
    }

    const loopMode = document.getElementById('manual-distance-group').style.display !== 'none';
    let loopDistances = null;
    let effectiveDistance = _parsedGpxStats ? _parsedGpxStats.distance : null;

    if (loopMode) {
        const entries = Array.from(document.querySelectorAll('.loop-distance-entry'));
        loopDistances = entries.map(el => ({
            km: parseFloat(el.querySelector('.loop-dist-km').value)
        }));
        if (loopDistances.some(e => isNaN(e.km) || e.km < 30)) {
            showError('Alle distanser må være minst 30 km.');
            return;
        }
        effectiveDistance = Math.max(...loopDistances.map(e => e.km));
    } else if (!isEdit && effectiveDistance !== null && effectiveDistance < 30) {
        showError(`Distansen er for kort (${effectiveDistance.toFixed(1)} km). Minimum 30 km.`);
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Sender inn…';

    try {
        const name = document.getElementById('race-name-input').value.trim();
        const payload = {
            name,
            url: document.getElementById('race-url-input').value.trim(),
            date: document.getElementById('race-date-input').value,
            description: document.getElementById('race-description-input').value.trim(),
            submitter: document.getElementById('race-submitter-input').value.trim() || undefined,
            category: effectiveDistance ? distanceToCategory(effectiveDistance) : undefined,
            loopDistances: loopDistances || undefined,
            originalId: isEdit ? _editMode.originalId : undefined,
            originalName: isEdit ? _editMode.originalName : undefined,
            originalFiles: (isEdit && !gpxFile) ? _editMode.originalFiles : undefined,
            originalColor: isEdit ? _editMode.originalColor : undefined,
            gpxContent: gpxFile ? await gpxFile.text() : undefined,
            gpxFilename: gpxFile ? gpxFile.name : undefined
        };

        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        const verb = isEdit ? 'Endringen er sendt inn' : 'Løpet er sendt inn';
        successEl.innerHTML = `${verb}! <a href="${data.prUrl}" target="_blank" rel="noopener">Se PR #${data.prNumber} →</a><br><small>Merges automatisk etter validering.</small>`;
        successEl.style.display = '';
        btn.style.display = 'none';
        _editMode = null;
    } catch (err) {
        showError(`Feil: ${err.message}`);
        btn.disabled = false;
        btn.textContent = 'Send inn løp';
    }
}
