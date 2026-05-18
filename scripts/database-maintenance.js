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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

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

  const { Application, Notification, Conversation, ChatMessage, TalentPool, InterviewRoom } = Models;
  
  let stats = {
      notificationsDeleted: 0,
      conversationsDeleted: 0,
      messagesDeleted: 0,
      talentPoolDeleted: 0,
      interviewRoomsDeleted: 0,
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
      }

  } catch (error) {
      console.error(chalk.red('❌ Lỗi chi tiết:'), error);
  }

  return totalOrphans;
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
    console.log('0. Thoát');
    console.log('='.repeat(60));
    
    const choice = await question('Vui lòng chọn chức năng (0-4): ');

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
    } else {
      console.log(chalk.yellow('⚠️ Lựa chọn không hợp lệ!'));
    }
  }

  rl.close();
  await mongoose.connection.close();
  process.exit(0);
};

mainMenu();
