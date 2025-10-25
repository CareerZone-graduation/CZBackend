/**
 * Migration Script: Add hiddenSections field to existing CVs
 * 
 * Run this script once to update all existing CVs in the database
 * to include the new hiddenSections field.
 * 
 * Usage:
 *   node scripts/migrate-add-hidden-sections.js
 */

import mongoose from 'mongoose';
import CV from '../src/models/CV.js';
import config from '../src/config/index.js';

const migrateHiddenSections = async () => {
  try {
    console.log('🔄 Starting migration: Add hiddenSections field...');
    
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all CVs that don't have hiddenSections field
    const cvsWithoutHiddenSections = await CV.find({
      'cvData.hiddenSections': { $exists: false }
    });

    console.log(`📊 Found ${cvsWithoutHiddenSections.length} CVs without hiddenSections field`);

    if (cvsWithoutHiddenSections.length === 0) {
      console.log('✅ All CVs already have hiddenSections field. No migration needed.');
      process.exit(0);
    }

    // Update each CV
    let successCount = 0;
    let errorCount = 0;

    for (const cv of cvsWithoutHiddenSections) {
      try {
        cv.cvData.hiddenSections = [];
        await cv.save();
        successCount++;
        console.log(`✅ Updated CV: ${cv._id} (${cv.title})`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to update CV: ${cv._id}`, error.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successfully updated: ${successCount} CVs`);
    console.log(`   ❌ Failed: ${errorCount} CVs`);
    console.log(`   📝 Total processed: ${cvsWithoutHiddenSections.length} CVs`);

    if (errorCount === 0) {
      console.log('\n🎉 Migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with some errors. Please check the logs above.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
};

// Run migration
migrateHiddenSections();
