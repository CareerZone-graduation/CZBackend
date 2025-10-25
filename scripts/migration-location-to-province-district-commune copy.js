import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Job, RecruiterProfile } from '../src/models/index.js';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const migrateJobLocations = async () => {
  try {
    // Find jobs with the current structure, where location has 'ward' field but no 'district'
    const jobsToMigrate = await Job.find({ 
      'location.ward': { $exists: true },
      'location.district': { $exists: false }
    });

    if (jobsToMigrate.length === 0) {
      logger.info('No jobs with old location structure found.');
      return 0;
    }

    logger.info(`Found ${jobsToMigrate.length} jobs to migrate.`);

    let migratedCount = 0;
    for (const job of jobsToMigrate) {
      await Job.updateOne(
        { _id: job._id },
        [
          {
            $set: {
              'location.district': '$location.ward',
              'location.commune': ''
            }
          },
          {
            $unset: ['location.ward']
          }
        ]
      );

      migratedCount++;
      logger.info(`Migrated job ${migratedCount}/${jobsToMigrate.length} (ID: ${job._id})`);
    }

    return migratedCount;
  } catch (error) {
    logger.error('Error during job location migration:', error);
    throw error;
  }
};

const migrateRecruiterCompanyLocations = async () => {
  try {
    // Find recruiter profiles with company location having 'ward' field but no 'district'
    const recruitersToMigrate = await RecruiterProfile.find({ 
      'company.location.ward': { $exists: true },
      'company.location.district': { $exists: false }
    });

    if (recruitersToMigrate.length === 0) {
      logger.info('No recruiter companies with old location structure found.');
      return 0;
    }

    logger.info(`Found ${recruitersToMigrate.length} recruiter companies to migrate.`);

    let migratedCount = 0;
    for (const recruiter of recruitersToMigrate) {
      await RecruiterProfile.updateOne(
        { _id: recruiter._id },
        [
          {
            $set: {
              'company.location.district': '$company.location.ward',
              'company.location.commune': ''
            }
          },
          {
            $unset: ['company.location.ward']
          }
        ]
      );

      migratedCount++;
      logger.info(`Migrated recruiter company ${migratedCount}/${recruitersToMigrate.length} (ID: ${recruiter._id})`);
    }

    return migratedCount;
  } catch (error) {
    logger.error('Error during recruiter company location migration:', error);
    throw error;
  }
};

const migrateData = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected for location migration...');

    const jobsMigrated = await migrateJobLocations();
    const recruiterCompaniesMigrated = await migrateRecruiterCompanyLocations();

    const totalMigrated = jobsMigrated + recruiterCompaniesMigrated;
    
    if (totalMigrated === 0) {
      logger.info('No documents found with old location structure. Migration not needed.');
    } else {
      logger.info(`Location migration completed successfully! Total migrated: ${totalMigrated} documents (${jobsMigrated} jobs, ${recruiterCompaniesMigrated} recruiter companies)`);
    }
  } catch (error) {
    logger.error('Error during location migration:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
  }
};

migrateData();
