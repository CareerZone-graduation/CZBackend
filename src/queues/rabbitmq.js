// src/queues/rabbitmq.js
import amqplib from 'amqplib'; // Thư viện chính để tương tác với RabbitMQ
import config from '../config/index.js'; // Import cấu hình, ví dụ như chuỗi kết nối RabbitMQ
import logger from '../utils/logger.js'; // Import logger để ghi log

/**
 * @constant {string} EXCHANGE
 * Tên của exchange chính, nơi publisher gửi message đến.
 * Đây là một "topic" exchange, cho phép định tuyến message một cách linh hoạt dựa trên routing key.
 */
const EXCHANGE = 'notifications_exchange';

/**
 * @constant {string} DLX
 * Tên của Dead-Letter-Exchange.
 * Đây là một exchange đặc biệt dùng để hứng các message bị lỗi (bị reject, hết hạn, hoặc queue quá tải).
 * Chúng ta dùng loại 'fanout' để mọi queue được bind tới nó đều sẽ nhận được message lỗi, không cần routing key.
 */
const DLX = 'notifications_dlx';

/**
 * @constant {Object} ROUTING_KEYS
 * Định nghĩa các "chủ đề" hay "khóa định tuyến" cho message.
 * Publisher sẽ gửi message tới EXCHANGE kèm theo một trong các key này.
 * Exchange sẽ dựa vào key này để quyết định message sẽ được chuyển đến queue nào.
 * Cấu trúc 'notification.<loại_thông_báo>' giúp dễ dàng lọc theo mẫu, ví dụ 'notification.*'.
 */
export const ROUTING_KEYS = {
  STATUS_UPDATE: 'notification.status_update', // Dành cho cập nhật trạng thái đơn ứng tuyển (bao gồm đã nộp đơn thành công, nhà tuyển dụng đánh giá ứng viên, lên lịch phỏng vấn)
  INTERVIEW_REMINDER: 'notification.interview_reminder', // Dành cho nhắc lịch phỏng vấn
  INTERVIEW_RESCHEDULE: 'notification.interview_reschedule', // Dành cho dời lịch phỏng vấn
  INTERVIEW_CANCEL: 'notification.interview_cancel', // Dành cho hủy lịch phỏng vấn
  INTERVIEW_COMPLETE: 'notification.interview_complete', // Dành cho hoàn thành phỏng vấn
  INTERVIEW_STARTED: 'notification.interview_started', // Dành cho thông báo phỏng vấn đã bắt đầu
  RECORDING_AVAILABLE: 'notification.recording_available', // Dành cho thông báo recording đã sẵn sàng
  JOB_APPROVAL: 'notification.job_approval', // Dành cho thông báo phê duyệt tin tuyển dụng
  COMPANY_VERIFICATION: 'notification.company_verification', // Dành cho thông báo xác thực công ty
  EMAIL_SEND: 'notification.email.send', // Dành cho các tác vụ gửi email chung
  NEW_APPLICATION: 'notification.new_application', // Dành cho thông báo ứng viên mới apply
  JOB_ALERT_DAILY: 'notification.job_alert.daily', // Dành cho thông báo việc làm hàng ngày
  JOB_ALERT_WEEKLY: 'notification.job_alert.weekly', // Dành cho thông báo việc làm hàng tuần
};

/**
 * @constant {Object} QUEUES
 * Tên của các queue vật lý, nơi lưu trữ message cho đến khi consumer xử lý.
 */
export const QUEUES = {
  IMMEDIATE: 'immediate-notifications', // Queue cho các thông báo cần xử lý ngay lập tức
  DIGEST: 'digest-notifications', // Queue cho các thông báo tổng hợp, xử lý theo đợt
  DLQ: 'notifications-dlq', // Dead-Letter-Queue: Queue chứa các message bị lỗi sau khi đã đi qua DLX
};

// =================================== CHANNEL SETUP ===================================

// Biến channel sẽ được sử dụng lại (singleton pattern) để tránh tạo kết nối và channel mới mỗi lần cần dùng.
let channel;

/**
 * Khởi tạo kết nối đến RabbitMQ, thiết lập channel và toàn bộ cấu trúc (topology) gồm exchange và queue.
 * Nếu channel đã tồn tại, hàm sẽ trả về channel đó ngay lập tức.
 * @returns {Promise<amqplib.Channel>} Một đối tượng channel để giao tiếp với RabbitMQ.
 */
export async function getChannel() {
  // Nếu đã có channel, trả về ngay để tái sử dụng.
  if (channel) return channel;

  try {
    // 1. Tạo kết nối đến server RabbitMQ
    const conn = await amqplib.connect(config.RABBITMQ_URL);
    // Bắt sự kiện khi kết nối bị đóng để xử lý (ví dụ: cố gắng kết nối lại)
    conn.on('close', () => {
        logger.warn('RabbitMQ connection closed!');
        channel = null; // Reset channel để lần gọi getChannel() tiếp theo sẽ tạo lại
    });

    // 2. Tạo một channel trên kết nối đó. Hầu hết các thao tác sẽ được thực hiện qua channel.
    channel = await conn.createChannel();

    // --- Khai Báo Các Exchange ---

    // 3. Khai báo exchange chính ('topic').
    // 'durable: true' đảm bảo exchange sẽ tồn tại sau khi RabbitMQ server khởi động lại.
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    // 4. Khai báo Dead-Letter-Exchange ('fanout').
    // 'fanout' sẽ gửi message đến tất cả các queue được bind với nó mà không cần quan tâm đến routing key.
    // Điều này rất hữu ích để gom tất cả message lỗi về một nơi.
    await channel.assertExchange(DLX, 'fanout', { durable: true });

    // --- Cấu Hình Các Queues Và Bindings ---

    // 5. Queue cho thông báo TỨC THÌ (status update, interview reminder)
    await channel.assertQueue(QUEUES.IMMEDIATE, {
      durable: true, // Queue sẽ tồn tại sau khi server khởi động lại.
      deadLetterExchange: DLX, // Nếu message trong queue này bị lỗi, nó sẽ được gửi đến DLX.
    });
    // Tham số thứ ba của hàm bindQueue là Binding Key. Nó không bắt buộc phải là một giá trị được định nghĩa trong object ROUTING_KEYS.
    // Gắn (bind) queue này với exchange chính để nhận message có routing key tương ứng.
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.STATUS_UPDATE);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.INTERVIEW_REMINDER);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.INTERVIEW_RESCHEDULE);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.INTERVIEW_CANCEL);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.INTERVIEW_COMPLETE);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.INTERVIEW_STARTED);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.RECORDING_AVAILABLE);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.EMAIL_SEND);
    await channel.bindQueue(QUEUES.IMMEDIATE, EXCHANGE, ROUTING_KEYS.NEW_APPLICATION); // THÊM: Bind routing key mới

    // 6. Queue cho thông báo TỔNG HỢP (daily digest)  (job alert)
    await channel.assertQueue(QUEUES.DIGEST, {
      durable: true,
      deadLetterExchange: DLX,
    });
    await channel.bindQueue(QUEUES.DIGEST, EXCHANGE, ROUTING_KEYS.JOB_ALERT_DAILY); // Job alert daily notifications
    await channel.bindQueue(QUEUES.DIGEST, EXCHANGE, ROUTING_KEYS.JOB_ALERT_WEEKLY); // Job alert weekly notifications

    // 7. Queue chứa các message lỗi (Dead-Letter Queue - DLQ)
    // Queue này sẽ lưu trữ tất cả message được gửi từ DLX.
    await channel.assertQueue(QUEUES.DLQ, { durable: true });
    // Gắn DLQ với DLX. Routing key là '' vì DLX là loại 'fanout', nó sẽ bỏ qua key này
    // và gửi tất cả message nhận được đến DLQ.
    await channel.bindQueue(QUEUES.DLQ, DLX, '');

    logger.info('RabbitMQ topology (exchange, queues, bindings) created successfully.');
    return channel;

  } catch (error) {
    // Nếu có lỗi trong quá trình kết nối hoặc thiết lập, ghi log và thoát ứng dụng.
    // Đây là một lỗi nghiêm trọng vì hệ thống không thể hoạt động nếu thiếu message broker.
    logger.error('Failed to connect or setup RabbitMQ topology', error);
    process.exit(1); // Thoát tiến trình với mã lỗi
  }
}

// Gợi ý: Gọi hàm getChannel() trong file khởi động server (ví dụ: src/server.js)
// để đảm bảo mọi thứ được sẵn sàng ngay khi ứng dụng bắt đầu chạy.
