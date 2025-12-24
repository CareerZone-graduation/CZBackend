import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Import models
import Application from '../src/models/Application.js';
import Notification from '../src/models/Notification.js';
import Conversation from '../src/models/Conversation.js';
import ChatMessage from '../src/models/ChatMessage.js';
import TalentPool from '../src/models/TalentPool.js';
import InterviewRoom from '../src/models/InterviewRoom.js';

// Setup readline for confirmation
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Connect to MongoDB
const connectDB = async () => {
    try {
        const dbUri = process.env.DB_URI || 'mongodb://localhost:27017/careerzone';
        await mongoose.connect(dbUri);
        console.log('✅ MongoDB connected successfully\n');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

const syncDeletedApplications = async (dryRun = true) => {
    const stats = {
        notificationsDeleted: 0,
        conversationsDeleted: 0,
        messagesDeleted: 0,
        talentPoolDeleted: 0,
        interviewRoomsDeleted: 0,
    };

    console.log(dryRun ? '🔍 CHẾ ĐỘ KIỂM TRA (Dry Run) - Không xóa dữ liệu thực tế\n' : '⚠️  CHẾ ĐỘ XÓA THỰC TẾ - Dữ liệu sẽ bị xóa vĩnh viễn!\n');

    try {
        // 1. Cleanup Notifications
        console.log('📋 Đang kiểm tra Thông báo (Notifications)...');
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
            if (!appExists) {
                console.log(`   ⚠️  Thông báo orphaned: ${notif._id} (Lý do: Application ${appId} không tồn tại)`);
                orphanedNotifIds.push(notif._id);
            }
        }

        if (!dryRun && orphanedNotifIds.length > 0) {
            const result = await Notification.deleteMany({ _id: { $in: orphanedNotifIds } });
            stats.notificationsDeleted = result.deletedCount;
        } else {
            stats.notificationsDeleted = orphanedNotifIds.length;
        }
        console.log(`   ${dryRun ? 'Dự kiến xóa' : 'Đã xóa'}: ${stats.notificationsDeleted} thông báo\n`);


        // 2. Cleanup Conversations and Messages
        console.log('📋 Đang kiểm tra Cuộc trò chuyện (Conversations)...');
        const applicationConversations = await Conversation.find({
            'context.type': 'APPLICATION'
        }).lean();

        const orphanedConvIds = [];
        for (const conv of applicationConversations) {
            const appId = conv.context?.contextId;
            if (!appId) continue;

            const appExists = await Application.exists({ _id: appId });
            if (!appExists) {
                console.log(`   ⚠️  Cuộc trò chuyện orphaned: ${conv._id} (Lý do: Application ${appId} không tồn tại)`);
                orphanedConvIds.push(conv._id);
            }
        }

        if (orphanedConvIds.length > 0) {
            const messagesCount = await ChatMessage.countDocuments({ conversationId: { $in: orphanedConvIds } });
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
        console.log(`   ${dryRun ? 'Dự kiến xóa' : 'Đã xóa'}: ${stats.conversationsDeleted} cuộc trò chuyện`);
        console.log(`   ${dryRun ? 'Dự kiến xóa' : 'Đã xóa'}: ${stats.messagesDeleted} tin nhắn\n`);

        // 3. Cleanup TalentPool
        console.log('📋 Đang kiểm tra Danh sách tiềm năng (TalentPool)...');
        const talentPoolEntries = await TalentPool.find({}).lean();
        const orphanedTalentIds = [];
        for (const entry of talentPoolEntries) {
            if (!entry.applicationId) continue;
            const appExists = await Application.exists({ _id: entry.applicationId });
            if (!appExists) {
                console.log(`   ⚠️  TalentPool orphaned: ${entry._id} (Lý do: Application ${entry.applicationId} không tồn tại)`);
                orphanedTalentIds.push(entry._id);
            }
        }

        if (!dryRun && orphanedTalentIds.length > 0) {
            const result = await TalentPool.deleteMany({ _id: { $in: orphanedTalentIds } });
            stats.talentPoolDeleted = result.deletedCount;
        } else {
            stats.talentPoolDeleted = orphanedTalentIds.length;
        }
        console.log(`   ${dryRun ? 'Dự kiến xóa' : 'Đã xóa'}: ${stats.talentPoolDeleted} danh sách tiềm năng\n`);


        // 4. Cleanup InterviewRoom
        console.log('📋 Đang kiểm tra Phòng phỏng vấn (InterviewRoom)...');
        const interviewRooms = await InterviewRoom.find({
            applicationId: { $exists: true, $ne: null }
        }).lean();

        const orphanedRoomIds = [];
        for (const room of interviewRooms) {
            const appExists = await Application.exists({ _id: room.applicationId });
            if (!appExists) {
                console.log(`   ⚠️  InterviewRoom orphaned: ${room._id} (Lý do: Application ${room.applicationId} không tồn tại)`);
                orphanedRoomIds.push(room._id);
            }
        }

        if (!dryRun && orphanedRoomIds.length > 0) {
            const result = await InterviewRoom.deleteMany({ _id: { $in: orphanedRoomIds } });
            stats.interviewRoomsDeleted = result.deletedCount;
        } else {
            stats.interviewRoomsDeleted = orphanedRoomIds.length;
        }
        console.log(`   ${dryRun ? 'Dự kiến xóa' : 'Đã xóa'}: ${stats.interviewRoomsDeleted} phòng phỏng vấn\n`);


    } catch (error) {
        console.error('❌ Lỗi chi tiết:', error);
    }

    return stats;
};

const printResults = (stats, dryRun) => {
    console.log('\n' + '='.repeat(50));
    console.log(dryRun ? '📊 KẾT QUẢ KIỂM TRA (DRY RUN)' : '📊 KẾT QUẢ THỰC THI');
    console.log('='.repeat(50));
    console.log(`- Thông báo: ${stats.notificationsDeleted}`);
    console.log(`- Cuộc trò chuyện: ${stats.conversationsDeleted}`);
    console.log(`- Tin nhắn: ${stats.messagesDeleted}`);
    console.log(`- Danh sách tiềm năng: ${stats.talentPoolDeleted}`);
    console.log(`- Phòng phỏng vấn: ${stats.interviewRoomsDeleted}`);
    console.log('='.repeat(50) + '\n');
};

const main = async () => {
    await connectDB();

    console.log('🚀 Bắt đầu script đồng bộ dữ liệu sau khi xóa Application (Mở rộng)...\n');

    // Dry run
    const dryRunStats = await syncDeletedApplications(true);
    printResults(dryRunStats, true);

    const hasOrphanedData = Object.values(dryRunStats).some(val => val > 0);

    if (!hasOrphanedData) {
        console.log('✨ Không tìm thấy dữ liệu mâu thuẫn thêm. Hệ thống của bạn đã sạch!');
    } else {
        const answer = await question('❓ Bạn có muốn thực hiện xóa các dữ liệu orphaned (TalentPool, InterviewRoom, etc.) trên không? (yes/no): ');
        if (answer.toLowerCase() === 'yes') {
            const actualStats = await syncDeletedApplications(false);
            printResults(actualStats, false);
            console.log('✅ Hoàn tất dọn dẹp dữ liệu!');
        } else {
            console.log('❌ Đã hủy thao tác.');
        }
    }

    rl.close();
    await mongoose.connection.close();
    process.exit(0);
};

main();
