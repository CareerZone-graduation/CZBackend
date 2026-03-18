import locationTree from '../data/oldtree.json' with { type: 'json' };
import { findBestMatch } from 'string-similarity';

/**
 * Prefix patterns to remove for comparison
 */
const PREFIXES = /^(thanh pho|tp|tinh|quan|q|huyen|thi xa|tx|phuong|xa|thi tran|tt)\.?\s*/i;

/**
 * Normalizes a string for location comparison
 * Removes accents, lowercases, removes prefixes, and trims spaces
 * @param {string} s - String to normalize
 * @returns {string} Normalized string
 */
function normalizeForComparison(s) {
    if (!s || typeof s !== 'string') return '';
    let x = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // ignore accents
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ') // every non-alphanumeric to space
        .trim();

    // remote prefixes at the start
    x = x.replace(PREFIXES, '').trim();

    // handle numbers (remove leading zeros)
    if (/^\d+$/.test(x)) {
        x = String(parseInt(x, 10)); // "01" -> "1"
    }

    // consolidate whitespace
    return x.replace(/\s+/g, '');
}

// Pre-process location data for faster lookup
const locationData = {
    provinces: [],
    districts: {},
    communes: {},
};

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

/**
 * Finds the best matching official name for a given input name
 * @param {string} inputName - The name to find a match for
 * @param {Array<{original: string, normalized: string}>} officialNameObjects - List of official names
 * @returns {string} The original official name if match found, else inputName
 */
function findBestMatchName(inputName, officialNameObjects) {
    if (!inputName || !officialNameObjects || officialNameObjects.length === 0) {
        return inputName;
    }

    const normalizedInput = normalizeForComparison(inputName);
    const officialNormalizedNames = officialNameObjects.map(item => item.normalized);

    // Direct match first
    const directMatchIndex = officialNormalizedNames.indexOf(normalizedInput);
    if (directMatchIndex > -1) {
        return officialNameObjects[directMatchIndex].original;
    }

    // Fuzzy match with threshold
    const ratings = findBestMatch(normalizedInput, officialNormalizedNames);
    if (ratings.bestMatch.rating > 0.7) {
        return officialNameObjects[ratings.bestMatchIndex].original;
    }

    return inputName;
}

/**
 * Normalizes location data (province, district, commune) based on official tree
 * @param {object} location - { province, district, commune }
 * @returns {object} Standardized { province, district, commune }
 */
export const normalizeLocation = (location) => {
    if (!location) {
        return { province: '', district: '', commune: '' };
    }

    const { province: rawProvince, district: rawDistrict, commune: rawCommune } = location;

    // Step 1: Find matching province
    const mappedProvince = findBestMatchName(rawProvince, locationData.provinces);

    // Step 2: Find matching district within that province
    const districtObjects = locationData.districts[mappedProvince] || [];
    const mappedDistrict = findBestMatchName(rawDistrict, districtObjects);

    // Step 3: Find matching commune within that province and district
    const communeObjects = locationData.communes[`${mappedProvince}_${mappedDistrict}`] || [];
    const mappedCommune = findBestMatchName(rawCommune, communeObjects);

    return {
        province: mappedProvince,
        district: mappedDistrict,
        commune: mappedCommune,
    };
};

/**
 * Helper to get all official provinces
 */
export const getProvinces = () => locationData.provinces.map(p => p.original);

/**
 * Helper to get districts for a province
 */
export const getDistricts = (provinceName) => {
    const normalizedProvince = findBestMatchName(provinceName, locationData.provinces);
    return (locationData.districts[normalizedProvince] || []).map(d => d.original);
};
