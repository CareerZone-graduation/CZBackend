import cron from 'node-cron';
import logger from '../utils/logger.js';
import Application from '../models/Application.js';
import * as queueService from '../services/queue.service.js';
import { ROUTING_KEYS } from '../queues/rabbitmq.js';

// Chạy mỗi phút
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    
    // Tìm các application đang tạm dừng chờ delay
    const applications = await Application.find({
      'workflowData.isWorkflowPaused': true,
      'workflowData.resumeAt': { $lte: now }
    });

    if (applications.length > 0) {
      logger.info(`[Delay Cron] Found ${applications.length} applications to resume`);
      
      for (const app of applications) {
        // Gỡ pause và xóa resumeAt
        const pendingNextNodeId = app.workflowData.pendingNextNodeId;
        
        app.workflowData.isWorkflowPaused = false;
        app.workflowData.resumeAt = null;
        app.workflowData.pendingNextNodeId = null;
        await app.save();

        if (pendingNextNodeId) {
          // Gửi vào queue để chạy tiếp
          await queueService.publishNotificationStrict(ROUTING_KEYS.WORKFLOW_EXECUTION_CONTINUE, {
            applicationId: app._id.toString(),
            workflowId: app.workflowId.toString(),
            currentNodeId: pendingNextNodeId.toString(),
            retryCount: 0
          });
          logger.info(`[Delay Cron] Resumed workflow for application ${app._id}, next node: ${pendingNextNodeId}`);
        }
      }
    }
  } catch (error) {
    logger.error('[Delay Cron] Error scanning delayed workflows', error);
  }
});
