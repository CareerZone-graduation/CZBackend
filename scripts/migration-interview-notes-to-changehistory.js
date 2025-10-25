/**
 * Migration script: Convert existing InterviewRoom.notes field to changeHistory array
 * This script will:
 * 1. Find all InterviewRoom documents that have notes
 * 2. Convert notes to changeHistory format
 * 3. Remove the old notes field
 */

import mongoose from 'mongoose';
import InterviewRoom from '../src/models/InterviewRoom.js';
import logger from '../src/utils/logger.js';

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/careerzone', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected for migration');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const migrateInterviewNotesToChangeHistory = async () => {
  try {
    console.log('🚀 Starting migration: InterviewRoom notes to changeHistory...');

    // Find all InterviewRoom documents that have notes field
    const interviewsWithNotes = await mongoose.connection.db
      .collection('interviewrooms')
      .find({ notes: { $exists: true, $ne: null, $ne: '' } })
      .toArray();

    console.log(`📊 Found ${interviewsWithNotes.length} interviews with notes to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const interview of interviewsWithNotes) {
      try {
        const changeHistoryEntry = {
          timestamp: interview.createdAt || new Date(),
          action: 'NOTE_ADDED',
          notes: interview.notes,
          actor: interview.recruiterId, // Assume recruiter added the original notes
        };

        // Update the document: add changeHistory and remove notes
        const result = await mongoose.connection.db
          .collection('interviewrooms')
          .updateOne(
            { _id: interview._id },
            {
              $set: {
                changeHistory: [changeHistoryEntry]
              },
              $unset: {
                notes: ""
              }
            }
          );

        if (result.modifiedCount > 0) {
          migratedCount++;
          console.log(`✅ Migrated interview ${interview._id}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error migrating interview ${interview._id}:`, error.message);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`✅ Successfully migrated: ${migratedCount} interviews`);
    console.log(`❌ Errors: ${errorCount} interviews`);
    console.log(`📊 Total processed: ${interviewsWithNotes.length} interviews`);

    // Add initial changeHistory entry for interviews without any history
    const interviewsWithoutHistory = await mongoose.connection.db
      .collection('interviewrooms')
      .find({ 
        changeHistory: { $exists: false },
        createdAt: { $exists: true }
      })
      .toArray();

    console.log(`\n📊 Found ${interviewsWithoutHistory.length} interviews without changeHistory`);

    let initializedCount = 0;
    for (const interview of interviewsWithoutHistory) {
      try {
        const initialEntry = {
          timestamp: interview.createdAt,
          action: 'CREATED',
          actor: interview.recruiterId
        };

        await mongoose.connection.db
          .collection('interviewrooms')
          .updateOne(
            { _id: interview._id },
            {
              $set: {
                changeHistory: [initialEntry]
              }
            }
          );

        initializedCount++;
      } catch (error) {
        console.error(`❌ Error initializing changeHistory for interview ${interview._id}:`, error.message);
      }
    }

    console.log(`✅ Initialized changeHistory for ${initializedCount} interviews`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await migrateInterviewNotesToChangeHistory();
    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default migrateInterviewNotesToChangeHistory;