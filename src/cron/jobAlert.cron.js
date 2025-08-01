// src/cron/jobAlert.cron.js
import cron from 'node-cron';
import logger from '../utils/logger.js';
import PendingNotification from '../models/PendingNotification.js';
import { publishNotification } from '../services/queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';
import JobAlertSubscription from '../models/JobAlertSubscription.js';
import Job from '../models/Job.js';
// tạm thời đổi thành mỗi 5s để kiểm tra
cron.schedule('*/555555 * * * * *', async () => {
// cron.schedule('0 8 * * *', async () => {
    logger.info('Running daily digest cron job...');
    try {
        // Sử dụng aggregation pipeline để gom nhóm hiệu quả
        const userDigests = await PendingNotification.aggregate([
            {
                $group: {
                    _id: "$userId",
                    jobIds: { $addToSet: "$jobId" }
                }
            }
        ]);

        logger.info(`Found ${userDigests.length} users with pending notifications.`, { userDigests });
        if (userDigests.length === 0) {
            logger.info('No pending notifications to process.');
            return;
        }

        for (const digest of userDigests) {
            const userId = digest._id;
            const jobIds = digest.jobIds;
            logger.info(`Processing user ${userId} with jobIds:`, { jobIds });

            const jobs = await Job.find({ _id: { $in: jobIds } })
                .populate({ path: 'recruiterProfileId', select: 'company.name company.logo' })
                .limit(10)
                .lean();
            logger.info(`Found ${jobs.length} jobs for user ${userId}.`);
            if (jobs.length > 0) {
                // đẩy vào queue để gửi thông báo
                logger.info(`Publishing notification for user ${userId} with ${jobs.length} jobs.`);
                 await publishNotification(ROUTING_KEYS.DAILY_DIGEST, {
                    type: 'DAILY_JOB_ALERT',
                    recipientId: userId.toString(),
                    data: {
                        keyword: "việc làm mới phù hợp",
                        jobs: jobs.map(j => ({ // Format lại dữ liệu
                            _id: j._id,
                            title: j.title,
                            companyName: j.recruiterProfileId?.company?.name || 'Công ty ẩn danh',
                            companyLogo: j.recruiterProfileId?.company?.logo,
                            location: j.location,
                            minSalary: j.minSalary,
                            maxSalary: j.maxSalary,
                        })),
                        notificationMethod: "BOTH" // Mặc định gửi cả 2 kênh
                    },
                });
            }
        }

        // Sau khi đã đẩy hết vào queue, xóa các bản ghi đã xử lý
        await PendingNotification.deleteMany({});
        logger.info(`Daily digest cron job completed. Processed ${userDigests.length} users.`);

    } catch (error) {
        logger.error('Error during daily digest cron job', { error: error.message, stack: error.stack });
    }
}, { scheduled: true, timezone: "Asia/Ho_Chi_Minh" });
