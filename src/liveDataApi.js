// ─── CACHE HELPERS ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_TTL_OSM = 24 * 60 * 60 * 1000; // 24 hours

const CACHE_KEY_ECB = 'ecb_rate_cache';
const CACHE_KEY_EUROSTAT = 'eurostat_copi_cache';
const CACHE_KEY_HPI_SALE = 'eurostat_hpi_sale_cache';
const CACHE_KEY_HPI_RENT = 'eurostat_hpi_rent_cache';

function getCached(key, ttl = CACHE_TTL_MS) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < ttl) return data;
    sessionStorage.removeItem(key);
  } catch { /* ignore */ }
  return null;
}

function setCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

// ─── API URLs ───────────────────────────────────────────────────────────────

const ECB_API_URL =
  'https://data.ecb.europa.eu/data-api/v1/data/MIR/M.U2.B.A2C.AM.R.A.2250.EUR.N?lastNObservations=1&format=jsondata';

const EUROSTAT_API_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_copi_q?geo=IT&indic_bt=COPI&s_adj=NSA&unit=I15&lastTimePeriod=8&format=JSON';

const COST_REFERENCE_QUARTER = '2025-Q1';
const HPI_REFERENCE_QUARTER = '2025-Q1';

// ─── DISTRICT COORDINATES ───────────────────────────────────────────────────

export const DISTRICT_COORDINATES = {
  'Porta Nuova':  { lat: 45.4835, lon: 9.1903 },
  'Brera':        { lat: 45.4727, lon: 9.1870 },
  'Navigli':      { lat: 45.4500, lon: 9.1730 },
  'Isola':        { lat: 45.4920, lon: 9.1880 },
  'Città Studi':  { lat: 45.4780, lon: 9.2270 },
  'Lambrate':     { lat: 45.4850, lon: 9.2370 },
  'Loreto':       { lat: 45.4850, lon: 9.2150 },
  'Buenos Aires': { lat: 45.4780, lon: 9.2080 },
  'Garibaldi':    { lat: 45.4840, lon: 9.1860 },
  'Centrale':     { lat: 45.4870, lon: 9.2040 },
};

// ─── ECB RATE ───────────────────────────────────────────────────────────────

export async function fetchEcbRate() {
  const cached = getCached(CACHE_KEY_ECB);
  if (cached) return cached;

  const res = await fetch(ECB_API_URL);
  if (!res.ok) throw new Error(`ECB API error ${res.status}`);
  const json = await res.json();

  const series = json.dataSets?.[0]?.series;
  if (!series) throw new Error('ECB: no series data');
  const firstSeriesKey = Object.keys(series)[0];
  const observations = series[firstSeriesKey]?.observations;
  if (!observations) throw new Error('ECB: no observations');
  const lastObsKey = Object.keys(observations).pop();
  const rate = observations[lastObsKey]?.[0];

  if (typeof rate !== 'number' || rate <= 0 || rate >= 20) {
    throw new Error(`ECB: invalid rate ${rate}`);
  }

  const periods = json.structure?.dimensions?.observation?.[0]?.values;
  const period = periods?.[periods.length - 1]?.id || 'unknown';

  const result = { rate: Math.round(rate * 100) / 100, period };
  setCache(CACHE_KEY_ECB, result);
  return result;
}

// ─── EUROSTAT CONSTRUCTION COST INDEX ───────────────────────────────────────

export async function fetchConstructionCostIndex() {
  const cached = getCached(CACHE_KEY_EUROSTAT);
  if (cached) return cached;

  const res = await fetch(EUROSTAT_API_URL);
  if (!res.ok) throw new Error(`Eurostat API error ${res.status}`);
  const json = await res.json();

  const result = parseEurostatIndex(json, COST_REFERENCE_QUARTER);
  setCache(CACHE_KEY_EUROSTAT, result);
  return result;
}

// ─── EUROSTAT HOUSE PRICE INDEX (SALE) ──────────────────────────────────────

export async function fetchHousePriceIndex() {
  const cached = getCached(CACHE_KEY_HPI_SALE);
  if (cached) return cached;

  const res = await fetch(
    'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_q?geo=IT&purchase=TOTAL&unit=I15_NSA&lastTimePeriod=8&format=JSON'
  );
  if (!res.ok) throw new Error(`Eurostat HPI API error ${res.status}`);
  const json = await res.json();

  const result = parseEurostatIndex(json, HPI_REFERENCE_QUARTER);
  setCache(CACHE_KEY_HPI_SALE, result);
  return result;
}

// ─── EUROSTAT RENTAL PRICE INDEX ────────────────────────────────────────────

export async function fetchRentalPriceIndex() {
  const cached = getCached(CACHE_KEY_HPI_RENT);
  if (cached) return cached;

  const res = await fetch(
    'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_q?geo=IT&purchase=RENT&unit=I15_NSA&lastTimePeriod=8&format=JSON'
  );
  if (!res.ok) throw new Error(`Eurostat rental API error ${res.status}`);
  const json = await res.json();

  const result = parseEurostatIndex(json, HPI_REFERENCE_QUARTER);
  setCache(CACHE_KEY_HPI_RENT, result);
  return result;
}

// ─── SHARED EUROSTAT PARSER ─────────────────────────────────────────────────

function parseEurostatIndex(json, referenceQuarter) {
  const timeIndex = json.dimension?.time?.category?.index;
  if (!timeIndex) throw new Error('Eurostat: no time dimension');

  const sortedQuarters = Object.entries(timeIndex).sort((a, b) => a[1] - b[1]);
  const values = json.value || {};

  const refEntry = sortedQuarters.find(([q]) => q === referenceQuarter);
  const refValue = refEntry ? values[String(refEntry[1])] : null;

  let latestPeriod = null;
  let latestValue = null;
  for (let i = sortedQuarters.length - 1; i >= 0; i--) {
    const [q, idx] = sortedQuarters[i];
    const v = values[String(idx)];
    if (v != null) {
      latestPeriod = q;
      latestValue = v;
      break;
    }
  }

  if (latestValue == null || refValue == null) {
    throw new Error('Eurostat: missing index values');
  }

  const multiplier = latestValue / refValue;
  if (multiplier <= 0.5 || multiplier >= 2.0) {
    throw new Error(`Eurostat: implausible multiplier ${multiplier}`);
  }

  const pctChange = Math.round((multiplier - 1) * 1000) / 10;
  return { latestPeriod, multiplier: Math.round(multiplier * 1000) / 1000, pctChange };
}

// ─── OSM OVERPASS SCORES ────────────────────────────────────────────────────

export async function fetchOsmScores(district) {
  const coords = DISTRICT_COORDINATES[district];
  if (!coords) return null;

  const cacheKey = `osm_Milano_${district}`;
  const cached = getCached(cacheKey, CACHE_TTL_OSM);
  if (cached) return cached;

  const { lat, lon } = coords;
  const radius = 1000;

  const transportQuery = `[out:json][timeout:10];
(
  node["railway"="station"](around:${radius},${lat},${lon});
  node["railway"="halt"](around:${radius},${lat},${lon});
  node["station"="subway"](around:${radius},${lat},${lon});
  node["highway"="bus_stop"](around:${radius},${lat},${lon});
  node["railway"="tram_stop"](around:${radius},${lat},${lon});
);
out count;`;

  const amenitiesQuery = `[out:json][timeout:10];
(
  node["amenity"~"restaurant|cafe|bar"](around:${radius},${lat},${lon});
  node["shop"](around:${radius},${lat},${lon});
  node["amenity"~"school|university"](around:${radius},${lat},${lon});
  node["amenity"~"hospital|clinic|pharmacy"](around:${radius},${lat},${lon});
  node["leisure"~"park|garden"](around:${radius},${lat},${lon});
);
out count;`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const [transportRes, amenitiesRes] = await Promise.all([
      fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(transportQuery)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      }),
      fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(amenitiesQuery)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      }),
    ]);

    if (!transportRes.ok || !amenitiesRes.ok) {
      throw new Error('Overpass API error');
    }

    const transportJson = await transportRes.json();
    const amenitiesJson = await amenitiesRes.json();

    const transportCount = transportJson.elements?.[0]?.tags?.total
      ? parseInt(transportJson.elements[0].tags.total, 10)
      : (transportJson.elements?.length ?? 0);
    const amenitiesCount = amenitiesJson.elements?.[0]?.tags?.total
      ? parseInt(amenitiesJson.elements[0].tags.total, 10)
      : (amenitiesJson.elements?.length ?? 0);

    const transport = Math.min(10, Math.max(1, Math.round(transportCount / 15)));
    const amenities = Math.min(10, Math.max(1, Math.round(amenitiesCount / 50)));

    const result = { transport, amenities, transportCount, amenitiesCount };
    setCache(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}
