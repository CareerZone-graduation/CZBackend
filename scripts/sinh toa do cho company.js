import 'dotenv/config.js';
import { MongoClient } from 'mongodb';
import crypto from 'crypto';

const {
  MONGODB_URI="mongodb://localhost:27017",
  MONGODB_DB="careerzone2",
  COLLECTION = 'jobs',
  RADIUS_M = '800',
  DRY_RUN = 'false',
} = process.env;


/** ====== 1) Bảng tâm tỉnh/thành (lng, lat) ====== */
const PROVINCE_CENTERS = [
  { name: 'Hà Nội',                lng: 105.834160, lat: 21.027764 },
  { name: 'Thành phố Hồ Chí Minh', lng: 106.660172, lat: 10.762622 },
  { name: 'Đà Nẵng',               lng: 108.220741, lat: 16.067783 },
  { name: 'Hải Phòng',             lng: 106.688084, lat: 20.844912 },
  { name: 'Cần Thơ',               lng: 105.783569, lat: 10.045162 },
  { name: 'Bình Dương',            lng: 106.652001, lat: 10.980460 },
  { name: 'Đồng Nai',              lng: 107.168000, lat: 10.945300 },
  { name: 'Khánh Hòa',             lng: 109.196748, lat: 12.238791 },
  { name: 'Lâm Đồng',              lng: 108.441932, lat: 11.940419 },
  { name: 'Quảng Ninh',            lng: 107.084556, lat: 20.971197 },
  { name: 'Thừa Thiên Huế',        lng: 107.595467, lat: 16.463713 },
  { name: 'Nghệ An',               lng: 105.692320, lat: 18.673370 },
  { name: 'Thanh Hóa',             lng: 105.778810, lat: 19.806690 },
  { name: 'Bắc Ninh',              lng: 106.076320, lat: 21.186080 },
  { name: 'Hải Dương',             lng: 106.316040, lat: 20.938590 },
  { name: 'Quảng Nam',             lng: 108.044540, lat: 15.573600 },
  { name: 'An Giang',              lng: 105.170000, lat: 10.521583 },
  { name: 'Kiên Giang',            lng: 105.196080, lat: 10.012450 },
  { name: 'Bà Rịa - Vũng Tàu',     lng: 107.084259, lat: 10.346000 },
  { name: 'Long An',               lng: 106.405910, lat: 10.539000 },
  // ... bổ sung nốt 63/63 nếu cần
];

/** Fallback mặc định: Hà Nội */
const DEFAULT_FALLBACK = PROVINCE_CENTERS.find(p => p.name === 'Hà Nội');

/** Alias để khớp tỉnh */
const PROVINCE_ALIASES = {
  'tp.hcm': 'Thành phố Hồ Chí Minh',
  'tphcm': 'Thành phố Hồ Chí Minh',
  'tp hcm': 'Thành phố Hồ Chí Minh',
  'hcm': 'Thành phố Hồ Chí Minh',
  'sai gon': 'Thành phố Hồ Chí Minh',
  'tphà nội': 'Hà Nội',
};

function normalizeName(s) {
  if (!s || typeof s !== 'string') return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^(tinh|thanh pho|tp)\.?/i, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const PROV_BY_NORM = (() => {
  const map = new Map();
  for (const p of PROVINCE_CENTERS) map.set(normalizeName(p.name), p);
  for (const [alias, proper] of Object.entries(PROVINCE_ALIASES)) {
    const target = PROVINCE_CENTERS.find(x => x.name === proper);
    if (target) map.set(normalizeName(alias), target);
  }
  const hcm = PROVINCE_CENTERS.find(x => x.name === 'Thành phố Hồ Chí Minh');
  if (hcm) map.set('ho chi minh', hcm);
  return map;
})();

/** ====== 2) Jitter quanh tâm (m -> độ) ====== */
function randomPointAround(lng, lat, radiusMeters, seedStr) {
  const seed = seedStr
    ? crypto.createHash('md5').update(seedStr).digest().readUInt32LE(0)
    : Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);
  const r = radiusMeters * Math.sqrt(rng());
  const theta = 2 * Math.PI * rng();
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
  const newLat = lat + dLat * Math.sin(theta);
  const newLng = lng + dLng * Math.cos(theta);
  return [newLng, newLat];
}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7, t|61);return ((t^t>>>14)>>>0)/4294967296;}}

/** ====== 3) Main ====== */
const R = Math.max(50, parseInt(RADIUS_M, 10) || 800); // >= 50m

(async () => {
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await client.connect();
  const db = client.db("careerzone2");
  const col = db.collection(COLLECTION);

  if (DRY_RUN !== 'true') {
    await col.createIndex({ "location.coordinates": "2dsphere" });
  }

  const cursor = col.find({
    $or: [
      { "location.coordinates": { $exists: false } },
      { "location.coordinates": null }
    ],
    "location.province": { $exists: true, $ne: "" }
  }, { projection: { _id: 1, title: 1, location: 1 } });

  const bulk = [];
  let total = 0, ok = 0, fallback = 0;

  while (await cursor.hasNext()) {
    const job = await cursor.next();
    total++;

    const rawProv = job?.location?.province || '';
    const normProv = normalizeName(rawProv);
    let center = PROV_BY_NORM.get(normProv);

    let status = 'SEEDED_PROVINCE_JITTER';
    let note = `seed by province center + jitter <= ${R}m`;

    if (!center) {
      // Fallback về Hà Nội
      center = DEFAULT_FALLBACK;
      status = 'SEEDED_FALLBACK_HANOI';
      note = `fallback to Hanoi center + jitter <= ${R}m (raw province: "${rawProv}")`;
      fallback++;
      console.log(`[FALLBACK] ${job._id} | Province không khớp: "${rawProv}" -> dùng Hà Nội`);
    } else {
      ok++;
      console.log(`[OK] ${job._id} | ${rawProv} -> dùng tâm tỉnh`);
    }

    const coords = randomPointAround(center.lng, center.lat, R, String(job._id));
    const update = {
      "location.coordinates": { type: "Point", coordinates: coords },
      "location.geocodeStatus": status,
      "location.geocodeProvider": "offline-province-center",
      "location.geocodeAt": new Date(),
      "location.geocodeNote": note
    };

    if (DRY_RUN !== 'true') {
      bulk.push({ updateOne: { filter: { _id: job._id }, update: { $set: update } } });
      if (bulk.length >= 500) {
        await col.bulkWrite(bulk, { ordered: false });
        bulk.length = 0;
      }
    }
  }

  if (bulk.length && DRY_RUN !== 'true') {
    await col.bulkWrite(bulk, { ordered: false });
  }

  console.log(`Tổng: ${total} | Dùng tâm tỉnh: ${ok} | Fallback Hà Nội: ${fallback}`);
  await client.close();
})();
