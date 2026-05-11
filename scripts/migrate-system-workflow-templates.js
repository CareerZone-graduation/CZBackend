import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SYSTEM_TEMPLATES } from './seed-workflow-templates.js';
import { WorkflowTemplate } from '../src/models/index.js';

dotenv.config();

const MONGODB_URI = process.env.DB_URI || 'mongodb://localhost:27017/careerzone';

const migrateSystemWorkflowTemplates = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let updatedCount = 0;
    let insertedCount = 0;

    for (const template of SYSTEM_TEMPLATES) {
      const existing = await WorkflowTemplate.findOne({
        name: template.name,
        isSystemTemplate: true
      }).select('_id').lean();

      await WorkflowTemplate.findOneAndUpdate(
        { name: template.name, isSystemTemplate: true },
        template,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (existing) {
        updatedCount += 1;
        console.log(`♻️ Updated template: ${template.name}`);
      } else {
        insertedCount += 1;
        console.log(`🆕 Inserted template: ${template.name}`);
      }
    }

    console.log(`\n🎉 Migration done. Updated: ${updatedCount}, Inserted: ${insertedCount}`);
  } catch (error) {
    console.error('❌ Failed to migrate system workflow templates:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

migrateSystemWorkflowTemplates();
