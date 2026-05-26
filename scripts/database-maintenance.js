import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import chalk from 'chalk';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Import all models from index
import * as Models from '../src/models/index.js';
import User from '../src/models/User.js';
import RecruiterProfile from '../src/models/RecruiterProfile.js';

let rl;

const getReadline = () => {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  return rl;
};

const question = (query) => new Promise((resolve) => getReadline().question(query, resolve));

const connectDB = async () => {
  try {
    const uri = process.env.DB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('No DB_URI or MONGO_URI found in .env');
    await mongoose.connect(uri);
    console.log(chalk.green('✅ MongoDB connected successfully'));
  } catch (error) {
    console.error(chalk.red('❌ MongoDB connection error:'), error.message);
    process.exit(1);
  }
};

const CHECKS = [
  { model: 'CandidateProfile', field: 'userId' },
  { model: 'RecruiterProfile', field: 'userId' },
  { model: 'Job', field: 'recruiterProfileId' },
  { model: 'Application', field: 'jobId' },
  { model: 'Application', field: 'candidateProfileId' },
  { model: 'SavedJob', field: 'candidateId' },
  { model: 'SavedJob', field: 'jobId' },
  { model: 'JobViewHistory', field: 'userId' },
  { model: 'JobViewHistory', field: 'jobId' },
  { model: 'JobRecommendation', field: 'candidateId' },
  { model: 'JobRecommendation', field: 'jobId' },
  { model: 'CoinRecharge', field: 'userId' },
  { model: 'CreditTransaction', field: 'userId' },
  { model: 'Notification', field: 'userId' },
  { model: 'Conversation', field: 'participant1' },
  { model: 'Conversation', field: 'participant2' },
  { model: 'ChatMessage', field: 'senderId' },
  { model: 'ChatMessage', field: 'conversationId' },
  { model: 'InterviewRoom', field: 'recruiterId' },
  { model: 'InterviewRoom', field: 'candidateId' },
  { model: 'InterviewRoom', field: 'jobId' },
  { model: 'InterviewRoom', field: 'applicationId' },
  { model: 'CV', field: 'userId' },
  { model: 'SearchHistory', field: 'userId' },
  { model: 'JobAlertSubscription', field: 'userId' },
  { model: 'ProfileUnlock', field: 'recruiterProfileId' },
  { model: 'ProfileUnlock', field: 'candidateProfileId' },
  { model: 'Test', field: 'companyId' },
  { model: 'Test', field: 'createdBy' },
  { model: 'TestAssignment', field: 'testId' },
  { model: 'TestAssignment', field: 'applicationId' },
  { model: 'TestAssignment', field: 'candidateId' },
];

const findOrphans = async (check) => {
  const Model = Models[check.model];
  if (!Model) return [];

  const path = Model.schema.path(check.field);
  if (!path || !path.options || !path.options.ref) return [];

  const refModelName = path.options.ref;
  let refCollection;
  try {
    const RefModel = Models[refModelName] || mongoose.model(refModelName);
    refCollection = RefModel.collection.name;
  } catch (e) {
    return [];
  }

  const pipeline = [
    {
      $lookup: {
        from: refCollection,
        localField: check.field,
        foreignField: '_id',
        as: 'linkedDoc'
      }
    },
    {
      $match: {
        linkedDoc: { $size: 0 },
        [check.field]: { $exists: true, $ne: null }
      }
    },
    {
      $project: { _id: 1, [check.field]: 1 }
    }
  ];

  try {
    const orphans = await Model.aggregate(pipeline);
    return orphans.map(o => ({ ...o, refModelName }));
  } catch (error) {
    console.error(chalk.red(`❌ Error running check for ${check.model}.${check.field}:`), error.message);
    return [];
  }
};

const runCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`BÁO CÁO TOÀN VẸN DỮ LIỆU (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');

  const stats = [];
  let totalOrphans = 0;

  for (const check of CHECKS) {
    const orphans = await findOrphans(check);
    if (orphans.length > 0) {
      const refModelName = orphans[0].refModelName;
      console.log(`${chalk.yellow('⚠️')} Tìm thấy ${chalk.bold(orphans.length)} tài liệu mồ côi trong ${chalk.blue(check.model)} (lỗi khóa ngoại trỏ tới ${chalk.magenta(refModelName)})`);

      if (!dryRun) {
        const Model = Models[check.model];
        const ids = orphans.map(o => o._id);
        const result = await Model.deleteMany({ _id: { $in: ids } });
        console.log(`   ${chalk.green('✓')} Đã xóa ${result.deletedCount} tài liệu.`);
      }

      stats.push({ model: check.model, field: check.field, count: orphans.length });
      totalOrphans += orphans.length;
    }
  }

  if (totalOrphans === 0) {
    console.log(chalk.green('✨ HOÀN HẢO! Không tìm thấy tài liệu nào bị mồ côi.'));
  } else {
    console.log('\n' + chalk.bold(`=> Tổng số tài liệu mồ côi: ${totalOrphans}`));
  }

  return { totalOrphans, stats };
};

const runRecruiterCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`DỌN DẸP TÀI KHOẢN RECRUITER ẢO LỖI (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');
  
  const recruiterUsers = await User.find({ email: { $regex: /^recruiter_/i }, role: 'recruiter' }).lean();
  let count = 0;

  for (const user of recruiterUsers) {
    const profile = await RecruiterProfile.findOne({ userId: user._id });
    if (profile && (!profile.fullname || profile.fullname.trim() === '')) {
      console.log(`   ⚠️ Phát hiện lỗi: ${user.email} (ID: ${user._id})`);
      if (!dryRun) {
        await User.deleteOne({ _id: user._id });
        await RecruiterProfile.deleteOne({ _id: profile._id });
        console.log(`   ${chalk.green('✓')} Đã xóa user và profile tương ứng.`);
      }
      count++;
    }
  }

  if (count === 0) {
      console.log(chalk.green('✨ Tốt! Không có tài khoản ảo lõi nào.'));
  } else {
      console.log(chalk.bold(`\n=> TỔNG CỘNG: ${count} users rác đã được tìm thấy ${!dryRun ? 'và dọn dẹp' : ''}.`));
  }
  return count;
};

const runApplicationOrphanCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`DỌN DẸP DỮ LIỆU APPLICATION BỊ XÓA (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');

  const { Application, Notification, Conversation, ChatMessage, TalentPool, InterviewRoom, TestAssignment } = Models;
  
  let stats = {
      notificationsDeleted: 0,
      conversationsDeleted: 0,
      messagesDeleted: 0,
      talentPoolDeleted: 0,
      interviewRoomsDeleted: 0,
      testAssignmentsDeleted: 0,
  };
  let totalOrphans = 0;

  try {
      // 1. Cleanup Notifications
      const applicationNotifications = await Notification.find({
          $or: [
              { 'entity.type': 'Application' },
              { 'type': 'application' }
          ]
      }).lean();

      const orphanedNotifIds = [];
      for (const notif of applicationNotifications) {
          const appId = notif.entity?.id || notif.metadata?.applicationId;
          if (!appId) continue;
          const appExists = await Application.exists({ _id: appId });
          if (!appExists) orphanedNotifIds.push(notif._id);
      }

      if (orphanedNotifIds.length > 0) {
          console.log(`   ⚠️ Tìm thấy ${orphanedNotifIds.length} Thông báo (Notification) rác`);
          if (!dryRun) {
              const result = await Notification.deleteMany({ _id: { $in: orphanedNotifIds } });
              stats.notificationsDeleted = result.deletedCount;
          } else {
              stats.notificationsDeleted = orphanedNotifIds.length;
          }
      }

      // 2. Cleanup Conversations and Messages
      const applicationConversations = await Conversation.find({
          'context.type': 'APPLICATION'
      }).lean();

      const orphanedConvIds = [];
      for (const conv of applicationConversations) {
          const appId = conv.context?.contextId;
          if (!appId) continue;
          const appExists = await Application.exists({ _id: appId });
          if (!appExists) orphanedConvIds.push(conv._id);
      }

      if (orphanedConvIds.length > 0) {
          const messagesCount = await ChatMessage.countDocuments({ conversationId: { $in: orphanedConvIds } });
          console.log(`   ⚠️ Tìm thấy ${orphanedConvIds.length} Cuộc trò chuyện (Conversation) và ${messagesCount} Tin nhắn rác`);
          if (!dryRun) {
              await ChatMessage.deleteMany({ conversationId: { $in: orphanedConvIds } });
              stats.messagesDeleted = messagesCount;
              const result = await Conversation.deleteMany({ _id: { $in: orphanedConvIds } });
              stats.conversationsDeleted = result.deletedCount;
          } else {
              stats.messagesDeleted = messagesCount;
              stats.conversationsDeleted = orphanedConvIds.length;
          }
      }

      // 3. Cleanup TalentPool
      const talentPoolEntries = await TalentPool.find({ applicationId: { $exists: true, $ne: null } }).lean();
      const orphanedTalentIds = [];
      for (const entry of talentPoolEntries) {
          const appExists = await Application.exists({ _id: entry.applicationId });
          if (!appExists) orphanedTalentIds.push(entry._id);
      }

      if (orphanedTalentIds.length > 0) {
          console.log(`   ⚠️ Tìm thấy ${orphanedTalentIds.length} danh sách tiềm năng (TalentPool) rác`);
          if (!dryRun) {
              const result = await TalentPool.deleteMany({ _id: { $in: orphanedTalentIds } });
              stats.talentPoolDeleted = result.deletedCount;
          } else {
              stats.talentPoolDeleted = orphanedTalentIds.length;
          }
      }

      // 4. Cleanup InterviewRoom
      const interviewRooms = await InterviewRoom.find({
          applicationId: { $exists: true, $ne: null }
      }).lean();

      const orphanedRoomIds = [];
      for (const room of interviewRooms) {
          const appExists = await Application.exists({ _id: room.applicationId });
          if (!appExists) orphanedRoomIds.push(room._id);
      }

      if (orphanedRoomIds.length > 0) {
          console.log(`   ⚠️ Tìm thấy ${orphanedRoomIds.length} phòng phỏng vấn (InterviewRoom) rác`);
          if (!dryRun) {
              const result = await InterviewRoom.deleteMany({ _id: { $in: orphanedRoomIds } });
              stats.interviewRoomsDeleted = result.deletedCount;
          } else {
              stats.interviewRoomsDeleted = orphanedRoomIds.length;
          }
      }

      // 5. Cleanup TestAssignment
      const testAssignments = await TestAssignment.find({ applicationId: { $exists: true, $ne: null } }).lean();
      const orphanedAssignmentIds = [];
      for (const entry of testAssignments) {
          const appExists = await Application.exists({ _id: entry.applicationId });
          if (!appExists) orphanedAssignmentIds.push(entry._id);
      }

      if (orphanedAssignmentIds.length > 0) {
          console.log(`   ⚠️ Tìm thấy ${orphanedAssignmentIds.length} lượt giao/làm bài test (TestAssignment) rác`);
          if (!dryRun) {
              const result = await TestAssignment.deleteMany({ _id: { $in: orphanedAssignmentIds } });
              stats.testAssignmentsDeleted = result.deletedCount;
          } else {
              stats.testAssignmentsDeleted = orphanedAssignmentIds.length;
          }
      }

      totalOrphans = Object.values(stats).reduce((a, b) => a + b, 0);

      if (totalOrphans === 0) {
          console.log(chalk.green('✨ Không tìm thấy dữ liệu mâu thuẫn thêm. Hệ thống của bạn đã sạch!'));
      } else {
          console.log('\n' + chalk.bold(`=> Tổng cộng: ${totalOrphans} dữ liệu mồ côi đã được tìm thấy ${!dryRun ? 'và dọn dẹp' : ''}.`));
          console.log(`   - Thông báo: ${stats.notificationsDeleted}`);
          console.log(`   - Cuộc trò chuyện: ${stats.conversationsDeleted}`);
          console.log(`   - Tin nhắn: ${stats.messagesDeleted}`);
          console.log(`   - Danh sách tiềm năng: ${stats.talentPoolDeleted}`);
          console.log(`   - Phòng phỏng vấn: ${stats.interviewRoomsDeleted}`);
          console.log(`   - Lượt giao/làm bài test: ${stats.testAssignmentsDeleted}`);
      }

  } catch (error) {
      console.error(chalk.red('❌ Lỗi chi tiết:'), error);
  }

  return totalOrphans;
};

export const getInterviewNotificationReferenceId = (notification) => {
  const entityId = notification.entity?.type === 'InterviewRoom' ? notification.entity?.id : null;
  const metadataId = notification.metadata?.interviewId;
  const referenceId = entityId || metadataId;

  return referenceId ? referenceId.toString() : null;
};

export const runInterviewNotificationOrphanCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`DỌN DẸP THÔNG BÁO PHỎNG VẤN MỒ CÔI (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');

  const { Notification, InterviewRoom } = Models;
  const interviewNotifications = await Notification.find({
    type: 'interview',
    $or: [
      { 'entity.type': 'InterviewRoom' },
      { 'metadata.interviewId': { $exists: true, $ne: null } },
    ],
  }).lean();

  const orphanedNotifIds = [];
  let invalidReferenceCount = 0;
  let missingReferenceCount = 0;

  for (const notification of interviewNotifications) {
    const interviewId = getInterviewNotificationReferenceId(notification);
    if (!interviewId) {
      missingReferenceCount++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(interviewId)) {
      invalidReferenceCount++;
      orphanedNotifIds.push(notification._id);
      continue;
    }

    const interviewExists = await InterviewRoom.exists({ _id: interviewId });
    if (!interviewExists) orphanedNotifIds.push(notification._id);
  }

  if (orphanedNotifIds.length > 0) {
    console.log(`   ⚠️ Tìm thấy ${orphanedNotifIds.length} thông báo phỏng vấn trỏ tới InterviewRoom không tồn tại`);
    if (invalidReferenceCount > 0) {
      console.log(`   ⚠️ Trong đó có ${invalidReferenceCount} thông báo có interviewId không hợp lệ`);
    }

    if (!dryRun) {
      const result = await Notification.deleteMany({ _id: { $in: orphanedNotifIds } });
      console.log(`   ${chalk.green('✓')} Đã xóa ${result.deletedCount} thông báo phỏng vấn mồ côi.`);
      return result.deletedCount;
    }
  }

  if (missingReferenceCount > 0) {
    console.log(`   ℹ️ Bỏ qua ${missingReferenceCount} thông báo phỏng vấn không có interviewId/entity rõ ràng.`);
  }

  if (orphanedNotifIds.length === 0) {
    console.log(chalk.green('✨ Không tìm thấy thông báo phỏng vấn mồ côi.'));
  } else {
    const suffix = dryRun ? '.' : ' và dọn dẹp.';
    console.log('\n' + chalk.bold(`=> Tổng cộng: ${orphanedNotifIds.length} thông báo phỏng vấn mồ côi đã được tìm thấy${suffix}`));
  }

  return orphanedNotifIds.length;
};

export const getJobApplicantsNotificationReferenceId = (notification) => {
  const metadataJobId = notification.metadata?.jobId;
  if (metadataJobId) return metadataJobId.toString();

  const match = notification.aggregationKey?.match(/^job:([a-f\d]{24}):applicants$/i);
  return match ? match[1] : null;
};

export const runJobApplicantsNotificationOrphanCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`DỌN DẸP THÔNG BÁO ỨNG VIÊN MỚI MỒ CÔI (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');

  const { Notification, Job } = Models;
  const applicantsNotifications = await Notification.find({
    type: 'job_applicants_rollup',
    $or: [
      { 'metadata.jobId': { $exists: true, $ne: null } },
      { aggregationKey: /^job:[a-f\d]{24}:applicants$/i },
    ],
  }).lean();

  const orphanedNotifIds = [];
  let invalidReferenceCount = 0;
  let missingReferenceCount = 0;

  for (const notification of applicantsNotifications) {
    const jobId = getJobApplicantsNotificationReferenceId(notification);
    if (!jobId) {
      missingReferenceCount++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      invalidReferenceCount++;
      orphanedNotifIds.push(notification._id);
      continue;
    }

    const jobExists = await Job.exists({ _id: jobId });
    if (!jobExists) orphanedNotifIds.push(notification._id);
  }

  if (orphanedNotifIds.length > 0) {
    console.log(`   ⚠️ Tìm thấy ${orphanedNotifIds.length} thông báo ứng viên mới trỏ tới Job không tồn tại`);
    if (invalidReferenceCount > 0) {
      console.log(`   ⚠️ Trong đó có ${invalidReferenceCount} thông báo có jobId không hợp lệ`);
    }

    if (!dryRun) {
      const result = await Notification.deleteMany({ _id: { $in: orphanedNotifIds } });
      console.log(`   ${chalk.green('✓')} Đã xóa ${result.deletedCount} thông báo ứng viên mới mồ côi.`);
      return result.deletedCount;
    }
  }

  if (missingReferenceCount > 0) {
    console.log(`   ℹ️ Bỏ qua ${missingReferenceCount} thông báo ứng viên mới không có jobId/aggregationKey rõ ràng.`);
  }

  if (orphanedNotifIds.length === 0) {
    console.log(chalk.green('✨ Không tìm thấy thông báo ứng viên mới mồ côi.'));
  } else {
    const suffix = dryRun ? '.' : ' và dọn dẹp.';
    console.log('\n' + chalk.bold(`=> Tổng cộng: ${orphanedNotifIds.length} thông báo ứng viên mới mồ côi đã được tìm thấy${suffix}`));
  }

  return orphanedNotifIds.length;
};

export const getJobApprovalNotificationReferenceId = (notification) => {
  const entityId = notification.entity?.type === 'Job' ? notification.entity?.id : null;
  const metadataJobId = notification.metadata?.jobId;
  const referenceId = entityId || metadataJobId;

  return referenceId ? referenceId.toString() : null;
};

export const runJobApprovalNotificationOrphanCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`DỌN DẸP THÔNG BÁO DUYỆT TIN MỒ CÔI (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');

  const { Notification, Job } = Models;
  const approvalNotifications = await Notification.find({
    type: 'job_approval',
    $or: [
      { 'entity.type': 'Job' },
      { 'metadata.jobId': { $exists: true, $ne: null } },
    ],
  }).lean();

  const orphanedNotifIds = [];
  let invalidReferenceCount = 0;
  let missingReferenceCount = 0;

  for (const notification of approvalNotifications) {
    const jobId = getJobApprovalNotificationReferenceId(notification);
    if (!jobId) {
      missingReferenceCount++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      invalidReferenceCount++;
      orphanedNotifIds.push(notification._id);
      continue;
    }

    const jobExists = await Job.exists({ _id: jobId });
    if (!jobExists) orphanedNotifIds.push(notification._id);
  }

  if (orphanedNotifIds.length > 0) {
    console.log(`   ⚠️ Tìm thấy ${orphanedNotifIds.length} thông báo duyệt tin tuyển dụng trỏ tới Job không tồn tại`);
    if (invalidReferenceCount > 0) {
      console.log(`   ⚠️ Trong đó có ${invalidReferenceCount} thông báo có jobId không hợp lệ`);
    }

    if (!dryRun) {
      const result = await Notification.deleteMany({ _id: { $in: orphanedNotifIds } });
      console.log(`   ${chalk.green('✓')} Đã xóa ${result.deletedCount} thông báo duyệt tin mồ côi.`);
      return result.deletedCount;
    }
  }

  if (missingReferenceCount > 0) {
    console.log(`   ℹ️ Bỏ qua ${missingReferenceCount} thông báo duyệt tin không có jobId/entity rõ ràng.`);
  }

  if (orphanedNotifIds.length === 0) {
    console.log(chalk.green('✨ Không tìm thấy thông báo duyệt tin tuyển dụng mồ côi.'));
  } else {
    const suffix = dryRun ? '.' : ' và dọn dẹp.';
    console.log('\n' + chalk.bold(`=> Tổng cộng: ${orphanedNotifIds.length} thông báo duyệt tin mồ côi đã được tìm thấy${suffix}`));
  }

  return orphanedNotifIds.length;
};

export const getTalentPoolInvitationNotificationReferenceId = (notification) => {
  const entityId = notification.entity?.type === 'Job' ? notification.entity?.id : null;
  const metadataJobId = notification.metadata?.jobId;
  const referenceId = entityId || metadataJobId;

  return referenceId ? referenceId.toString() : null;
};

export const runTalentPoolInvitationNotificationOrphanCleanup = async (dryRun = true) => {
  console.log('\n' + chalk.cyan('━'.repeat(60)));
  console.log(chalk.bold.cyan(`DỌN DẸP THÔNG BÁO TALENT POOL MỒ CÔI (${dryRun ? 'CHỈ KIỂM TRA' : 'XÓA THỰC TẾ'})`));
  console.log(chalk.cyan('━'.repeat(60)) + '\n');

  const { Notification, Job } = Models;
  const talentPoolNotifications = await Notification.find({
    type: 'talent_pool_invitation',
    $or: [
      { 'entity.type': 'Job' },
      { 'metadata.jobId': { $exists: true, $ne: null } },
    ],
  }).lean();

  const orphanedNotifIds = [];
  let invalidReferenceCount = 0;
  let missingReferenceCount = 0;

  for (const notification of talentPoolNotifications) {
    const jobId = getTalentPoolInvitationNotificationReferenceId(notification);
    if (!jobId) {
      missingReferenceCount++;
      continue;
    }

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      invalidReferenceCount++;
      orphanedNotifIds.push(notification._id);
      continue;
    }

    const jobExists = await Job.exists({ _id: jobId });
    if (!jobExists) orphanedNotifIds.push(notification._id);
  }

  if (orphanedNotifIds.length > 0) {
    console.log(`   ⚠️ Tìm thấy ${orphanedNotifIds.length} thông báo Talent Pool trỏ tới Job không tồn tại`);
    if (invalidReferenceCount > 0) {
      console.log(`   ⚠️ Trong đó có ${invalidReferenceCount} thông báo có jobId không hợp lệ`);
    }

    if (!dryRun) {
      const result = await Notification.deleteMany({ _id: { $in: orphanedNotifIds } });
      console.log(`   ${chalk.green('✓')} Đã xóa ${result.deletedCount} thông báo Talent Pool mồ côi.`);
      return result.deletedCount;
    }
  }

  if (missingReferenceCount > 0) {
    console.log(`   ℹ️ Bỏ qua ${missingReferenceCount} thông báo Talent Pool không có jobId/entity rõ ràng.`);
  }

  if (orphanedNotifIds.length === 0) {
    console.log(chalk.green('✨ Không tìm thấy thông báo Talent Pool mồ côi.'));
  } else {
    const suffix = dryRun ? '.' : ' và dọn dẹp.';
    console.log('\n' + chalk.bold(`=> Tổng cộng: ${orphanedNotifIds.length} thông báo Talent Pool mồ côi đã được tìm thấy${suffix}`));
  }

  return orphanedNotifIds.length;
};

const mainMenu = async () => {
  await connectDB();
  
  while (true) {
    console.log('\n' + '='.repeat(60));
    console.log('🛠️  CÔNG CỤ BẢO TRÌ DATABASE ĐÃ ĐƯỢC TỐI ƯU HÓA');
    console.log('='.repeat(60));
    console.log('1. Báo cáo tình trạng dữ liệu mồ côi đứt gãy (Chỉ kiểm tra, an toàn)');
    console.log('2. Dọn dẹp dữ liệu đứt gãy (XÓA THỰC TẾ)');
    console.log('3. Xóa các tài khoản Recruiter ảo lỗi (email recruiter_xxx không có tên)');
    console.log('4. Dọn dẹp dữ liệu rác liên quan đến Application đã xóa');
    console.log('5. Dọn dẹp thông báo phỏng vấn trỏ tới InterviewRoom đã mất');
    console.log('6. Dọn dẹp thông báo ứng viên mới trỏ tới Job đã mất');
    console.log('7. Dọn dẹp thông báo duyệt tin tuyển dụng trỏ tới Job đã mất');
    console.log('8. Dọn dẹp thông báo Talent Pool trỏ tới Job đã mất');
    console.log('0. Thoát');
    console.log('='.repeat(60));
    
    const choice = await question('Vui lòng chọn chức năng (0-8): ');

    if (choice === '0') {
      console.log(chalk.green('👋 Tạm biệt!'));
      break;
    } else if (choice === '1') {
      await runCleanup(true);
    } else if (choice === '2') {
      const { totalOrphans } = await runCleanup(true);
      if (totalOrphans > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các dữ liệu này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else if (choice === '3') {
      const badFound = await runRecruiterCleanup(true);
      if (badFound > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các user này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runRecruiterCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else if (choice === '4') {
      const orphansFound = await runApplicationOrphanCleanup(true);
      if (orphansFound > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các dữ liệu này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runApplicationOrphanCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else if (choice === '5') {
      const orphanedNotifications = await runInterviewNotificationOrphanCleanup(true);
      if (orphanedNotifications > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các thông báo phỏng vấn mồ côi này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runInterviewNotificationOrphanCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else if (choice === '6') {
      const orphanedNotifications = await runJobApplicantsNotificationOrphanCleanup(true);
      if (orphanedNotifications > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các thông báo ứng viên mới mồ côi này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runJobApplicantsNotificationOrphanCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else if (choice === '7') {
      const orphanedNotifications = await runJobApprovalNotificationOrphanCleanup(true);
      if (orphanedNotifications > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các thông báo duyệt tin tuyển dụng mồ côi này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runJobApprovalNotificationOrphanCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else if (choice === '8') {
      const orphanedNotifications = await runTalentPoolInvitationNotificationOrphanCleanup(true);
      if (orphanedNotifications > 0) {
        const confirm = await question(chalk.bold.red('\nBạn có chắc chắn muốn XÓA VĨNH VIỄN các thông báo Talent Pool mồ côi này? (yes/no): '));
        if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
          await runTalentPoolInvitationNotificationOrphanCleanup(false);
          console.log(chalk.bold.green('\n✅ Đã xóa thành công!'));
        } else {
          console.log(chalk.yellow('\n❌ Đã hủy thao tác xóa.'));
        }
      }
    } else {
      console.log(chalk.yellow('⚠️ Lựa chọn không hợp lệ!'));
    }
  }

  if (rl) rl.close();
  await mongoose.connection.close();
  process.exit(0);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mainMenu();
}
