import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import CandidateProfile from '../src/models/CandidateProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading .env from project root (one level up from scripts)
dotenv.config({ path: path.join(__dirname, '../.env') });

const migrateExperienceLevel = async () => {
    try {
        const uri = process.env.DB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const profiles = await CandidateProfile.find({});
        console.log(`Found ${profiles.length} profiles to check.`);

        let updatedCount = 0;

        for (const profile of profiles) {
            console.log(profile.fullname, "  ",profile.workPreferences.experienceLevel);
            // Check if experienceLevel is a string (old format)
            // Mongoose might auto-cast it to array if schema changed, but we want to be sure
            // Access via ._doc or strict lean query is better but here we iterate documents.
            // Since we updated schema, accessing profile.experienceLevel might return ['VALUE'] or 'VALUE' depending on how Mongoose loaded it.
            // But let's check raw value or safe check.

            const currentLevel = profile.workPreferences.experienceLevel;

            // Log for debugging
            // console.log(`Profile ${profile._id}: current level is ${JSON.stringify(currentLevel)}`);

            let needsUpdate = false;
            let newLevel = [];

            if (typeof currentLevel === 'string') {
                // It's a single string, convert to array
                newLevel = [currentLevel];
                needsUpdate = true;
            } else if (Array.isArray(currentLevel)) {
                // Already array, assume it's good (or empty)
                // Optionally filter valid enums if needed
                newLevel = currentLevel;
                // needsUpdate = true;
                // console.log(`Profile ${profile._id} is already array.`);
            } else if (!currentLevel) {
                // Undefined or null, make it empty array
                newLevel = [];
                needsUpdate = true;
            }
            console.log("newLevel",newLevel);

            if (needsUpdate) {
                // Use updateOne to bypass schema validation strictly or just force set
                await CandidateProfile.updateOne(
                    { _id: profile._id },
                    { $set: { 'workPreferences.experienceLevel': newLevel } }
                );
                updatedCount++;
                console.log(`Updated profile ${profile._id} from "${currentLevel}" to ${JSON.stringify(newLevel)}`);
            }
        }

        console.log(`Migration completed. Updated ${updatedCount} profiles.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrateExperienceLevel();
