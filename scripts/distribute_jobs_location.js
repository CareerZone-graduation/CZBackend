
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Job from '../src/models/Job.js';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load Data
const oldTreePath = path.join(__dirname, '../src/data/oldtree.json');
const rawData = fs.readFileSync(oldTreePath, 'utf-8');
const provincesData = JSON.parse(rawData);

// Configuration
const TARGET_HCM_RATIO = 0.6; // 60% in HCM
const COORD_SPREAD = 0.05; // +/- 0.05 degrees ~ 5km radius spread

// Province Mapping with Center Coordinates
const PROVINCE_COORDS = {
    "Thành phố Hồ Chí Minh": { lat: 10.762622, lng: 106.660172 },
    "Thành phố Hà Nội": { lat: 21.028511, lng: 105.854164 },
    "Thành phố Đà Nẵng": { lat: 16.054407, lng: 108.202167 },
    "Thành phố Cần Thơ": { lat: 10.045162, lng: 105.746857 },
    "Thành phố Hải Phòng": { lat: 20.844912, lng: 106.688084 },
    "Tỉnh Bình Dương": { lat: 11.160100, lng: 106.643300 },
    "Tỉnh Đồng Nai": { lat: 10.941600, lng: 106.826000 },
    "Tỉnh Khánh Hòa": { lat: 12.238791, lng: 109.196749 }, // Nha Trang
    "Tỉnh Lâm Đồng": { lat: 11.940419, lng: 108.458313 }, // Da Lat
    "Tỉnh Bà Rịa - Vũng Tàu": { lat: 10.345990, lng: 107.084260 },
    "Tỉnh Thừa Thiên Huế": { lat: 16.463713, lng: 107.590866 },
    "Tỉnh Bắc Ninh": { lat: 21.185670, lng: 106.074810 },
    "Tỉnh Nghệ An": { lat: 18.673322, lng: 105.692288 }, // Vinh
    "Tỉnh Quảng Ninh": { lat: 20.950481, lng: 107.073363 } // Ha Long
};

const PROVINCE_NAMES = Object.keys(PROVINCE_COORDS);

// Helper to get random item from array
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper to generate random coordinates near center
const getRandomCoords = (center) => {
    const latOffset = (Math.random() - 0.5) * COORD_SPREAD * 2;
    const lngOffset = (Math.random() - 0.5) * COORD_SPREAD * 2;
    return [
        center.lng + lngOffset, // Longitude first (GeoJSON)
        center.lat + latOffset
    ];
};

const distributeJobs = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.DB_URI);
        console.log('Connected.');

        const jobs = await Job.find({});
        console.log(`Found ${jobs.length} jobs. Updating...`);

        let updatedCount = 0;

        // Create a map for fast district lookup
        const provinceDistrictsMap = {};
        provincesData.forEach(p => {
            provinceDistrictsMap[p.name] = p.districts.map(d => d.name);
        });

        for (const job of jobs) {
            let targetProvinceName;
            let area;

            if (Math.random() < TARGET_HCM_RATIO) {
                targetProvinceName = "Thành phố Hồ Chí Minh";
                area = 'HO_CHI_MINH';
            } else {
                // Pick any other province from our list
                const otherProvinces = PROVINCE_NAMES.filter(n => n !== "Thành phố Hồ Chí Minh");
                targetProvinceName = getRandomItem(otherProvinces);

                if (targetProvinceName === "Thành phố Hà Nội") {
                    area = 'HA_NOI';
                } else {
                    area = 'OTHER';
                }
            }

            // Get District
            const districts = provinceDistrictsMap[targetProvinceName];
            let targetDistrict = "Quận 1"; // Default
            if (districts && districts.length > 0) {
                targetDistrict = getRandomItem(districts);
            }

            // Get Coordinates
            const center = PROVINCE_COORDS[targetProvinceName];
            const newCoords = getRandomCoords(center);

            // Update Job
            job.location = {
                province: targetProvinceName,
                district: targetDistrict,
                commune: '', // Can be improved if we had communes list per district easily accessible/mapped, but district is enough
                coordinates: {
                    type: 'Point',
                    coordinates: newCoords
                }
            };

            job.area = area;

            // Update basic address as well for display
            job.address = `${targetDistrict}, ${targetProvinceName}`;

            await job.save();
            process.stdout.write('.');
            updatedCount++;
        }

        console.log(`\nSuccessfully updated ${updatedCount} jobs.`);
        process.exit(0);
    } catch (error) {
        console.error('Error distributing jobs:', error);
        process.exit(1);
    }
};

distributeJobs();
