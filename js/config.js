// Deploy worker.js to Cloudflare Workers, then set this to your worker URL.
// Run: wrangler deploy && wrangler secret put GITHUB_TOKEN
const WORKER_URL = 'https://stikart-submit.stikart.workers.dev';

const isTouchDevice = (function() {
    return (
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
})();

const darkColorPool = [
    '#e63946', '#d62828', '#9b2335', '#c1121f', '#ff006e',
    '#f72585', '#b5179e', '#e91e63', '#c2185b', '#ad1457',
    '#e76f51', '#f4a261', '#fb5607', '#ff5400', '#e65100',
    '#ff6d00', '#f57c00', '#ef6c00', '#d84315', '#bf360c',
    '#8338ec', '#7209b7', '#6a1b9a', '#4a148c', '#311b92',
    '#5e35b1', '#512da8', '#4527a0', '#7c4dff', '#651fff',
    '#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#0277bd',
    '#01579b', '#023e8a', '#0353a4', '#3a86ff', '#4361ee',
    '#1b5e20', '#2e7d32', '#388e3c', '#087f5b', '#0b7285',
    '#5d4037', '#4e342e', '#6d4c41', '#795548', '#8d6e63'
];

const raceCategories = [
    { id: 'short-trail', name: 'Kortdistanse (<42 km)' },
    { id: 'marathon-trail', name: 'Maraton (42–50 km)' },
    { id: '50k', name: '50 km' },
    { id: '50-miles', name: '80 km' },
    { id: '100k', name: '100 km' },
    { id: '100-miles', name: '100 miles (~160 km)' },
    { id: '100-miles-plus', name: '100+ miles (165+ km)' }
];
