let currentMonthFilter = null;
let currentCategoryFilter = null;
let currentRouteTypeFilter = null;
let currentSearchFilter = null;

function getRouteType(race) {
    return race.routeType || 'race';
}

function applyFilters() {
    raceRoutes.forEach(race => {
        const raceMonth = new Date(race.date).getMonth();
        const matchesMonth = currentMonthFilter === null || raceMonth === currentMonthFilter;
        const matchesCategory = currentCategoryFilter === null || race.category === currentCategoryFilter;
        const matchesRouteType = currentRouteTypeFilter === null || getRouteType(race) === currentRouteTypeFilter;
        const matchesSearch = !currentSearchFilter || race.name.toLowerCase().includes(currentSearchFilter);
        const shouldShow = matchesMonth && matchesCategory && matchesRouteType && matchesSearch;

        if (shouldShow && !map.hasLayer(raceLayers[race.name])) {
            map.addLayer(raceLayers[race.name]);
            layerStates[race.name] = true;
        } else if (!shouldShow && map.hasLayer(raceLayers[race.name])) {
            map.removeLayer(raceLayers[race.name]);
            layerStates[race.name] = false;
        }

        const checkbox = document.querySelector(`.toggle-race[data-race="${race.name}"]`);
        if (checkbox) checkbox.checked = shouldShow;
    });
}

function filterByMonth(month) {
    currentMonthFilter = month;
    document.getElementById('month-filter-btn').classList.toggle('active', month !== null);
    applyFilters();
}

function filterByCategory(category) {
    currentCategoryFilter = category;
    document.getElementById('category-filter-btn').classList.toggle('active', category !== null);
    applyFilters();
}

function filterByRouteType(routeType) {
    currentRouteTypeFilter = routeType;
    document.getElementById('route-type-filter-btn').classList.toggle('active', routeType !== null);
    applyFilters();
}

function filterBySearch(value) {
    const trimmed = value.trim().toLowerCase();
    currentSearchFilter = trimmed || null;
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = trimmed ? 'inline' : 'none';
    applyFilters();
}

function clearSearch() {
    currentSearchFilter = null;
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    applyFilters();
}
