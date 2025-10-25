import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../src/config/index.js';
// Correctly resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root of CareerZone-BE
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import Job from '../src/models/Job.js'; // Adjust path to your Job model

const MONGODB_URI = 'mongodb://localhost:27018/careerzone?directConnection=true'
const MAX_DISPLACEMENT_KM = 20;

/**
 * Generates a random coordinate within a certain radius of an original coordinate.
 * @param {number} originalLon - The original longitude.
 * @param {number} originalLat - The original latitude.
 * @param {number} radiusKm - The maximum displacement radius in kilometers.
 * @returns {{lon: number, lat: number}} The new longitude and latitude.
 */
function getRandomCoordinate(originalLon, originalLat, radiusKm) {
  // Earth's radius in kilometers
  const earthRadiusKm = 6371;

  // Convert radius from kilometers to radians
  const radiusInRad = radiusKm / earthRadiusKm;

  // Generate a random angle and a random distance within the radius
  const randomAngle = Math.random() * 2 * Math.PI;
  const randomDistance = Math.sqrt(Math.random()) * radiusInRad; // sqrt for uniform distribution

  // Convert original coordinates to radians
  const latRad = originalLat * (Math.PI / 180);
  const lonRad = originalLon * (Math.PI / 180);

  // Calculate new latitude
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(randomDistance) +
    Math.cos(latRad) * Math.sin(randomDistance) * Math.cos(randomAngle)
  );

  // Calculate new longitude
  const newLonRad = lonRad + Math.atan2(
    Math.sin(randomAngle) * Math.sin(randomDistance) * Math.cos(latRad),
    Math.cos(randomDistance) - Math.sin(latRad) * Math.sin(newLatRad)
  );

  // Convert new coordinates back to degrees
  const newLat = newLatRad * (180 / Math.PI);
  const newLon = newLonRad * (180 / Math.PI);

  return { lon: newLon, lat: newLat };
}


const run = async () => {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in your .env file.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected successfully.');

    console.log('Fetching all jobs with coordinates...');
    const jobs = await Job.find({
      'location.coordinates.coordinates': { $exists: true, $ne: [] }
    }).lean();

    if (jobs.length === 0) {
      console.log('No jobs with coordinates found. Exiting.');
      return;
    }

    console.log(`Found ${jobs.length} jobs to update.`);
    let updatedCount = 0;
    const updatePromises = [];

    for (const job of jobs) {
      const [originalLon, originalLat] = job.location.coordinates.coordinates;

      // Skip if coordinates are invalid
      if (typeof originalLon !== 'number' || typeof originalLat !== 'number') {
        console.warn(`Skipping job ${job._id} due to invalid original coordinates.`);
        continue;
      }
      
      const { lon: newLon, lat: newLat } = getRandomCoordinate(originalLon, originalLat, MAX_DISPLACEMENT_KM);

      const updatePromise = Job.updateOne(
        { _id: job._id },
        {
          $set: {
            'location.coordinates.coordinates': [newLon, newLat],
          },
        }
      );
      updatePromises.push(updatePromise);
      updatedCount++;
      console.log(`Updating job ${job._id}: [${originalLon}, ${originalLat}] -> [${newLon}, ${newLat}]`);
    }

    await Promise.all(updatePromises);
    console.log(`\n✅ Successfully updated coordinates for ${updatedCount} jobs.`);

  } catch (error) {
    console.error('❌ An error occurred during the script execution:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

run();