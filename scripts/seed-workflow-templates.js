// scripts/seed-workflow-templates.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { WorkflowTemplate } from '../src/models/index.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.DB_URI || 'mongodb://localhost:27017/careerzone';

const SYSTEM_TEMPLATES = [
  {
    name: 'Basic Recruitment',
    description: 'Quy trình cơ bản: Mới ứng tuyển → Sàng lọc CV → Phỏng vấn → Nhận việc',
    category: 'BASIC',
    isSystemTemplate: true,
    workflowDefinition: {
      nodes: [
        { _id: 'n1', type: 'STAGE', name: 'Mới ứng tuyển', position: { x: 250, y: 50 }, config: { statusMapping: 'PENDING', color: '#F59E0B', description: 'Ứng viên vừa nộp đơn' } },
        { _id: 'n2', type: 'STAGE', name: 'Sàng lọc CV', position: { x: 250, y: 200 }, config: { statusMapping: 'SUITABLE', color: '#3B82F6', description: 'Đánh giá hồ sơ ứng viên' } },
        { _id: 'n3', type: 'STAGE', name: 'Phỏng vấn', position: { x: 250, y: 350 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#06B6D4', description: 'Phỏng vấn ứng viên' } },
        { _id: 'n4', type: 'STAGE', name: 'Nhận việc', position: { x: 250, y: 500 }, config: { statusMapping: 'ACCEPTED', color: '#10B981', description: 'Ứng viên được nhận' } },
      ],
      connections: [
        { sourceNodeId: 'n1', sourcePort: 'default', targetNodeId: 'n2', targetPort: 'input' },
        { sourceNodeId: 'n2', sourcePort: 'default', targetNodeId: 'n3', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'default', targetNodeId: 'n4', targetPort: 'input' },
      ],
    },
  },
  {
    name: 'Technical Recruitment',
    description: 'Quy trình kỹ thuật: Mới ứng tuyển → Bài test kỹ thuật → Điều kiện điểm → Phỏng vấn / Loại',
    category: 'TECHNICAL',
    isSystemTemplate: true,
    workflowDefinition: {
      nodes: [
        { _id: 'n1', type: 'STAGE', name: 'Mới ứng tuyển', position: { x: 250, y: 50 }, config: { statusMapping: 'PENDING', color: '#F59E0B', description: 'Ứng viên vừa nộp đơn' } },
        { _id: 'n2', type: 'ACTION_TEST', name: 'Giao bài test', position: { x: 250, y: 200 }, config: {} },
        { _id: 'n3', type: 'CONDITION', name: 'Điểm test > 70', position: { x: 250, y: 350 }, config: { field: 'test_score', operator: '>', value: 70, dataType: 'number' } },
        { _id: 'n4', type: 'STAGE', name: 'Phỏng vấn', position: { x: 100, y: 500 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#06B6D4', description: 'Phỏng vấn ứng viên đạt test' } },
        { _id: 'n5', type: 'STAGE', name: 'Loại', position: { x: 400, y: 500 }, config: { statusMapping: 'REJECTED', color: '#EF4444', description: 'Không đạt yêu cầu test' } },
      ],
      connections: [
        { sourceNodeId: 'n1', sourcePort: 'default', targetNodeId: 'n2', targetPort: 'input' },
        { sourceNodeId: 'n2', sourcePort: 'default', targetNodeId: 'n3', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'true', targetNodeId: 'n4', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'false', targetNodeId: 'n5', targetPort: 'input' },
      ],
    },
  },
  {
    name: 'Multi-round Interview',
    description: 'Quy trình nhiều vòng: Mới ứng tuyển → Sàng lọc → PV vòng 1 → PV vòng 2 → Offer → Nhận việc',
    category: 'MULTI_ROUND',
    isSystemTemplate: true,
    workflowDefinition: {
      nodes: [
        { _id: 'n1', type: 'STAGE', name: 'Mới ứng tuyển', position: { x: 250, y: 50 }, config: { statusMapping: 'PENDING', color: '#F59E0B', description: 'Ứng viên vừa nộp đơn' } },
        { _id: 'n2', type: 'STAGE', name: 'Sàng lọc CV', position: { x: 250, y: 180 }, config: { statusMapping: 'SUITABLE', color: '#3B82F6', description: 'Đánh giá hồ sơ' } },
        { _id: 'n3', type: 'STAGE', name: 'Phỏng vấn vòng 1', position: { x: 250, y: 310 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#06B6D4', description: 'Phỏng vấn sơ bộ' } },
        { _id: 'n4', type: 'STAGE', name: 'Phỏng vấn vòng 2', position: { x: 250, y: 440 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#8B5CF6', description: 'Phỏng vấn chuyên sâu' } },
        { _id: 'n5', type: 'STAGE', name: 'Offer', position: { x: 250, y: 570 }, config: { statusMapping: 'OFFER_SENT', color: '#EC4899', description: 'Gửi đề nghị tuyển dụng' } },
        { _id: 'n6', type: 'STAGE', name: 'Nhận việc', position: { x: 250, y: 700 }, config: { statusMapping: 'ACCEPTED', color: '#10B981', description: 'Ứng viên chấp nhận offer' } },
      ],
      connections: [
        { sourceNodeId: 'n1', sourcePort: 'default', targetNodeId: 'n2', targetPort: 'input' },
        { sourceNodeId: 'n2', sourcePort: 'default', targetNodeId: 'n3', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'default', targetNodeId: 'n4', targetPort: 'input' },
        { sourceNodeId: 'n4', sourcePort: 'default', targetNodeId: 'n5', targetPort: 'input' },
        { sourceNodeId: 'n5', sourcePort: 'default', targetNodeId: 'n6', targetPort: 'input' },
      ],
    },
  },
];

const main = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    for (const template of SYSTEM_TEMPLATES) {
      const result = await WorkflowTemplate.findOneAndUpdate(
        { name: template.name, isSystemTemplate: true },
        template,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`✅ Seeded template: ${result.name} (${result._id})`);
    }

    console.log(`\n🎉 Successfully seeded ${SYSTEM_TEMPLATES.length} workflow templates`);
  } catch (error) {
    console.error('❌ Failed to seed workflow templates:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

main();
