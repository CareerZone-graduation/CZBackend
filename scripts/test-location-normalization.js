import 'dotenv/config.js';
import locationTree from '../src/data/oldtree.json' with { type: 'json' };
import { findBestMatch } from 'string-similarity';

// Test the location normalization logic with sample data
const locationData = {
    provinces: [],
    districts: {},
    communes: {},
};

const PREFIXES = /^(thanh pho|tp|tinh|quan|q|huyen|thi xa|tx|phuong|xa|thi tran|tt|District)\.?\s*/i;

function normalizeForComparison(s) {
    if (!s || typeof s !== 'string') return '';
    let x = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

    x = x.replace(PREFIXES, '').trim();

    if (/^\d+$/.test(x)) {
        x = String(parseInt(x, 10));
    }

    return x.replace(/\s+/g, '');
}

// Load location data
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
    });
});

function findBestMatchName(nameFromApi, officialNameObjects) {
    if (!nameFromApi || !officialNameObjects || officialNameObjects.length === 0) {
        return nameFromApi;
    }

    const normalizedApiName = normalizeForComparison(nameFromApi);
    const officialNormalizedNames = officialNameObjects.map(item => item.normalized);

    const directMatchIndex = officialNormalizedNames.indexOf(normalizedApiName);
    if (directMatchIndex > -1) {
        return officialNameObjects[directMatchIndex].original;
    }

    const ratings = findBestMatch(normalizedApiName, officialNormalizedNames);
    if (ratings.bestMatch.rating > 0.7) {
        const bestMatchIndex = ratings.bestMatchIndex;
        return officialNameObjects[bestMatchIndex].original;
    }

    return nameFromApi;
}

const mapLocationToStandard = (compound) => {
    if (!compound) {
        return { province: '', district: '', commune: '' };
    }

    const { province: rawProvince, district: rawDistrict } = compound;

    const mappedProvince = findBestMatchName(rawProvince, locationData.provinces);
    const districtObjects = locationData.districts[mappedProvince];
    const mappedDistrict = findBestMatchName(rawDistrict, districtObjects);

    return {
        province: mappedProvince,
        district: mappedDistrict,
    };
};

// Test cases
const testCases = [
    { province: 'TP.HCM', district: 'Q.1' },
    { province: 'tp hcm', district: 'quan 1' },
    { province: 'Ho Chi Minh', district: 'District 1' },
    { province: 'Hà Nội', district: 'Ba Đình' },
    { province: 'ha noi', district: 'ba dinh' },
    { province: 'Đà Nẵng', district: 'Hải Châu' },
    { province: 'da nang', district: 'hai chau' },
    { province: 'Tinh Binh Duong', district: 'Thu Dau Mot' },
    { province: 'Bình Dương', district: 'Thủ Dầu Một' },
];

console.log('=== Testing Location Normalization ===\n');

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}:`);
    console.log(`Input: ${JSON.stringify(testCase)}`);

    const result = mapLocationToStandard(testCase);
    console.log(`Output: ${JSON.stringify(result)}`);

    const hasChanges =
        result.province !== testCase.province ||
        result.district !== testCase.district;

    console.log(`Changes: ${hasChanges ? 'YES' : 'NO'}`);
    console.log('---');
});

console.log(`\nLoaded ${locationData.provinces.length} provinces for testing`);