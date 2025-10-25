import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Job from '../src/models/Job.js';
import RecruiterProfile from '../src/models/RecruiterProfile.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const oldTreePath = path.join(__dirname, '../src/data/oldtree.json');
const oldTree = JSON.parse(fs.readFileSync(oldTreePath, 'utf-8'));

const locationMap = new Map();
oldTree.forEach(province => {
    const districtMap = new Map();
    province.districts.forEach(district => {
        districtMap.set(district.name, district.communes || []);
    });
    locationMap.set(province.name, districtMap);
});

const findDistrictAndCommune = (provinceName, wardName) => {
    const districtMap = locationMap.get(provinceName);
    if (districtMap) {
        for (const [districtName, communes] of districtMap.entries()) {
            if (communes.includes(wardName)) {
                return { district: districtName, commune: wardName };
            }
        }
        // Fallback for cases where ward is a district
        if (districtMap.has(wardName)) {
            return { district: wardName, commune: null };
        }
    }
    return { district: wardName, commune: null }; // Fallback
};


const migrateJobs = async () => {
    logger.info('Starting job migration...');
    const jobs = await Job.find({ 'location.ward': { $exists: true } });
    let updatedCount = 0;

    for (const job of jobs) {
        const { province, ward } = job.location;
        if (province && ward) {
            const { district, commune } = findDistrictAndCommune(province, ward);
            
            await Job.updateOne(
                { _id: job._id },
                {
                    $set: {
                        'location.district': district,
                        'location.commune': commune,
                    },
                    $unset: {
                        'location.ward': ''
                    }
                }
            );
            updatedCount++;
        }
    }
    logger.info(`Migrated ${updatedCount} jobs.`);
};

const migrateRecruiterProfiles = async () => {
    logger.info('Starting recruiter profile migration...');
    const profiles = await RecruiterProfile.find({ 'company.location.ward': { $exists: true } });
    let updatedCount = 0;

    for (const profile of profiles) {
        const { province, ward } = profile.company.location;
        if (province && ward) {
            const { district, commune } = findDistrictAndCommune(province, ward);

            await RecruiterProfile.updateOne(
                { _id: profile._id },
                {
                    $set: {
                        'company.location.district': district,
                        'company.location.commune': commune,
                    },
                    $unset: {
                        'company.location.ward': ''
                    }
                }
            );
            updatedCount++;
        }
    }
    logger.info(`Migrated ${updatedCount} recruiter profiles.`);
};


const runMigration = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        logger.info('MongoDB connected');

        await migrateJobs();
        await migrateRecruiterProfiles();

    } catch (error) {
        logger.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        logger.info('MongoDB disconnected');
    }
};

runMigration();
