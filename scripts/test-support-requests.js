import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Import models
const SupportRequestSchema = new mongoose.Schema({
  requester: {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userType: { type: String, enum: ['candidate', 'recruiter'], required: true },
    name: { type: String, required: true },
    email: { type: String, required: true }
  },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  category: { 
    type: String, 
    enum: ['account', 'technical', 'billing', 'general', 'feature-request', 'bug-report'],
    required: true 
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'resolved', 'closed'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  attachments: [{
    url: String,
    publicId: String,
    filename: String,
    fileType: String,
    fileSize: Number
  }],
  messages: [{
    sender: {
      userId: mongoose.Schema.Types.ObjectId,
      userType: String,
      name: String
    },
    content: String,
    attachments: [{
      url: String,
      publicId: String,
      filename: String,
      fileType: String,
      fileSize: Number
    }],
    createdAt: { type: Date, default: Date.now }
  }],
  adminResponses: [{
    adminId: mongoose.Schema.Types.ObjectId,
    adminName: String,
    response: String,
    statusChange: {
      from: String,
      to: String
    },
    priorityChange: {
      from: String,
      to: String
    },
    createdAt: { type: Date, default: Date.now }
  }],
  hasUnreadAdminResponse: { type: Boolean, default: false },
  resolvedAt: Date,
  closedAt: Date,
  reopenedAt: Date,
  reopenedBy: mongoose.Schema.Types.ObjectId
}, {
  timestamps: true
});

const SupportRequest = mongoose.model('SupportRequest', SupportRequestSchema);

async function testSupportRequests() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Count existing support requests
    const count = await SupportRequest.countDocuments();
    console.log(`📊 Found ${count} support requests in database`);

    if (count === 0) {
      console.log('📝 Creating sample support requests...');
      
      // Create sample user ID (you should replace with real user IDs from your database)
      const sampleUserId = new mongoose.Types.ObjectId();
      
      const sampleRequests = [
        {
          requester: {
            userId: sampleUserId,
            userType: 'candidate',
            name: 'Nguyễn Văn A',
            email: 'nguyenvana@example.com'
          },
          subject: 'Không thể đăng nhập vào tài khoản',
          description: 'Tôi đã thử đăng nhập nhiều lần nhưng không thành công. Vui lòng giúp tôi kiểm tra.',
          category: 'account',
          status: 'pending',
          priority: 'high'
        },
        {
          requester: {
            userId: sampleUserId,
            userType: 'recruiter',
            name: 'Trần Thị B',
            email: 'tranthib@example.com'
          },
          subject: 'Lỗi khi đăng tin tuyển dụng',
          description: 'Khi tôi cố gắng đăng tin tuyển dụng mới, hệ thống báo lỗi. Vui lòng kiểm tra.',
          category: 'technical',
          status: 'in-progress',
          priority: 'urgent'
        },
        {
          requester: {
            userId: sampleUserId,
            userType: 'candidate',
            name: 'Lê Văn C',
            email: 'levanc@example.com'
          },
          subject: 'Câu hỏi về gói dịch vụ',
          description: 'Tôi muốn biết thêm thông tin về các gói dịch vụ premium.',
          category: 'billing',
          status: 'resolved',
          priority: 'medium',
          resolvedAt: new Date()
        }
      ];

      await SupportRequest.insertMany(sampleRequests);
      console.log(`✅ Created ${sampleRequests.length} sample support requests`);
    }

    // Fetch and display all support requests
    const requests = await SupportRequest.find().sort({ createdAt: -1 }).lean();
    console.log('\n📋 Support Requests:');
    requests.forEach((req, index) => {
      console.log(`\n${index + 1}. ${req.subject}`);
      console.log(`   Status: ${req.status} | Priority: ${req.priority}`);
      console.log(`   Category: ${req.category}`);
      console.log(`   Requester: ${req.requester.name} (${req.requester.userType})`);
      console.log(`   Created: ${req.createdAt}`);
    });

    console.log('\n✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testSupportRequests();
