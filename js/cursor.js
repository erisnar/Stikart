// Shared cursor state: distance dot on map + elevation chart cursor
// dotFrozen and chartTouchMarker are shared between map dot and chart interaction.

let distanceDotMarker = null;
let activeRoutePoints = null;
let dotMapMoveHandler = null;
let chartTouchMarker = null;
let dotFrozen = false;

function minimizeDetail() {
    document.getElementById('race-detail-overlay').classList.add('minimized');
    const btn = document.getElementById('minimize-detail');
    if (btn) btn.title = 'Utvid';
}

function expandDetail() {
    document.getElementById('race-detail-overlay').classList.remove('minimized');
    const btn = document.getElementById('minimize-detail');
    if (btn) btn.title = 'Minimer';
}

function enableDistanceDot(raceName) {
    disableDistanceDot();
    if (isTouchDevice) return;

    const race = raceRoutes.find(r => r.name === raceName);
    if (!race) return;

    activeRoutePoints = buildRoutePoints(raceName);
    const color = race ? race.color : '#333';

    distanceDotMarker = L.circleMarker([0, 0], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0,
        opacity: 0,
        interactive: true
    }).addTo(map);

    distanceDotMarker.bindTooltip('', {
        permanent: true,
        direction: 'top',
        offset: [0, -8],
        className: 'distance-dot-tooltip',
        opacity: 0
    });

    distanceDotMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        dotFrozen = !dotFrozen;
        distanceDotMarker.setStyle(dotFrozen
            ? { color: '#e67e22', weight: 3, radius: 8 }
            : { color: '#fff', weight: 2, radius: 6 });
    });

    dotMapMoveHandler = (e) => {
        if (dotFrozen) return;
        const { lat, lng } = e.latlng;
        const nearest = nearestOnRoute(activeRoutePoints, lat, lng);
        const metersPerPixel = 156543 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom());
        const thresholdKm = (50 * metersPerPixel) / 1000;
        const isNear = nearest.dist < thresholdKm;
        if (isNear) {
            distanceDotMarker.setLatLng([nearest.lat, nearest.lng]);
            distanceDotMarker.setStyle({ fillOpacity: 1, opacity: 1 });
            distanceDotMarker.setTooltipContent(`${nearest.km.toFixed(1)} km`);
            distanceDotMarker.getTooltip().setOpacity(1);
        } else {
            distanceDotMarker.setStyle({ fillOpacity: 0, opacity: 0 });
            distanceDotMarker.getTooltip().setOpacity(0);
        }
        updateElevCursor(raceName, nearest.km, isNear);
    };
    map.on('mousemove', dotMapMoveHandler);
}

function disableDistanceDot() {
    dotFrozen = false;
    if (distanceDotMarker) {
        distanceDotMarker.remove();
        distanceDotMarker = null;
    }
    if (dotMapMoveHandler) {
        map.off('mousemove', dotMapMoveHandler);
        dotMapMoveHandler = null;
    }
    activeRoutePoints = null;
    const cursor = document.getElementById('elev-cursor');
    const dot = document.getElementById('elev-dot');
    if (cursor) cursor.setAttribute('opacity', '0');
    if (dot) dot.setAttribute('opacity', '0');
}

function enableChartMouse(raceName) {
    const svg = document.querySelector('.elevation-chart');
    if (!svg) return;

    const routePoints = buildRoutePoints(raceName);
    if (!routePoints || routePoints.length === 0) return;

    svg.style.cursor = 'crosshair';

    const handleMove = (e) => {
        if (dotFrozen) return;
        const rect = svg.getBoundingClientRect();
        const svgX = (e.clientX - rect.left) / rect.width * 300;
        const meta = raceChartMeta[raceName];
        if (!meta) return;

        const padL = 36, chartW = 260;
        const km = Math.max(0, Math.min(meta.totalKm, (svgX - padL) / chartW * meta.totalKm));

        updateElevCursor(raceName, km, true);

        const pos = getLatLngAtKm(routePoints, km);
        if (!pos) return;

        if (!chartTouchMarker) {
            chartTouchMarker = L.circleMarker([pos.lat, pos.lng], {
                radius: 8, color: '#fff', weight: 2,
                fillColor: '#111', fillOpacity: 0.85, interactive: false
            }).addTo(map);
            chartTouchMarker.bindTooltip(`${km.toFixed(1)} km`, {
                permanent: true, direction: 'top', offset: [0, -10],
                className: 'distance-dot-tooltip', opacity: 1
            });
        } else {
            chartTouchMarker.setLatLng([pos.lat, pos.lng]);
            chartTouchMarker.setTooltipContent(`${km.toFixed(1)} km`);
        }
    };

    const handleLeave = () => {
        if (dotFrozen) return;
        if (chartTouchMarker) { chartTouchMarker.remove(); chartTouchMarker = null; }
        updateElevCursor(raceName, 0, false);
    };

    const handleClick = (e) => {
        e.stopPropagation();
        dotFrozen = !dotFrozen;
        if (chartTouchMarker) {
            chartTouchMarker.setStyle(dotFrozen
                ? { color: '#e67e22', weight: 3 }
                : { color: '#fff', weight: 2 });
        }
        if (!dotFrozen) {
            if (chartTouchMarker) { chartTouchMarker.remove(); chartTouchMarker = null; }
            updateElevCursor(raceName, 0, false);
        }
    };

    svg.addEventListener('mousemove', handleMove);
    svg.addEventListener('mouseleave', handleLeave);
    svg.addEventListener('click', handleClick);
}

function enableChartTouch(raceName) {
    const svg = document.querySelector('.elevation-chart');
    if (!svg) return;

    const routePoints = buildRoutePoints(raceName);
    if (!routePoints || routePoints.length === 0) return;

    svg.classList.add('chart-interactive');

    let touchStartX = null;

    const handleTouch = (e) => {
        e.preventDefault();
        const touch = e.touches[0] || e.changedTouches[0];
        if (e.type === 'touchstart') {
            touchStartX = touch.clientX;
            if (dotFrozen) {
                dotFrozen = false;
                if (chartTouchMarker) chartTouchMarker.setStyle({ color: '#fff', weight: 2 });
            }
        }
        if (dotFrozen) return;
        const rect = svg.getBoundingClientRect();
        const svgX = (touch.clientX - rect.left) / rect.width * 300;

        const meta = raceChartMeta[raceName];
        if (!meta) return;

        const padL = 36, chartW = 260;
        const km = Math.max(0, Math.min(meta.totalKm, (svgX - padL) / chartW * meta.totalKm));

        updateElevCursor(raceName, km, true);

        const pos = getLatLngAtKm(routePoints, km);
        if (!pos) return;

        if (!chartTouchMarker) {
            chartTouchMarker = L.circleMarker([pos.lat, pos.lng], {
                radius: 8, color: '#fff', weight: 2,
                fillColor: '#111', fillOpacity: 0.85, interactive: false
            }).addTo(map);
            chartTouchMarker.bindTooltip(`${km.toFixed(1)} km`, {
                permanent: true, direction: 'top', offset: [0, -10],
                className: 'distance-dot-tooltip', opacity: 1
            });
        } else {
            chartTouchMarker.setLatLng([pos.lat, pos.lng]);
            chartTouchMarker.setTooltipContent(`${km.toFixed(1)} km`);
        }
    };

    const handleTouchEnd = (e) => {
        const touch = e.changedTouches[0];
        const moved = touchStartX !== null && Math.abs(touch.clientX - touchStartX) > 8;
        if (!moved) {
            dotFrozen = !dotFrozen;
            if (chartTouchMarker) {
                chartTouchMarker.setStyle(dotFrozen
                    ? { color: '#e67e22', weight: 3 }
                    : { color: '#fff', weight: 2 });
            }
            if (!dotFrozen) {
                if (chartTouchMarker) { chartTouchMarker.remove(); chartTouchMarker = null; }
                updateElevCursor(raceName, 0, false);
            }
            return;
        }
        if (dotFrozen) return;
        dotFrozen = true;
        if (chartTouchMarker) chartTouchMarker.setStyle({ color: '#e67e22', weight: 3 });
    };

    svg.addEventListener('touchstart', handleTouch, { passive: false });
    svg.addEventListener('touchmove', handleTouch, { passive: false });
    svg.addEventListener('touchend', handleTouchEnd);
}
