let isPanelExpanded = false;
let selectedRaceName = null;
let isMobile = window.innerWidth <= 768;

function welcomeLoadAll() {
    document.getElementById('mobile-welcome').classList.add('hidden');
    document.getElementById('month-filter-btn').classList.add('visible');
    document.getElementById('category-filter-btn').classList.add('visible');
    document.getElementById('route-type-filter-btn').classList.add('visible');
    loadRaces();
}

function welcomePickFromList() {
    document.getElementById('mobile-welcome').classList.add('hidden');
    isPanelExpanded = true;
    document.getElementById('race-panel').classList.add('expanded');
}

function initRacePanel() {
    const handle = document.getElementById('panel-handle');

    handle.addEventListener('click', togglePanel);

    document.getElementById('close-detail').addEventListener('click', closeRaceDetail);
    document.getElementById('minimize-detail').addEventListener('click', () => {
        if (document.getElementById('race-detail-overlay').classList.contains('minimized')) {
            expandDetail();
        } else {
            minimizeDetail();
        }
    });
    document.getElementById('race-detail-overlay').addEventListener('click', (e) => {
        if (e.target.classList.contains('race-detail-overlay')) {
            closeRaceDetail();
        }
    });

    window.addEventListener('resize', debounce(() => {
        isMobile = window.innerWidth <= 768;
        renderRaceList();
    }, 250));

    if (isTouchDevice && !priorityRace) {
        document.getElementById('mobile-welcome').classList.remove('hidden');
    }

    setTimeout(renderRaceList, 500);
}

function togglePanel() {
    const panel = document.getElementById('race-panel');
    isPanelExpanded = !isPanelExpanded;
    panel.classList.toggle('expanded', isPanelExpanded);
}

function getVisibleRaces() {
    return raceRoutes.filter(race => {
        const raceMonth = new Date(race.date).getMonth();
        const matchesMonth = currentMonthFilter === null || raceMonth === currentMonthFilter;
        const matchesCategory = currentCategoryFilter === null || race.category === currentCategoryFilter;
        const matchesRouteType = currentRouteTypeFilter === null || getRouteType(race) === currentRouteTypeFilter;
        const matchesSearch = !currentSearchFilter || race.name.toLowerCase().includes(currentSearchFilter);
        return matchesMonth && matchesCategory && matchesRouteType && matchesSearch;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderRaceList() {
    const raceList = document.getElementById('race-list');
    const raceCount = document.getElementById('race-count');
    if (!raceList) return;

    const visibleRaces = getVisibleRaces();
    raceCount.textContent = `Løpskalender`;

    raceList.innerHTML = visibleRaces.map(race => `
        <div class="race-item ${selectedRaceName === race.name ? 'selected' : ''}" data-race="${race.name}">
            <span class="race-color-indicator" style="background-color: ${race.color}"></span>
            <div class="race-item-info">
                <div class="race-item-name">${race.name}</div>
                <div class="race-item-meta">${formatDate(race.date)}</div>
            </div>
        </div>
    `).join('');

    raceList.querySelectorAll('.race-item').forEach(item => {
        item.addEventListener('click', () => selectRace(item.dataset.race));
    });
}

async function selectRace(raceName) {
    const race = raceRoutes.find(r => r.name === raceName);
    if (!race) return;

    document.activeElement.blur();
    const detailOverlay = document.getElementById('race-detail-overlay');
    const wasOpen = detailOverlay && !detailOverlay.classList.contains('hidden');
    selectedRaceName = raceName;

    if (currentSearchFilter) clearSearch();

    document.querySelectorAll('.race-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.race === raceName);
    });

    const panel = document.getElementById('race-panel');
    isPanelExpanded = false;
    panel.classList.remove('expanded');

    // Push a history entry the first time the detail panel opens, so the browser
    // back button closes it; switching races while it's already open just replaces
    // the current entry instead of stacking up more back-presses than expected.
    const targetQuery = routeQuery(race);
    if (wasOpen || window.location.search === targetQuery) {
        history.replaceState(null, '', targetQuery);
    } else {
        history.pushState(null, '', targetQuery);
    }
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: '/' + targetQuery });
    }

    const isLoaded = racePolylines[raceName] && racePolylines[raceName].length > 0;
    if (!isLoaded) {
        showRaceDetailOverlay(race, true);
        await loadRace(race);
    }

    highlightRace(raceName);
    panToRace(raceName);
    showRaceDetailOverlay(race);
    if (isTouchDevice) enableChartTouch(raceName);
    else enableChartMouse(raceName);
}

function panToRace(raceName) {
    const polylines = racePolylines[raceName];
    if (!polylines || polylines.length === 0) return;

    const bounds = L.latLngBounds([]);
    polylines.forEach(pl => bounds.extend(pl.getBounds()));

    map.fitBounds(bounds, {
        ...(isMobile
            ? { paddingTopLeft: [50, 50], paddingBottomRight: [50, 180] }
            : { padding: [100, 100] }),
        maxZoom: 13
    });
}

function openRacePopup(raceName) {
    const polylines = racePolylines[raceName];
    if (!polylines || polylines.length === 0) return;

    const firstPolyline = polylines[0];
    const center = firstPolyline.getCenter();
    firstPolyline.openPopup(center);
}

function renderRouteDescription(race) {
    if (!race.routeDescription && (!race.routeLinks || race.routeLinks.length === 0)) return '';

    const description = race.routeDescription
        ? `<p class="route-description-text">${escapeHtml(race.routeDescription)}</p>`
        : '';
    const links = (race.routeLinks || []).map(link => {
        if (!link || !link.url || !link.label) return '';
        return `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="route-description-link">${escapeHtml(link.label)}</a>`;
    }).join('');
    const linksMarkup = links ? `<div class="route-description-links">${links}</div>` : '';

    return `<section class="route-description">
        <h4>Om ruten</h4>
        ${description}
        ${linksMarkup}
    </section>`;
}

function showRaceDetailOverlay(race, loading = false) {
    const overlay = document.getElementById('race-detail-overlay');
    const content = document.getElementById('race-detail-content');

    if (loading) {
        content.innerHTML = `<div class="race-popup"><h3>${race.name}</h3><p class="race-loading">Laster løype…</p></div>`;
        overlay.classList.remove('hidden');
        if (isTouchDevice) {
            overlay.classList.add('minimized');
            document.getElementById('race-panel').style.display = 'none';
        }
        return;
    }

    const downloadLinks = race.files.map((file, index) => {
        const fileName = file.split('/').pop();
        const githubUrl = `https://raw.githubusercontent.com/erisnar/stikart/main/${encodeURI(file)}`;
        const label = race.files.length > 1 ? `GPX ${index + 1}` : 'Last ned GPX';
        return `<a href="#" onclick="downloadGpx('${githubUrl}', '${fileName}'); return false;" class="race-download-link">${label}</a>`;
    }).join(' ');

    content.innerHTML = `
        <div class="race-popup">
            <div class="race-popup-header">
                <h3>${race.name}</h3>
            </div>
            ${race.description ? `<p class="race-description">${escapeHtml(race.description)}</p>` : ''}
            <div class="race-popup-details">
                <div class="race-details">
                    <div class="race-details-date-row"><span><strong>Dato:</strong> ${formatDate(race.date)}</span><div class="race-popup-icon-btns"><button class="popup-color-btn" onclick="changeRaceColor('${race.name}')" title="Endre farge"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></button><button class="race-edit-btn" onclick="openEditRaceForm('${race.name.replace(/'/g, "\\'")}')" title="Foreslå endring"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button></div></div>
                    <div><strong>Distanse:</strong> ${race.distance ? race.distance.toFixed(1) + ' km' : 'N/A'}</div>
                    <div><strong>Høydemeter:</strong> ${race.elevation ? race.elevation + ' m' : 'N/A'}</div>
                    ${race.gpxYear ? `<div><strong>Løypeår:</strong> ${race.gpxYear}${race.gpxYear < 2026 ? ' ⚠️' : ''}</div>` : ''}
                    <div><strong>GPX:</strong> ${downloadLinks}${race.gpxUpdated ? ` <em class="gpx-date">${formatDate(race.gpxUpdated)}</em>` : ''}</div>
                </div>
                <div class="race-actions">
                    ${race.url ? `<a href="${race.url}" target="_blank" rel="noopener noreferrer" class="race-link">
                        Besøk nettside →
                    </a>` : ''}
                    <button class="race-share-btn" onclick="shareRace('${race.name.replace(/'/g, "\\'")}')">
                        Del løype
                    </button>
                </div>
            </div>
            ${renderElevationChart(raceElevationData[race.name], race.color, race.name, race.checkpoints)}
            ${renderPacePlanner(race)}
            ${renderRouteDescription(race)}
        </div>
    `;

    overlay.classList.remove('hidden');
    const minBtn = document.getElementById('minimize-detail');
    if (isTouchDevice) {
        overlay.classList.add('minimized');
        if (minBtn) minBtn.title = 'Utvid';
        document.getElementById('race-panel').style.display = 'none';
    } else {
        overlay.classList.remove('minimized');
        if (minBtn) minBtn.title = 'Minimer';
        pacePlannerRace = race.name;
    }
}

function closeRaceDetail() {
    const overlay = document.getElementById('race-detail-overlay');
    overlay.classList.add('hidden');
    if (isTouchDevice) document.getElementById('race-panel').style.display = '';
    overlay.style.left = '';
    overlay.style.top = '';
    overlay.style.bottom = '';
    overlay.style.right = '';
    resetRaceStyles();
    selectedRaceName = null;
    history.replaceState(null, '', window.location.pathname);
    if (chartTouchMarker) { chartTouchMarker.remove(); chartTouchMarker = null; }
    document.getElementById('race-detail-overlay').classList.remove('minimized');

    document.querySelectorAll('.race-item').forEach(item => {
        item.classList.remove('selected');
    });
}

function shareRace(raceName) {
    const race = raceRoutes.find(r => r.name === raceName);
    const url = window.location.origin + window.location.pathname + (race ? routeQuery(race) : '?race=' + slugify(raceName));
    const isTouch = navigator.maxTouchPoints > 0;
    if (isTouch && navigator.share) {
        navigator.share({ title: raceName, url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.querySelector('.race-share-btn');
            const actions = document.querySelector('.race-actions');
            if (!btn || !actions) return;
            btn.textContent = 'Kopiert!';
            let urlDisplay = actions.querySelector('.share-url-display');
            if (!urlDisplay) {
                urlDisplay = document.createElement('div');
                urlDisplay.className = 'share-url-display';
                actions.appendChild(urlDisplay);
            }
            urlDisplay.textContent = url;
            setTimeout(() => {
                btn.textContent = 'Del løype';
                urlDisplay.textContent = '';
            }, 3000);
        });
    }
}

function changeRaceColor(raceName) {
    const race = raceRoutes.find(r => r.name === raceName);
    if (!race) return;

    race.color = getRandomColor();

    if (racePolylines[raceName]) {
        racePolylines[raceName].forEach(pl => pl.setStyle({ color: race.color }));
    }
    (raceDecorators[raceName] || []).forEach(dec => dec.setPatterns(makeArrowPattern(race.color, 0)));

    const raceItem = document.querySelector(`.race-item[data-race="${raceName}"]`);
    if (raceItem) {
        const indicator = raceItem.querySelector('.race-color-indicator');
        if (indicator) indicator.style.backgroundColor = race.color;
    }

    const chartPath = document.querySelector('#race-detail-content .elevation-chart path');
    if (chartPath) {
        chartPath.setAttribute('fill', race.color);
        chartPath.setAttribute('stroke', race.color);
    }
}

// Extend applyFilters to also update the panel and close detail if selection is filtered out
const _origApplyFilters = applyFilters;
applyFilters = function() {
    _origApplyFilters();
    renderRaceList();

    if (selectedRaceName) {
        const race = raceRoutes.find(r => r.name === selectedRaceName);
        if (race) {
            const raceMonth = new Date(race.date).getMonth();
            const matchesMonth = currentMonthFilter === null || raceMonth === currentMonthFilter;
            const matchesCategory = currentCategoryFilter === null || race.category === currentCategoryFilter;
            const matchesRouteType = currentRouteTypeFilter === null || getRouteType(race) === currentRouteTypeFilter;
            const matchesSearch = !currentSearchFilter || race.name.toLowerCase().includes(currentSearchFilter);
            if (!matchesMonth || !matchesCategory || !matchesRouteType || !matchesSearch) {
                closeRaceDetail();
            }
        }
    }
};

// Extend regenerateColors to update panel color dots and open detail chart
const _origRegenerateColors = regenerateColors;
regenerateColors = function() {
    _origRegenerateColors();
    renderRaceList();
    if (selectedRaceName) {
        const race = raceRoutes.find(r => r.name === selectedRaceName);
        if (race) {
            const chartPath = document.querySelector('#race-detail-content .elevation-chart path');
            if (chartPath) {
                chartPath.setAttribute('fill', race.color);
                chartPath.setAttribute('stroke', race.color);
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', initRacePanel);
