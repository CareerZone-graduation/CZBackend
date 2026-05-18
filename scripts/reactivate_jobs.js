import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Job from '../src/models/Job.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from be/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

const getRandomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

const updateJobs = async () => {
    await connectDB();

    const now = new Date();
    // 1/12/2025 -> Dec 1, 2025
    const startDate = new Date('2025-05-15T00:00:00.000Z');
    // 2/2/2026 -> Feb 2, 2026
    const endDate = new Date('2026-12-02T23:59:59.999Z');

    try {
        // Find jobs that are either expired OR not active
        // User said: "nếu job nào hết hạn (quá deadline) thì giúp tôi update"
        // Also "làm cho job đang tuyển" implies general activation. 
        // We will target jobs with (deadline < now) AND/OR (status != 'ACTIVE')
        // We will act liberally to reactivate jobs.

        const query = {
            $or: [
                { deadline: { $lt: now } },
                { status: 'EXPIRED' },
            ]
        };

        const jobs = await Job.find(query).select('_id').lean();
        console.log(`Found ${jobs.length} jobs to update.`);

        if (jobs.length > 0) {
            const bulkOps = jobs.map(job => {
                const newDeadline = getRandomDate(startDate, endDate);
                return {
                    updateOne: {
                        filter: { _id: job._id },
                        update: { 
                            $set: { 
                                deadline: newDeadline, 
                                status: 'ACTIVE' 
                            } 
                        }
                    }
                };
            });

            const result = await Job.bulkWrite(bulkOps);
            console.log(`Successfully updated ${result.modifiedCount} jobs with new deadline between ${startDate.toISOString()} and ${endDate.toISOString()} and status ACTIVE.`);
        } else {
            console.log('No jobs to update.');
        }
    } catch (error) {
        console.error('Error updating jobs:', error);
    } finally {
        await mongoose.connection.close();
        console.log('DB connection closed');
        process.exit(0);
    }
};

updateJobs();
