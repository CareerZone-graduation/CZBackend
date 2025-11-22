import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Conversation from '../src/models/Conversation.js';
import ChatMessage from '../src/models/ChatMessage.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import RecruiterProfile from '../src/models/RecruiterProfile.js';
import CandidateProfile from '../src/models/CandidateProfile.js';

dotenv.config();

const recruiterIds = [
  '685a7673c923b1bb8073147c',
  '686feaf761fa499835c49161', '686feaf761fa499835c49162', '686feaf761fa499835c49163',
  '686feaf761fa499835c49164', '686feaf761fa499835c49165', '686feaf761fa499835c49166',
  '686feaf761fa499835c49167', '686feaf761fa499835c49168', '686feaf761fa499835c49169',
  '686feaf761fa499835c4916a', '686feaf761fa499835c4916b', '686feaf761fa499835c4916c',
  '686feaf761fa499835c4916d', '686feaf761fa499835c4916e', '686feaf761fa499835c4916f',
  '686feaf761fa499835c49170', '686feaf761fa499835c49171', '686feaf761fa499835c49172',
  '686feaf761fa499835c49173', '686fedb561fa499835c49179', '686fedb561fa499835c4917a',
  '686fedb561fa499835c4917b', '686fedb561fa499835c4917c', '686fedb561fa499835c4917d',
  '686fedb561fa499835c4917e', '686fedb561fa499835c4917f', '686fedb561fa499835c49180',
  '686fedb561fa499835c49181', '686fedb561fa499835c49182', '686fedb561fa499835c49183',
  '686fedb561fa499835c49184', '686fedb561fa499835c49185', '686fedb561fa499835c49186',
  '686fedb561fa499835c49187', '686fedb561fa499835c49188', '686fedb561fa499835c49189',
  '686fedb561fa499835c4918a', '686fedb561fa499835c4918b', '686fedb561fa499835c4918c'
];

const candidateIds = [
  '685a7673c923b1bb8073147d',
  '68707c8026cd47e3b30d70da', '68707c8026cd47e3b30d70db', '68707c8026cd47e3b30d70dc',
  '68707c8026cd47e3b30d70dd', '68707c8026cd47e3b30d70de', '68707c8026cd47e3b30d70df',
  '68707c8026cd47e3b30d70e0', '68707c8026cd47e3b30d70e1', '68707c8026cd47e3b30d70e2',
  '690f001ceb54fee3a72b6564', '690f001ceb54fee3a72b6566', '690f001ceb54fee3a72b6569',
  '690f001ceb54fee3a72b656a', '690f001ceb54fee3a72b656e', '690f001ceb54fee3a72b6574',
  '690f001ceb54fee3a72b6576', '690f001ceb54fee3a72b657a', '690f001ceb54fee3a72b657d',
  '690f001ceb54fee3a72b657e', '690f001ceb54fee3a72b6588', '690f001ceb54fee3a72b658f',
  '690f001ceb54fee3a72b6595', '690f001ceb54fee3a72b6598', '690f001ceb54fee3a72b65a2',
  '690f001ceb54fee3a72b65ac', '690f001ceb54fee3a72b65b3', '690f001ceb54fee3a72b65b5',
  '690f001ceb54fee3a72b65b7', '690f001ceb54fee3a72b65b9'
];

// User đặc biệt cần nhiều conversations
const SPECIAL_CANDIDATE = '685a7673c923b1bb8073147d';
const SPECIAL_RECRUITER = '685a7673c923b1bb8073147c';

const messageTemplates = {
  recruiter: [
    'Chào bạn, tôi đã xem hồ sơ của bạn và thấy rất phù hợp với vị trí đang tuyển.',
    'Bạn có thể cho tôi biết thêm về kinh nghiệm làm việc của bạn không?',
    'Chúng tôi muốn mời bạn tham gia phỏng vấn vào tuần tới.',
    'Mức lương bạn mong muốn là bao nhiêu?',
    'Bạn có thể bắt đầu làm việc khi nào?',
    'Cảm ơn bạn đã quan tâm đến vị trí này.',
    'Chúng tôi sẽ liên hệ lại với bạn trong thời gian sớm nhất.',
    'Bạn có câu hỏi gì về công ty không?'
  ],
  candidate: [
    'Xin chào, cảm ơn anh/chị đã quan tâm đến hồ sơ của em.',
    'Em có 3 năm kinh nghiệm trong lĩnh vực này.',
    'Em rất hứng thú với vị trí này và mong muốn được đóng góp.',
    'Em có thể tham gia phỏng vấn bất cứ lúc nào thuận tiện.',
    'Em mong muốn mức lương từ 15-20 triệu.',
    'Em có thể bắt đầu làm việc sau 2 tuần.',
    'Cho em hỏi về chế độ đãi ngộ của công ty?',
    'Công ty có chính sách đào tạo cho nhân viên mới không ạ?'
  ]
};

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomDate(daysAgo) {
  const now = new Date();
  const randomDays = Math.floor(Math.random() * daysAgo);
  const randomHours = Math.floor(Math.random() * 24);
  const randomMinutes = Math.floor(Math.random() * 60);
  return new Date(now.getTime() - (randomDays * 24 * 60 * 60 * 1000) - (randomHours * 60 * 60 * 1000) - (randomMinutes * 60 * 1000));
}

async function ensureApplication(recruiterId, candidateId) {
  try {
    const recruiterProfile = await RecruiterProfile.findOne({ userId: recruiterId });
    const candidateProfile = await CandidateProfile.findOne({ userId: candidateId });

    if (!recruiterProfile || !candidateProfile) {
      // console.warn(`⚠️ Cannot create application: Profile missing for Recruiter ${recruiterId} or Candidate ${candidateId}`);
      return;
    }

    // Find or create a job for this recruiter
    let job = await Job.findOne({ recruiterProfileId: recruiterProfile._id });
    if (!job) {
      job = await Job.create({
        title: 'Senior Software Engineer (Seeded)',
        description: 'This is a seeded job description for testing purposes.',
        requirements: 'React, Node.js, MongoDB',
        benefits: 'Competitive salary, Remote work',
        location: {
          province: 'Ho Chi Minh',
          district: 'District 1',
          commune: 'Ben Nghe Ward'
        },
        address: '123 Tech Street',
        type: 'FULL_TIME',
        workType: 'REMOTE',
        minSalary: 20000000,
        maxSalary: 50000000,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        experience: 'SENIOR_LEVEL',
        category: 'IT',
        recruiterProfileId: recruiterProfile._id,
        status: 'ACTIVE'
      });
    }

    // Check if application exists
    const existingApp = await Application.findOne({
      jobId: job._id,
      candidateProfileId: candidateProfile._id
    });

    if (!existingApp) {
      await Application.create({
        jobId: job._id,
        candidateProfileId: candidateProfile._id,
        coverLetter: 'I am interested in this position.',
        status: 'PENDING', // Valid status for messaging
        candidateName: candidateProfile.fullname,
        candidateEmail: 'seeded@example.com', // Placeholder
        candidatePhone: candidateProfile.phone || '0123456789',
        submittedCV: {
          name: 'CV.pdf',
          path: 'https://example.com/cv.pdf',
          source: 'UPLOADED'
        },
        jobSnapshot: {
          title: job.title,
          company: recruiterProfile.company.name,
          logo: recruiterProfile.company.logo
        }
      });
      console.log(`   ✅ Created application for Candidate ${candidateId} to Job ${job._id}`);
    }
  } catch (error) {
    console.error(`   ❌ Error creating application: ${error.message}`);
  }
}

async function seedChatData() {
  try {
    await mongoose.connect(process.env.DB_URI);
    console.log('✅ Đã kết nối MongoDB');

    // Xóa dữ liệu cũ
    await Conversation.deleteMany({});
    await ChatMessage.deleteMany({});
    console.log('🗑️  Đã xóa dữ liệu chat cũ');

    const conversations = [];
    const messages = [];
    const conversationSet = new Set();

    // Helper để tạo conversation key duy nhất
    const getConvKey = (id1, id2) => {
      return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
    };

    // Helper để thêm conversation
    const addConversation = async (recruiterId, candidateId) => {
      const key = getConvKey(recruiterId, candidateId);
      if (conversationSet.has(key)) return false;

      conversationSet.add(key);
      const [p1, p2] = recruiterId < candidateId
        ? [recruiterId, candidateId]
        : [candidateId, recruiterId];

      conversations.push({
        participant1: new mongoose.Types.ObjectId(p1),
        participant2: new mongoose.Types.ObjectId(p2),
        lastMessageAt: getRandomDate(30)
      });

      // Đảm bảo có application để có thể nhắn tin
      await ensureApplication(recruiterId, candidateId);

      return true;
    };

    // 1. Tạo 20 conversations cho ứng viên đặc biệt với các recruiters khác nhau
    console.log(`📌 Tạo 20 conversations cho candidate ${SPECIAL_CANDIDATE}...`);
    const shuffledRecruiters = [...recruiterIds].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(20, shuffledRecruiters.length); i++) {
      await addConversation(shuffledRecruiters[i], SPECIAL_CANDIDATE);
    }

    // 2. Tạo 20 conversations cho recruiter đặc biệt với các candidates khác nhau
    console.log(`📌 Tạo 20 conversations cho recruiter ${SPECIAL_RECRUITER}...`);
    const shuffledCandidates = [...candidateIds].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(20, shuffledCandidates.length); i++) {
      await addConversation(SPECIAL_RECRUITER, shuffledCandidates[i]);
    }

    console.log(`📝 Tạo ${conversations.length} conversations...`);
    const savedConversations = await Conversation.insertMany(conversations);

    // Tạo messages cho mỗi conversation
    for (const conv of savedConversations) {
      const numMessages = Math.floor(Math.random() * 15) + 5; // 5-20 messages
      const conversationMessages = [];

      // Xác định ai là recruiter, ai là candidate
      const isP1Recruiter = recruiterIds.includes(conv.participant1.toString());
      const recruiterId = isP1Recruiter ? conv.participant1 : conv.participant2;
      const candidateId = isP1Recruiter ? conv.participant2 : conv.participant1;

      let lastMessageTime = getRandomDate(30);

      for (let j = 0; j < numMessages; j++) {
        // Xen kẽ giữa recruiter và candidate
        const isRecruiterSending = j % 2 === 0;
        const senderId = isRecruiterSending ? recruiterId : candidateId;
        const recipientId = isRecruiterSending ? candidateId : recruiterId;
        const content = getRandomElement(
          isRecruiterSending ? messageTemplates.recruiter : messageTemplates.candidate
        );

        // Tăng thời gian một chút cho mỗi tin nhắn
        lastMessageTime = new Date(lastMessageTime.getTime() + Math.random() * 3600000); // +0-1 giờ

        const isRead = Math.random() > 0.3; // 70% đã đọc
        const status = isRead ? 'READ' : (Math.random() > 0.5 ? 'DELIVERED' : 'SENT');

        const message = {
          conversationId: conv._id,
          senderId,
          recipientId,
          content,
          sentAt: lastMessageTime,
          readAt: isRead ? new Date(lastMessageTime.getTime() + Math.random() * 1800000) : null,
          isRead,
          status,
          attachments: Math.random() > 0.9 ? ['https://example.com/file.pdf'] : []
        };

        conversationMessages.push(message);
      }

      messages.push(...conversationMessages);

      // Cập nhật lastMessage và lastMessageAt cho conversation
      const lastMsg = conversationMessages[conversationMessages.length - 1];
      conv.lastMessageAt = lastMsg.sentAt;
    }

    console.log(`💬 Tạo ${messages.length} messages...`);
    const savedMessages = await ChatMessage.insertMany(messages);

    // Cập nhật lastMessage reference
    for (const conv of savedConversations) {
      const lastMessage = savedMessages
        .filter(m => m.conversationId.toString() === conv._id.toString())
        .sort((a, b) => b.sentAt - a.sentAt)[0];

      if (lastMessage) {
        conv.lastMessage = lastMessage._id;
        await conv.save();
      }
    }

    console.log('✅ Hoàn thành seed dữ liệu chat!');
    console.log(`   - ${savedConversations.length} conversations`);
    console.log(`   - ${savedMessages.length} messages`);

    // Thống kê
    const unreadCount = savedMessages.filter(m => !m.isRead).length;
    console.log(`   - ${unreadCount} tin nhắn chưa đọc`);

  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Đã ngắt kết nối MongoDB');
  }
}

seedChatData();
