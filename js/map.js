// ── Leaflet map initialization ────────────────────────────────────────────────

const map = L.map('map').setView([59.9139, 10.7522], 9);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

const kartverketLayer = L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.kartverket.no/" target="_blank">Kartverket</a>'
});

osmLayer.addTo(map);

L.control.scale({
    metric: true,
    imperial: false,
    position: 'bottomleft'
}).addTo(map);

// ── Icons ─────────────────────────────────────────────────────────────────────

const cpIcon = L.divIcon({
    className: '',
    html: `<svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
        <polygon points="6,1 11,6 6,11 1,6" fill="#fff" stroke="#333" stroke-width="1.5"/>
    </svg>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const cpIconHighlighted = L.divIcon({
    className: '',
    html: `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <polygon points="9,1 17,9 9,17 1,9" fill="#ff6b00" stroke="#fff" stroke-width="2"/>
    </svg>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

const startIcon = L.divIcon({
    className: '',
    html: '<div class="track-marker track-marker-start">S</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

const finishIcon = L.divIcon({
    className: '',
    html: '<div class="track-marker track-marker-finish"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

// ── Layer state ───────────────────────────────────────────────────────────────

const raceLayers = {};
const layerStates = {};
const racePolylines = {};
const hitAreaPolylines = {};
const raceDecorators = {};
const raceMarkers = {};
let activeCheckpointMarkers = [];
let focusedRaceName = null; // which race is visually emphasized on the map — separate from selectedRaceName (which race the info panel shows)
const raceElevationData = {};
const raceChartMeta = {};

raceRoutes.forEach(race => {
    layerStates[race.name] = true;
    raceLayers[race.name] = L.layerGroup().addTo(map);
});

// ── Map helpers ───────────────────────────────────────────────────────────────

function makeArrowPattern(color, opacity) {
    return [{
        repeat: 300,
        symbol: L.Symbol.arrowHead({
            pixelSize: 18,
            polygon: true,
            pathOptions: { stroke: true, fill: true, color: '#000', fillColor: color, fillOpacity: opacity, opacity, weight: 1 }
        })
    }];
}

function buildRoutePoints(raceName) {
    const polylines = racePolylines[raceName];
    if (!polylines) return [];
    const points = [];
    let cumDist = 0;
    let prev = null;
    for (const pl of polylines) {
        for (const ll of pl.getLatLngs()) {
            if (prev) cumDist += haversineKm(prev.lat, prev.lng, ll.lat, ll.lng);
            points.push({ lat: ll.lat, lng: ll.lng, cumDist });
            prev = ll;
        }
    }
    return points;
}

function nearestOnRoute(points, lat, lng) {
    let best = { dist: Infinity, lat: 0, lng: 0, km: 0 };
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i], p2 = points[i + 1];
        const dx = p2.lat - p1.lat, dy = p2.lng - p1.lng;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((lat - p1.lat) * dx + (lng - p1.lng) * dy) / lenSq)) : 0;
        const pLat = p1.lat + t * dx, pLng = p1.lng + t * dy;
        const d = haversineKm(lat, lng, pLat, pLng);
        if (d < best.dist) {
            const segLen = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
            best = { dist: d, lat: pLat, lng: pLng, km: p1.cumDist + t * segLen };
        }
    }
    return best;
}

function getLatLngAtKm(routePoints, km) {
    if (!routePoints || routePoints.length === 0) return null;
    let lo = 0, hi = routePoints.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (routePoints[mid].cumDist < km) lo = mid + 1;
        else hi = mid;
    }
    if (lo === 0) return routePoints[0];
    const p1 = routePoints[lo - 1], p2 = routePoints[lo];
    const span = p2.cumDist - p1.cumDist;
    const t = span > 0 ? (km - p1.cumDist) / span : 0;
    return { lat: p1.lat + t * (p2.lat - p1.lat), lng: p1.lng + t * (p2.lng - p1.lng) };
}

function getElevAtKm(raceName, km) {
    const pts = raceElevationData[raceName];
    if (!pts || pts.length === 0) return null;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].km < km) lo = mid + 1;
        else hi = mid;
    }
    if (lo === 0) return pts[0].ele;
    const p1 = pts[lo - 1], p2 = pts[lo];
    const t = (km - p1.km) / (p2.km - p1.km);
    return p1.ele + t * (p2.ele - p1.ele);
}

// ── Color management ──────────────────────────────────────────────────────────

function regenerateColors() {
    const shuffledColors = shuffleArray(darkColorPool);
    raceRoutes.forEach((race, index) => {
        race.color = shuffledColors[index % shuffledColors.length];
    });

    for (const [name, polylines] of Object.entries(racePolylines)) {
        const race = raceRoutes.find(r => r.name === name);
        if (race) {
            polylines.forEach(pl => pl.setStyle({ color: race.color }));
            (raceDecorators[name] || []).forEach(dec => dec.setPatterns(makeArrowPattern(race.color, 0)));
        }
    }

    document.querySelectorAll('.toggle-race').forEach(checkbox => {
        const raceName = checkbox.dataset.race;
        const race = raceRoutes.find(r => r.name === raceName);
        if (race) {
            const colorIcon = checkbox.parentElement.querySelector('.layer-icon');
            if (colorIcon) colorIcon.style.backgroundColor = race.color;
        }
    });
}

// ── Race picker popup ─────────────────────────────────────────────────────────

let racePickerPopup = null;

function pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq)) : 0;
    return Math.sqrt((a.x + t * dx - p.x) ** 2 + (a.y + t * dy - p.y) ** 2);
}

function findRacesNearClick(containerPoint) {
    const threshold = 25;
    const nearby = [];
    for (const [raceName, polylines] of Object.entries(racePolylines)) {
        if (!raceLayers[raceName] || !map.hasLayer(raceLayers[raceName])) continue;
        let found = false;
        outer: for (const pl of polylines) {
            const lls = pl.getLatLngs();
            for (let i = 0; i < lls.length - 1; i++) {
                const a = map.latLngToContainerPoint(lls[i]);
                const b = map.latLngToContainerPoint(lls[i + 1]);
                if (pointToSegmentDist(containerPoint, a, b) <= threshold) { found = true; break outer; }
            }
        }
        if (found) {
            const race = raceRoutes.find(r => r.name === raceName);
            if (race) nearby.push(race);
        }
    }
    return nearby;
}

function showRacePicker(latlng, races) {
    if (racePickerPopup) { map.closePopup(racePickerPopup); racePickerPopup = null; }
    const items = races.map(r =>
        `<div class="race-picker-item" onclick="pickRace('${r.name.replace(/'/g, "\\'")}')">${r.name}</div>`
    ).join('');
    racePickerPopup = L.popup({ closeButton: false, className: 'race-picker-popup', maxWidth: 260 })
        .setLatLng(latlng)
        .setContent(`<div class="race-picker">${items}</div>`)
        .openOn(map);
}

function pickRace(name) {
    if (racePickerPopup) { map.closePopup(racePickerPopup); racePickerPopup = null; }
    selectRace(name);
}

// ── Race loading ──────────────────────────────────────────────────────────────

async function loadRace(race) {
    try {
        const allCoordinates = [];
        let totalDistance = 0;
        let totalElevationGain = 0;
        const allWaypoints = [];
        if (!raceElevationData[race.name]) raceElevationData[race.name] = [];

        for (const gpxFile of race.files) {
            const response = await fetch(gpxFile);
            const gpxText = await response.text();
            const geoJSON = parseGPXToGeoJSON(gpxText);

            if (geoJSON.features && geoJSON.features.length > 0) {
                const feature = geoJSON.features[0];
                const coords = feature.geometry.coordinates;

                const leafletCoords = coords.map(c => [c[1], c[0]]);
                allCoordinates.push(leafletCoords);

                totalDistance += feature.properties.distance || 0;
                totalElevationGain += feature.properties.elevationGain || 0;

                if (race.useCalculatedStats) {
                    const offsetKm = raceElevationData[race.name].length > 0
                        ? raceElevationData[race.name][raceElevationData[race.name].length - 1].km
                        : 0;
                    const { points } = buildElevationProfile(coords, offsetKm);
                    raceElevationData[race.name].push(...points);
                }

                if (geoJSON.waypoints?.length) allWaypoints.push(...geoJSON.waypoints);
            }
        }

        if (!race.checkpoints && allWaypoints.length) race.checkpoints = allWaypoints;

        race.distance = race.manualDistance !== undefined ? race.manualDistance : totalDistance;

        if (!race.checkpoints && race.distance > 0) {
            race.checkpoints = [0.25, 0.50, 0.75].map(p => {
                const km = Math.round(race.distance * p * 10) / 10;
                return { name: `~${Math.round(km)} km`, km };
            });
            race.autoCheckpoints = true;
        }
        race.elevation = race.manualElevation !== undefined ? race.manualElevation : totalElevationGain;

        if (!racePolylines[race.name]) racePolylines[race.name] = [];

        allCoordinates.forEach(coords => {
            const polyline = L.polyline(coords, {
                color: race.color,
                weight: 3,
                opacity: 0.8,
                interactive: false
            });
            racePolylines[race.name].push(polyline);

            if (!hitAreaPolylines[race.name]) hitAreaPolylines[race.name] = [];
            const hitArea = L.polyline(coords, {
                color: 'transparent',
                weight: 50,
                opacity: 0,
                interactive: true
            });
            hitAreaPolylines[race.name].push(hitArea);
            hitArea.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                const cp = map.latLngToContainerPoint(e.latlng);
                const nearby = findRacesNearClick(cp);
                if (nearby.length > 1) {
                    if (selectedRaceName) closeRaceDetail();
                    showRacePicker(e.latlng, nearby);
                } else if (selectedRaceName === race.name && focusedRaceName === race.name) {
                    closeRaceDetail();
                } else {
                    selectRace(race.name);
                }
            });
            hitArea.addTo(raceLayers[race.name]);
            polyline.addTo(raceLayers[race.name]);

            if (!raceDecorators[race.name]) raceDecorators[race.name] = [];
            const decorator = L.polylineDecorator(polyline, {
                patterns: makeArrowPattern(race.color, 0)
            });
            raceDecorators[race.name].push(decorator);
            decorator.addTo(raceLayers[race.name]);
        });

        if (allCoordinates.length > 0) {
            const startCoord = allCoordinates[0][0];
            const lastSeg = allCoordinates[allCoordinates.length - 1];
            const finishCoord = lastSeg[lastSeg.length - 1];

            const startMarker = L.marker(startCoord, { icon: startIcon, interactive: false, opacity: 0 });
            const finishMarker = L.marker(finishCoord, { icon: finishIcon, interactive: false, opacity: 0 });
            raceMarkers[race.name] = { start: startMarker, finish: finishMarker };
            startMarker.addTo(raceLayers[race.name]);
            finishMarker.addTo(raceLayers[race.name]);
        }

        if (selectedRaceName && selectedRaceName !== race.name) {
            racePolylines[race.name].forEach(pl => pl.setStyle({ opacity: 0.15, weight: 2 }));
        }

        console.log(`Loaded race: ${race.name} (${race.files.length} segments)`);
    } catch (error) {
        console.error(`Error loading ${race.name}:`, error);
    }
}

async function loadRaces(skip = null) {
    for (const race of raceRoutes) {
        if (skip && race.name === skip.name) continue;
        await loadRace(race);
    }
}

// ── Highlight / reset ─────────────────────────────────────────────────────────

function highlightRace(activeName) {
    focusedRaceName = activeName;
    for (const [name, polylines] of Object.entries(racePolylines)) {
        const isActive = name === activeName;
        polylines.forEach(pl => {
            if (isActive) {
                pl.setStyle({ opacity: 1, weight: 5 });
                pl.bringToFront();
            } else {
                pl.setStyle({ opacity: 0.15, weight: 2 });
            }
        });
        const race = raceRoutes.find(r => r.name === name);
        (raceDecorators[name] || []).forEach(dec => dec.setPatterns(makeArrowPattern(race.color, 0)));
        const markers = raceMarkers[name];
        if (markers) {
            markers.start.setOpacity(isActive ? 1 : 0);
            markers.finish.setOpacity(isActive ? 1 : 0);
        }
    }
    enableDistanceDot(activeName);

    activeCheckpointMarkers.forEach(m => m.marker.remove());
    activeCheckpointMarkers = [];
    const activeRace = raceRoutes.find(r => r.name === activeName);
    if (activeRace && activeRace.checkpoints && activeRace.checkpoints.length > 0) {
        const routePoints = buildRoutePoints(activeName);
        if (routePoints && routePoints.length > 0) {
            resolveCheckpoints(activeRace.checkpoints, activeName)
                .sort((a, b) => a.km - b.km)
                .forEach(cp => {
                    const pos = getLatLngAtKm(routePoints, cp.km);
                    if (!pos) return;
                    const marker = L.marker([pos.lat, pos.lng], { icon: cpIcon, interactive: true }).addTo(map);
                    marker.bindTooltip(`${cp.name} (${cp.km.toFixed(1)} km)`, {
                        permanent: false, direction: 'top', offset: [0, -6],
                        className: 'distance-dot-tooltip'
                    });
                    marker.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        zoomToCheckpoint(activeName, cp.km);
                    });
                    activeCheckpointMarkers.push({ marker, km: cp.km, name: cp.name });
                });
        }
    }
}

function resetRaceStyles() {
    focusedRaceName = null;
    disableDistanceDot();
    activeCheckpointMarkers.forEach(m => m.marker.remove());
    activeCheckpointMarkers = [];
    for (const [name, polylines] of Object.entries(racePolylines)) {
        const race = raceRoutes.find(r => r.name === name);
        polylines.forEach(pl => pl.setStyle({ color: race.color, opacity: 0.8, weight: 3 }));
        (raceDecorators[name] || []).forEach(dec => dec.setPatterns(makeArrowPattern(race.color, 0)));
        const markers = raceMarkers[name];
        if (markers) {
            markers.start.setOpacity(0);
            markers.finish.setOpacity(0);
        }
    }
}

// ── Custom layer control ──────────────────────────────────────────────────────

L.Control.CustomLayers = L.Control.extend({
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control layer-control-container');

        container.innerHTML = `
            <button id="layer-toggle-btn" class="layer-control-btn" title="Kartlag">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2L2 6l8 4 8-4-8-4z"/>
                    <path d="M2 10l8 4 8-4M2 14l8 4 8-4" opacity="0.6"/>
                </svg>
            </button>
            <div id="layer-dropdown" class="layer-dropdown" style="display: none;">
                <div class="layer-dropdown-header">Kartlag</div>
                <div class="layer-section">
                    <label class="layer-checkbox-item">
                        <input type="radio" name="base-layer" value="kartverket">
                        <span>Norgeskart</span>
                    </label>
                    <label class="layer-checkbox-item">
                        <input type="radio" name="base-layer" value="osm" checked>
                        <span>OpenStreetMap</span>
                    </label>
                </div>
            </div>
        `;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const toggleBtn = container.querySelector('#layer-toggle-btn');
        const dropdown = container.querySelector('#layer-dropdown');

        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display !== 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
            toggleBtn.classList.toggle('active', !isVisible);
        };

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdown.style.display = 'none';
                toggleBtn.classList.remove('active');
            }
        });

        container.querySelectorAll('input[name="base-layer"]').forEach(radio => {
            radio.onchange = (e) => {
                map.removeLayer(osmLayer);
                map.removeLayer(kartverketLayer);
                if (e.target.value === 'osm') {
                    map.addLayer(osmLayer);
                } else if (e.target.value === 'kartverket') {
                    map.addLayer(kartverketLayer);
                }
            };
        });

        return container;
    }
});

map.addControl(new L.Control.CustomLayers(), { position: 'topright' });
map.zoomControl.setPosition('topright');
