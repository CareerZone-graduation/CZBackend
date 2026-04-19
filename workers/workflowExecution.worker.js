// workers/workflowExecution.worker.js
import path from 'path';
import dotenv from 'dotenv';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getChannel, QUEUES } from '../src/queues/rabbitmq.js';
import * as workflowExecutionService from '../src/services/workflowExecution.service.js';
import connectDB from '../src/utils/connectDB.js';
import logger from '../src/utils/logger.js';

/**
 * Khởi động worker để xử lý workflow execution tasks
 */
async function startWorker() {
  await connectDB();
  const channel = await getChannel();

  // Prefetch 5 messages at a time
  await channel.prefetch(5);

  logger.info('🚀 Workflow Execution worker started. Waiting for tasks...');

  /**
   * Message handler for workflow execution queue
   * @param {Object} msg - Message từ RabbitMQ
   */
  const messageHandler = async (msg) => {
    if (msg === null) return;

    const startTime = Date.now();
    let payload;

    try {
      payload = JSON.parse(msg.content.toString());

      if (payload.retryAfter && Date.now() < payload.retryAfter) {
        // Not ready to retry yet, requeue and skip
        logger.info(`⏳ Task not ready for retry, requeuing for later: ${new Date(payload.retryAfter).toISOString()}`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay to prevent tight loop
        channel.nack(msg, false, true); // Requeue
        return;
      }

      logger.info('📨 Received workflow execution task', {
        applicationId: payload.applicationId,
        workflowId: payload.workflowId,
        currentNodeId: payload.currentNodeId,
        retryCount: payload.retryCount,
        trigger: payload.trigger,
        timestamp: new Date().toISOString()
      });

      await workflowExecutionService.executeWorkflowNode({
        applicationId: payload.applicationId,
        workflowId: payload.workflowId,
        currentNodeId: payload.currentNodeId,
        retryCount: payload.retryCount || 0,
        trigger: payload.trigger
      });

      // Acknowledge message on success
      channel.ack(msg);

      const processingTime = Date.now() - startTime;
      logger.info('✅ Workflow execution task processed successfully', {
        applicationId: payload.applicationId,
        currentNodeId: payload.currentNodeId,
        processingTimeMs: processingTime,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('❌ Error processing workflow execution task, sending to DLQ', {
        error: error.message,
        stack: error.stack,
        applicationId: payload?.applicationId || 'unknown',
        currentNodeId: payload?.currentNodeId || 'unknown',
        processingTimeMs: processingTime,
        messageId: msg.properties?.messageId
      });

      // Reject message and send to Dead Letter Queue
      channel.nack(msg, false, false);
    }
  };

  channel.consume(QUEUES.WORKFLOW_EXECUTION, messageHandler, { noAck: false });

  logger.info(`🎧 Workflow Execution worker is now consuming from queue: [${QUEUES.WORKFLOW_EXECUTION}]`);
}

// Start the worker
startWorker().catch((error) => {
  logger.error('🚨 Failed to start workflow execution worker:', error);
  process.exit(1);
});
