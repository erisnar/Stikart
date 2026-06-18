// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lon1, lat1, lon2, lat2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

// Calculate statistics from GPX coordinates
function calculateGPXStats(coordinates) {
    let totalDistance = 0;
    let elevationGain = 0;

    // Filter to only points with valid elevation for elevation calculation.
    // Use a threshold to filter GPS noise - only count elevation changes
    // that exceed the threshold.
    const ELEVATION_THRESHOLD = 4; // meters
    let lastCountedEle = null;

    for (let i = 1; i < coordinates.length; i++) {
        const [lon1, lat1] = coordinates[i - 1];
        const [lon2, lat2, ele2] = coordinates[i];

        // Calculate distance (always, regardless of elevation)
        const dist = calculateDistance(lon1, lat1, lon2, lat2);
        totalDistance += dist;

        // Skip points without elevation data
        if (ele2 === null || ele2 === undefined) continue;

        // Initialize reference elevation from first valid point
        if (lastCountedEle === null) {
            lastCountedEle = ele2;
            continue;
        }

        // Calculate elevation gain with threshold filtering
        const elevDiff = ele2 - lastCountedEle;
        if (elevDiff > ELEVATION_THRESHOLD) {
            elevationGain += elevDiff;
            lastCountedEle = ele2;
        } else if (elevDiff < -ELEVATION_THRESHOLD) {
            lastCountedEle = ele2;
        }
    }

    return {
        distance: totalDistance / 1000, // Convert to km
        elevationGain: Math.round(elevationGain)
    };
}

// Simple GPX to GeoJSON parser with statistics
function parseGPXToGeoJSON(gpxText) {
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(gpxText, 'text/xml');

    const coordinates = [];
    // Support both track files (<trkpt>) and route files (<rtept>)
    let trackPoints = gpxDoc.querySelectorAll('trkpt');
    if (trackPoints.length === 0) trackPoints = gpxDoc.querySelectorAll('rtept');

    // Downsample dense recordings to keep rendering performant (target ~3000 pts)
    const MAX_POINTS = 3000;
    const stride = trackPoints.length > MAX_POINTS ? Math.ceil(trackPoints.length / MAX_POINTS) : 1;

    trackPoints.forEach((trkpt, i) => {
        if (i % stride !== 0) return;
        const lat = parseFloat(trkpt.getAttribute('lat'));
        const lon = parseFloat(trkpt.getAttribute('lon'));
        const eleElement = trkpt.querySelector('ele');
        const ele = eleElement ? parseFloat(eleElement.textContent) : null;

        coordinates.push([lon, lat, ele]);
    });

    const stats = calculateGPXStats(coordinates);

    const waypoints = Array.from(gpxDoc.querySelectorAll('wpt'))
        .map(wpt => ({
            name: wpt.querySelector('name')?.textContent?.trim() || 'Sjekkpunkt',
            lat: parseFloat(wpt.getAttribute('lat')),
            lng: parseFloat(wpt.getAttribute('lon'))
        }))
        .filter(wp => !isNaN(wp.lat) && !isNaN(wp.lng));

    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: {
                distance: stats.distance,
                elevationGain: stats.elevationGain
            }
        }],
        waypoints
    };
}
