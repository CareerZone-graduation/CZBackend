import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Job } from './src/models/index.js';
import connectDB from './src/utils/connectDB.js';
import logger from './src/utils/logger.js';

dotenv.config();

const migrateData = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected for migration...');

    // Find documents with the old structure, where location is an object with a 'city' field
    const jobsToMigrate = await Job.find({ 'location.city': { $exists: true } });

    if (jobsToMigrate.length === 0) {
      logger.info('No jobs with the old location schema found. Migration not needed.');
      return;
    }

    logger.info(`Found ${jobsToMigrate.length} jobs to migrate.`);

    let migratedCount = 0;
    for (const job of jobsToMigrate) {
      // Store the old values
      const oldLocation = job.location;
      
      // Perform the update
      await Job.updateOne(
        { _id: job._id },
        [ // Using aggregation pipeline for complex updates
          {
            $set: {
              // Set the new top-level address
              address: '$location.address',
              // Set the new location object
              'location.province': '$location.city',
              'location.ward': '$location.district'
            }
          },
          {
            // Unset the old fields within the location object
            $unset: [
              'location.city',
              'location.district',
              'location.address'
            ]
          }
        ]
      );

      migratedCount++;
      logger.info(`Migrated job ${migratedCount}/${jobsToMigrate.length} (ID: ${job._id})`);
    }

    logger.info('Data migration completed successfully!');
  } catch (error) {
    logger.error('Error during data migration:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
  }
};

migrateData();
