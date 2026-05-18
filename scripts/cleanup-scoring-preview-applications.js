import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Application from '../src/models/Application.js';

dotenv.config();

const cleanupScoringPreviewApplications = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete all CV_SCORING_PREVIEW applications
    console.log('🗑️  Deleting CV_SCORING_PREVIEW applications...');
    const result = await Application.deleteMany({ 
      source: 'CV_SCORING_PREVIEW' 
    });
    console.log(`✅ Deleted ${result.deletedCount} CV_SCORING_PREVIEW applications`);

    // Drop the unique index manually
    console.log('🔧 Dropping old unique index...');
    try {
      await Application.collection.dropIndex('jobId_1_candidateProfileId_1');
      console.log('✅ Dropped old unique index');
    } catch (error) {
      console.log('ℹ️  Old index not found or already dropped:', error.message);
    }

    console.log('🎉 Cleanup completed successfully!');
    console.log('⚠️  Please restart your backend server to recreate the index with new rules');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupScoringPreviewApplications();
