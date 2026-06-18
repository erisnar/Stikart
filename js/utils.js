const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];

const PACE_DESC = 'Stigningsjustering: +3% lenger per 1% oppoverbakke (10% stigning = 33% tregere enn flatt). Slak nedoverbakke gir opptil 20% raskere fart. Fatigue: for et 24-timersløp antar modellen at du løper 30–110% tregere mot slutten enn i starten.';

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function raceBySlug(slug) {
    return raceRoutes.find(r => slugify(r.name) === slug) || null;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day}. ${month} ${year}`;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getRandomColor() {
    return darkColorPool[Math.floor(Math.random() * darkColorPool.length)];
}

function fmtTime(minutes) {
    let h = Math.floor(minutes / 60);
    let m = Math.round(minutes % 60);
    if (m === 60) { h += 1; m = 0; }
    return h > 0 ? `${h}t ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

function roundTo5(minutes) {
    return Math.round(minutes / 5) * 5;
}

function fmtClock(startMinutes, elapsedMinutes) {
    const total = Math.round(startMinutes + elapsedMinutes) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function fmtPace(segKm, segMinutes) {
    if (segKm <= 0) return '–';
    const minkm = segMinutes / segKm;
    const m = Math.floor(minkm);
    const s = Math.round((minkm - m) * 60);
    return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceToCategory(km) {
    if (km < 50) return 'marathon-trail';
    if (km < 65) return '50k';
    if (km < 130) return '50-miles';
    if (km < 160) return '100k';
    if (km < 500) return '100-miles';
    return '100-miles-plus';
}

function parseStartTime(raw) {
    const mFull = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    const mHours = raw.trim().match(/^(\d{1,2})$/);
    if (!mFull && !mHours) return null;
    const h = parseInt(mFull ? mFull[1] : mHours[1]);
    const min = mFull ? parseInt(mFull[2]) : 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}
