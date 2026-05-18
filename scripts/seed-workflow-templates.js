import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { WorkflowTemplate } from '../src/models/index.js';

dotenv.config();

const MONGODB_URI = process.env.DB_URI || 'mongodb://localhost:27017/careerzone';

export const SYSTEM_TEMPLATES = [
  {
    name: 'Basic Recruitment',
    description: 'Quy trình cơ bản: Mới ứng tuyển → AI sàng lọc CV → Đạt điều kiện phỏng vấn / Loại → Kết thúc',
    category: 'BASIC',
    isSystemTemplate: true,
    workflowDefinition: {
      nodes: [
        { _id: 'n1', type: 'STAGE', name: 'Mới ứng tuyển', position: { x: 280, y: 60 }, config: { statusMapping: 'PENDING', color: '#F59E0B', description: 'Ứng viên vừa nộp đơn' } },
        { _id: 'n2', type: 'ACTION_AI', name: 'Chấm điểm CV', position: { x: 280, y: 200 }, config: { aiActionType: 'CV_SCREENING' } },
        { _id: 'n3', type: 'CONDITION', name: 'CV score >= 70', position: { x: 280, y: 340 }, config: { field: 'cv_score', operator: '>=', value: 70, dataType: 'number' } },
        { _id: 'n4', type: 'STAGE', name: 'Phỏng vấn', position: { x: 110, y: 500 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#06B6D4', description: 'Mời ứng viên đạt yêu cầu vào vòng phỏng vấn' } },
        { _id: 'n5', type: 'STAGE', name: 'Loại', position: { x: 450, y: 500 }, config: { statusMapping: 'REJECTED', color: '#EF4444', description: 'Không đạt yêu cầu sàng lọc CV' } },
        { _id: 'n6', type: 'END', name: 'Kết thúc', position: { x: 280, y: 660 }, config: {} }
      ],
      connections: [
        { sourceNodeId: 'n1', sourcePort: 'default', targetNodeId: 'n2', targetPort: 'input' },
        { sourceNodeId: 'n2', sourcePort: 'default', targetNodeId: 'n3', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'true', targetNodeId: 'n4', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'false', targetNodeId: 'n5', targetPort: 'input' },
        { sourceNodeId: 'n4', sourcePort: 'default', targetNodeId: 'n6', targetPort: 'input' },
        { sourceNodeId: 'n5', sourcePort: 'default', targetNodeId: 'n6', targetPort: 'input' }
      ]
    }
  }
];

const main = async () => {
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

    console.log(`\n🎉 Seed done. Updated: ${updatedCount}, Inserted: ${insertedCount}`);
  } catch (error) {
    console.error('❌ Failed to seed workflow templates:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
