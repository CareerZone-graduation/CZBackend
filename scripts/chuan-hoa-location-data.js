import 'dotenv/config.js';
import { MongoClient } from 'mongodb';
import locationTree from '../src/data/oldtree.json' with { type: 'json' };
import { findBestMatch } from 'string-similarity';

 
  // DB_URI= "mongodb://localhost:27017/?directConnection=true",
// const  DB_URI= "mongodb://localhost:27017/";
const DB_URI= "mongodb+srv://lienhuetien01_db_user:iOpfkbGdqH3RyWu7@cluster0.iah0c5u.mongodb.net/";
const MONGODB_DB = "careerzone";
const DRY_RUN = 'false';


// Location data structure
const locationData = {
  provinces: [],
  districts: {},
  communes: {},
};

// Prefix patterns to remove
const PREFIXES = /^(thanh pho|tp|tinh|quan|q|huyen|thi xa|tx|phuong|xa|thi tran|tt)\.?\s*/i;

function normalizeForComparison(s) {
  if (!s || typeof s !== 'string') return '';
  let x = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // thay mọi ký tự không chữ/số thành khoảng trắng
    .trim();
  
  // cắt tiền tố ở đầu (thành phố, quận, huyện, …)
  x = x.replace(PREFIXES, '').trim();
  
  // nếu còn lại toàn số thì parse thành số để loại bỏ 0 ở đầu
  if (/^\d+$/.test(x)) {
    x = String(parseInt(x, 10)); // "01" -> "1"
  }
  
  // bỏ khoảng trắng cuối cùng để so sánh
  return x.replace(/\s+/g, '');
}

// Load and process location data
console.log('Loading location data from oldtree.json...');
locationTree.forEach(province => {
  const provinceName = province.name;
  locationData.provinces.push({
    original: provinceName,
    normalized: normalizeForComparison(provinceName)
  });

  const districtList = [];
  locationData.districts[provinceName] = districtList;

  (province.districts || []).forEach(district => {
    const districtName = district.name;
    districtList.push({
      original: districtName,
      normalized: normalizeForComparison(districtName)
    });

    const communeList = [];
    locationData.communes[`${provinceName}_${districtName}`] = communeList;

    (district.communes || []).forEach(communeName => {
      communeList.push({
        original: communeName,
        normalized: normalizeForComparison(communeName)
      });
    });
  });
});

function findBestMatchName(nameFromApi, officialNameObjects, debug = false) {
  if (debug) {
    console.log(`\n[Debug] Bắt đầu tìm kiếm cho: "${nameFromApi}"`);
  }
  
  if (!nameFromApi || !officialNameObjects || officialNameObjects.length === 0) {
    return nameFromApi;
  }

  const normalizedApiName = normalizeForComparison(nameFromApi);
  const officialNormalizedNames = officialNameObjects.map(item => item.normalized);

  // Direct match first
  const directMatchIndex = officialNormalizedNames.indexOf(normalizedApiName);
  if (directMatchIndex > -1) {
    if (debug) {
      console.log(`[Direct Match] "${nameFromApi}" -> "${officialNameObjects[directMatchIndex].original}"`);
    }
    return officialNameObjects[directMatchIndex].original;
  }

  // Fuzzy match with threshold
  const ratings = findBestMatch(normalizedApiName, officialNormalizedNames);
  if (ratings.bestMatch.rating > 0.7) {
    const bestMatchIndex = ratings.bestMatchIndex;
    if (debug) {
      console.log(`[Fuzzy Match] "${nameFromApi}" -> "${officialNameObjects[bestMatchIndex].original}" (score: ${ratings.bestMatch.rating})`);
    }
    return officialNameObjects[bestMatchIndex].original;
  }

  if (debug) {
    console.log(`[No Match] "${nameFromApi}" - keeping original`);
  }
  return nameFromApi;
}

// Main normalization function
const mapLocationToStandard = (compound) => {
  if (!compound) {
    return { province: '', district: '', commune: '' };
  }

  const { province: rawProvince, district: rawDistrict, commune: rawCommune } = compound;

  // Step 1: Find exact province from oldtree.json
  const mappedProvince = findBestMatchName(rawProvince, locationData.provinces);

  // Step 2: Use found province to get correct district list
  const districtObjects = locationData.districts[mappedProvince] || [];
  const mappedDistrict = findBestMatchName(rawDistrict, districtObjects);

  // Step 3: Use both province and district to get correct commune list
  const communeObjects = locationData.communes[`${mappedProvince}_${mappedDistrict}`] || [];
  const mappedCommune = findBestMatchName(rawCommune, communeObjects);

  return {
    province: mappedProvince,
    district: mappedDistrict,
    commune: mappedCommune,
  };
};

// Collections to process
const COLLECTIONS_TO_PROCESS = [
  {
    name: 'recruiterprofiles',
    locationPath: 'company.location',
    displayName: 'Recruiter Profiles'
  },
  {
    name: 'candidateprofiles', 
    locationPath: 'location',
    displayName: 'Candidate Profiles'
  },
  {
    name: 'jobs',
    locationPath: 'location',
    displayName: 'Jobs'
  }
];

async function normalizeLocationData() {
  const client = new MongoClient(DB_URI, { maxPoolSize: 10 });
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(MONGODB_DB);
    
    for (const collection of COLLECTIONS_TO_PROCESS) {
      console.log(`\n=== Processing ${collection.displayName} (${collection.name}) ===`);
      
      const col = db.collection(collection.name);
      
      // Check if collection exists
      const collections = await db.listCollections({ name: collection.name }).toArray();
      if (collections.length === 0) {
        console.log(`Collection ${collection.name} does not exist, skipping...`);
        continue;
      }
      
      // Find documents with location data that needs normalization
      const query = {
        [`${collection.locationPath}.province`]: { $exists: true, $ne: "" }
      };
      
      const cursor = col.find(query, { 
        projection: { 
          _id: 1, 
          [collection.locationPath]: 1 
        } 
      });
      
      const bulk = [];
      let total = 0, updated = 0, unchanged = 0;
      
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        total++;
        
        // Get current location data
        const locationPath = collection.locationPath.split('.');
        let currentLocation = doc;
        for (const path of locationPath) {
          currentLocation = currentLocation?.[path];
        }
        
        if (!currentLocation) {
          console.log(`[SKIP] ${doc._id} - No location data found`);
          continue;
        }
        
        const { province: currentProvince, district: currentDistrict, commune: currentCommune } = currentLocation;
        
        // Normalize the location data
        const normalizedLocation = mapLocationToStandard({
          province: currentProvince,
          district: currentDistrict,
          commune: currentCommune
        });
        
        // Check if any changes were made
        const hasChanges = 
          normalizedLocation.province !== currentProvince ||
          normalizedLocation.district !== currentDistrict ||
          normalizedLocation.commune !== currentCommune;
        
        if (hasChanges) {
          console.log(`[UPDATE] ${doc._id}`);
          console.log(`  Province: "${currentProvince}" -> "${normalizedLocation.province}"`);
          console.log(`  District: "${currentDistrict}" -> "${normalizedLocation.district}"`);
          console.log(`  Commune: "${currentCommune}" -> "${normalizedLocation.commune}"`);
          
          const updateFields = {};
          updateFields[`${collection.locationPath}.province`] = normalizedLocation.province;
          updateFields[`${collection.locationPath}.district`] = normalizedLocation.district;
          updateFields[`${collection.locationPath}.commune`] = normalizedLocation.commune;
          updateFields[`${collection.locationPath}.normalizedAt`] = new Date();
          
          if (DRY_RUN !== 'true') {
            bulk.push({
              updateOne: {
                filter: { _id: doc._id },
                update: { $set: updateFields }
              }
            });
            
            // Execute bulk operations in batches
            if (bulk.length >= 500) {
              await col.bulkWrite(bulk, { ordered: false });
              bulk.length = 0;
            }
          }
          
          updated++;
        } else {
          unchanged++;
        }
      }
      
      // Execute remaining bulk operations
      if (bulk.length && DRY_RUN !== 'true') {
        await col.bulkWrite(bulk, { ordered: false });
      }
      
      console.log(`\n${collection.displayName} Summary:`);
      console.log(`  Total documents: ${total}`);
      console.log(`  Updated: ${updated}`);
      console.log(`  Unchanged: ${unchanged}`);
      
      if (DRY_RUN === 'true') {
        console.log(`  [DRY RUN] No actual changes were made`);
      }
    }
    
  } catch (error) {
    console.error('Error during normalization:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the script
console.log('=== Location Data Normalization Script ===');
console.log(`Database: ${MONGODB_DB}`);
console.log(`Dry Run: ${DRY_RUN}`);
console.log(`Loaded ${locationData.provinces.length} provinces from oldtree.json\n`);

normalizeLocationData().catch(console.error);