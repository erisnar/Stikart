// ── Info overlay ──────────────────────────────────────────────────────────────

function showInfoOverlay() {
    document.getElementById('info-overlay').classList.remove('hidden');
    const el = document.getElementById('visit-count');
    if (el && !el.dataset.loaded) {
        fetch('https://stikart.goatcounter.com/counter/TOTAL.json')
            .then(r => r.json())
            .then(data => {
                el.textContent = 'Antall besøk på stikart.no: ' + data.count;
                el.dataset.loaded = '1';
            })
            .catch(() => { el.textContent = ''; });
    }
}

function closeInfoOverlay() {
    document.getElementById('info-overlay').classList.add('hidden');
}

document.addEventListener('click', (e) => {
    const overlay = document.getElementById('info-overlay');
    if (e.target === overlay) closeInfoOverlay();
});

// ── GPX download ──────────────────────────────────────────────────────────────

function downloadGpx(url, fileName) {
    fetch(url)
        .then(response => response.blob())
        .then(blob => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(link.href);
        })
        .catch(err => console.error('Download failed:', err));
}

// ── Startup ───────────────────────────────────────────────────────────────────

regenerateColors();

const params = new URLSearchParams(window.location.search);
const priorityRace = params.get('race') ? raceBySlug(params.get('race')) : null;

if (priorityRace) {
    loadRace(priorityRace).then(() => {
        selectRace(priorityRace.name);
        if (!isTouchDevice) loadRaces(priorityRace);
    });
} else {
    // Try to center on the visitor's approximate location via IP geolocation —
    // no permission prompt, city-level accuracy. Falls back to Oslo on any error.
    fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(data => {
            if (data.latitude && data.longitude) {
                map.setView([data.latitude, data.longitude], 9, {animate: false});
            }
        })
        .catch(() => {});

    if (!isTouchDevice) loadRaces();
}

map.on('click', () => {
    if (racePickerPopup) { map.closePopup(racePickerPopup); racePickerPopup = null; }
    if (selectedRaceName) closeRaceDetail();
});
