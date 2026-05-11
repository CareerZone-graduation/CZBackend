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
  },
  {
    name: 'Technical Recruitment',
    description: 'Quy trình kỹ thuật: Mới ứng tuyển → Sàng lọc CV → Phỏng vấn kỹ thuật → Đạt / Loại → Kết thúc',
    category: 'TECHNICAL',
    isSystemTemplate: true,
    workflowDefinition: {
      nodes: [
        { _id: 'n1', type: 'STAGE', name: 'Mới ứng tuyển', position: { x: 280, y: 60 }, config: { statusMapping: 'PENDING', color: '#F59E0B', description: 'Ứng viên vừa nộp đơn' } },
        { _id: 'n2', type: 'STAGE', name: 'Sàng lọc CV', position: { x: 280, y: 200 }, config: { statusMapping: 'SUITABLE', color: '#3B82F6', description: 'Đánh giá hồ sơ ứng viên' } },
        { _id: 'n3', type: 'STAGE', name: 'Phỏng vấn kỹ thuật', position: { x: 280, y: 340 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#06B6D4', description: 'Phỏng vấn chuyên môn kỹ thuật' } },
        { _id: 'n4', type: 'CONDITION', name: 'Kết quả phỏng vấn kỹ thuật', position: { x: 280, y: 480 }, config: { field: 'interview_result', operator: '==', value: 'PASSED', dataType: 'string' } },
        { _id: 'n5', type: 'STAGE', name: 'Đạt kỹ thuật', position: { x: 110, y: 640 }, config: { statusMapping: 'SUITABLE', color: '#10B981', description: 'Ứng viên vượt qua vòng kỹ thuật' } },
        { _id: 'n6', type: 'STAGE', name: 'Loại', position: { x: 450, y: 640 }, config: { statusMapping: 'REJECTED', color: '#EF4444', description: 'Ứng viên không đạt vòng kỹ thuật' } },
        { _id: 'n7', type: 'END', name: 'Kết thúc', position: { x: 280, y: 800 }, config: {} }
      ],
      connections: [
        { sourceNodeId: 'n1', sourcePort: 'default', targetNodeId: 'n2', targetPort: 'input' },
        { sourceNodeId: 'n2', sourcePort: 'default', targetNodeId: 'n3', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'default', targetNodeId: 'n4', targetPort: 'input' },
        { sourceNodeId: 'n4', sourcePort: 'true', targetNodeId: 'n5', targetPort: 'input' },
        { sourceNodeId: 'n4', sourcePort: 'false', targetNodeId: 'n6', targetPort: 'input' },
        { sourceNodeId: 'n5', sourcePort: 'default', targetNodeId: 'n7', targetPort: 'input' },
        { sourceNodeId: 'n6', sourcePort: 'default', targetNodeId: 'n7', targetPort: 'input' }
      ]
    }
  },
  {
    name: 'Multi-round Interview',
    description: 'Quy trình nhiều vòng: Nộp đơn → Sàng lọc → PV vòng 1 → PV vòng 2 → Đạt / Loại → Kết thúc',
    category: 'MULTI_ROUND',
    isSystemTemplate: true,
    workflowDefinition: {
      nodes: [
        { _id: 'n1', type: 'STAGE', name: 'Mới ứng tuyển', position: { x: 320, y: 60 }, config: { statusMapping: 'PENDING', color: '#F59E0B', description: 'Ứng viên vừa nộp đơn' } },
        { _id: 'n2', type: 'STAGE', name: 'Sàng lọc CV', position: { x: 320, y: 180 }, config: { statusMapping: 'SUITABLE', color: '#3B82F6', description: 'Đánh giá hồ sơ' } },
        { _id: 'n3', type: 'STAGE', name: 'Phỏng vấn vòng 1', position: { x: 320, y: 300 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#06B6D4', description: 'Phỏng vấn sơ bộ' } },
        { _id: 'n4', type: 'CONDITION', name: 'KQ phỏng vấn vòng 1', position: { x: 320, y: 420 }, config: { field: 'interview_result', operator: '==', value: 'PASSED', dataType: 'string' } },
        { _id: 'n5', type: 'STAGE', name: 'Phỏng vấn vòng 2', position: { x: 120, y: 560 }, config: { statusMapping: 'SCHEDULED_INTERVIEW', color: '#8B5CF6', description: 'Phỏng vấn chuyên sâu' } },
        { _id: 'n6', type: 'CONDITION', name: 'KQ phỏng vấn vòng 2', position: { x: 120, y: 680 }, config: { field: 'interview_result', operator: '==', value: 'PASSED', dataType: 'string' } },
        { _id: 'n7', type: 'STAGE', name: 'Đề xuất vòng cuối', position: { x: 120, y: 820 }, config: { statusMapping: 'SUITABLE', color: '#10B981', description: 'Ứng viên đạt qua các vòng phỏng vấn' } },
        { _id: 'n8', type: 'STAGE', name: 'Loại', position: { x: 520, y: 820 }, config: { statusMapping: 'REJECTED', color: '#EF4444', description: 'Ứng viên không đạt yêu cầu phỏng vấn' } },
        { _id: 'n9', type: 'END', name: 'Kết thúc', position: { x: 320, y: 960 }, config: {} }
      ],
      connections: [
        { sourceNodeId: 'n1', sourcePort: 'default', targetNodeId: 'n2', targetPort: 'input' },
        { sourceNodeId: 'n2', sourcePort: 'default', targetNodeId: 'n3', targetPort: 'input' },
        { sourceNodeId: 'n3', sourcePort: 'default', targetNodeId: 'n4', targetPort: 'input' },
        { sourceNodeId: 'n4', sourcePort: 'true', targetNodeId: 'n5', targetPort: 'input' },
        { sourceNodeId: 'n4', sourcePort: 'false', targetNodeId: 'n8', targetPort: 'input' },
        { sourceNodeId: 'n5', sourcePort: 'default', targetNodeId: 'n6', targetPort: 'input' },
        { sourceNodeId: 'n6', sourcePort: 'true', targetNodeId: 'n7', targetPort: 'input' },
        { sourceNodeId: 'n6', sourcePort: 'false', targetNodeId: 'n8', targetPort: 'input' },
        { sourceNodeId: 'n7', sourcePort: 'default', targetNodeId: 'n9', targetPort: 'input' },
        { sourceNodeId: 'n8', sourcePort: 'default', targetNodeId: 'n9', targetPort: 'input' }
      ]
    }
  }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
