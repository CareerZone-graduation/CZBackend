import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const removeJobGeocodeFields = async (db) => {
  try {
    const jobsCollection = db.collection('jobs');
    
    // Check how many jobs have geocode fields
    const jobsCount = await jobsCollection.countDocuments({
      $or: [
        { 'location.geocodeAt': { $exists: true } },
        { 'location.geocodeNote': { $exists: true } },
        { 'location.geocodeProvider': { $exists: true } },
        { 'location.geocodeStatus': { $exists: true } }
      ]
    });

    if (jobsCount === 0) {
      logger.info('No jobs with geocode fields found.');
      return 0;
    }

    logger.info(`Found ${jobsCount} jobs with geocode fields to remove.`);

    // Remove the geocode fields from all jobs using native MongoDB
    const result = await jobsCollection.updateMany(
      {},
      {
        $unset: {
          'location.geocodeAt': 1,
          'location.geocodeNote': 1,
          'location.geocodeProvider': 1,
          'location.geocodeStatus': 1
        }
      }
    );

    logger.info(`Removed geocode fields from ${result.modifiedCount} jobs.`);
    return result.modifiedCount;
  } catch (error) {
    logger.error('Error during job geocode fields removal:', error);
    throw error;
  }
};

const removeRecruiterGeocodeFields = async (db) => {
  try {
    const recruitersCollection = db.collection('recruiterprofiles');
    
    // Check how many recruiter profiles have geocode fields
    const recruitersCount = await recruitersCollection.countDocuments({
      $or: [
        { 'company.location.geocodeAt': { $exists: true } },
        { 'company.location.geocodeNote': { $exists: true } },
        { 'company.location.geocodeProvider': { $exists: true } },
        { 'company.location.geocodeStatus': { $exists: true } }
      ]
    });

    if (recruitersCount === 0) {
      logger.info('No recruiter profiles with geocode fields found.');
      return 0;
    }

    logger.info(`Found ${recruitersCount} recruiter profiles with geocode fields to remove.`);

    // Remove the geocode fields from all recruiter profiles using native MongoDB
    const result = await recruitersCollection.updateMany(
      {},
      {
        $unset: {
          'company.location.geocodeAt': 1,
          'company.location.geocodeNote': 1,
          'company.location.geocodeProvider': 1,
          'company.location.geocodeStatus': 1
        }
      }
    );

    logger.info(`Removed geocode fields from ${result.modifiedCount} recruiter profiles.`);
    return result.modifiedCount;
  } catch (error) {
    logger.error('Error during recruiter geocode fields removal:', error);
    throw error;
  }
};

const removeGeocodeFields = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected for geocode fields removal...');

    // Get native MongoDB database instance
    const db = mongoose.connection.db;

    const jobsUpdated = await removeJobGeocodeFields(db);
    const recruitersUpdated = await removeRecruiterGeocodeFields(db);

    const totalUpdated = jobsUpdated + recruitersUpdated;
    
    if (totalUpdated === 0) {
      logger.info('No documents found with geocode fields. Removal not needed.');
    } else {
      logger.info(`Geocode fields removal completed successfully! Total updated: ${totalUpdated} documents (${jobsUpdated} jobs, ${recruitersUpdated} recruiter profiles)`);
    }

    // Verify removal using native MongoDB
    const jobsCollection = db.collection('jobs');
    const recruitersCollection = db.collection('recruiterprofiles');

    const remainingJobsWithGeocode = await jobsCollection.countDocuments({
      $or: [
        { 'location.geocodeAt': { $exists: true } },
        { 'location.geocodeNote': { $exists: true } },
        { 'location.geocodeProvider': { $exists: true } },
        { 'location.geocodeStatus': { $exists: true } }
      ]
    });

    const remainingRecruitersWithGeocode = await recruitersCollection.countDocuments({
      $or: [
        { 'company.location.geocodeAt': { $exists: true } },
        { 'company.location.geocodeNote': { $exists: true } },
        { 'company.location.geocodeProvider': { $exists: true } },
        { 'company.location.geocodeStatus': { $exists: true } }
      ]
    });

    logger.info(`Verification: ${remainingJobsWithGeocode} jobs and ${remainingRecruitersWithGeocode} recruiter profiles still have geocode fields.`);

  } catch (error) {
    logger.error('Error during geocode fields removal:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
  }
};

removeGeocodeFields();
