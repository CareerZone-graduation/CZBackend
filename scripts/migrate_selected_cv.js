import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const migrate = async () => {
    try {
        if (!process.env.DB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }

        await mongoose.connect(process.env.DB_URI);
        console.log('Connected to MongoDB');

        const collection = mongoose.connection.db.collection('users');

        console.log('Starting batch migration using aggregation pipeline...');

        // Find users who have selectedCvId field (and it's not null)
        // Update them efficiently using pipeline:
        // 1. Convert selectedCvId to array or merge with existing selectedCvIds
        // 2. Unset selectedCvId

        const result = await collection.updateMany(
            {
                selectedCvId: { $ne: null },
                role: 'candidate'
            },
            [
                {
                    $set: {
                        selectedCvIds: {
                            // Create array from selectedCvId, merging with existing array if present
                            $setUnion: [
                                { $ifNull: ["$selectedCvIds", []] },
                                ["$selectedCvId"]
                            ]
                        }
                    }
                },
                {
                    $unset: "selectedCvId"
                }
            ]
        );

        console.log(`Matched ${result.matchedCount} documents.`);
        console.log(`Modified ${result.modifiedCount} documents.`);

        console.log('Done.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
