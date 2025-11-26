import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Application from '../src/models/Application.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.DB_URI || 'mongodb://localhost:27018/careerzone?directConnection=true';

const migrate = async () => {
    try {
        console.log('Connecting to MongoDB...', MONGODB_URI);
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        console.log('Starting migration...');

        // 1. Remove candidateRating field from all documents
        console.log('Removing candidateRating field...');
        const unsetResult = await Application.updateMany(
            { candidateRating: { $exists: true } },
            { $unset: { candidateRating: "" } }
        );
        console.log(`Removed candidateRating field from ${unsetResult.modifiedCount} applications`);

        // 2. Map invalid statuses to valid ones
        const statusMappings = {
            'REVIEWING': 'PENDING',
            'INTERVIEWED': 'SCHEDULED_INTERVIEW',
            'WITHDRAWN': 'REJECTED',
            'HIRED': 'ACCEPTED',
            'ARCHIVED': 'REJECTED',
            'SHORTLISTED': 'SUITABLE'
        };

        for (const [oldStatus, newStatus] of Object.entries(statusMappings)) {
            console.log(`Migrating status ${oldStatus} to ${newStatus}...`);
            const result = await Application.updateMany(
                { status: oldStatus },
                {
                    $set: { status: newStatus },
                    $push: {
                        activityHistory: {
                            action: 'STATUS_UPDATE',
                            detail: `Hệ thống tự động cập nhật trạng thái từ ${oldStatus} sang ${newStatus}`,
                            timestamp: new Date()
                        }
                    }
                }
            );
            console.log(`Updated ${result.modifiedCount} applications from ${oldStatus} to ${newStatus}`);
        }

        // 3. Verify and fix any remaining invalid statuses
        const validStatuses = [
            'PENDING',
            'SUITABLE',
            'SCHEDULED_INTERVIEW',
            'OFFER_SENT',
            'ACCEPTED',
            'REJECTED',
        ];

        const invalidApps = await Application.find({ status: { $nin: validStatuses } });
        console.log(`Found ${invalidApps.length} applications with remaining invalid statuses`);

        for (const app of invalidApps) {
            console.log(`Fixing application ${app._id} with status ${app.status} -> PENDING`);
            app.status = 'PENDING';
            app.activityHistory.push({
                action: 'STATUS_UPDATE',
                detail: `Hệ thống reset trạng thái không hợp lệ (${app.status}) về PENDING`,
                timestamp: new Date()
            });
            await app.save();
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
