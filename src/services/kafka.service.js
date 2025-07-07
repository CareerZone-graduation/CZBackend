import kafka from '../config/kafka.js';
import logger from '../utils/logger.js';

const producer = kafka.producer();
const topic = 'user-interactions'; // Tên topic của chúng ta

let producerConnected = false;

export const connectProducer = async () => {
  try {
    await producer.connect();
    producerConnected = true;
    logger.info('Kafka Producer connected successfully.');
    
    // Use the producer.events enum for event handling
    producer.on(producer.events.DISCONNECT, () => {
      logger.warn('Kafka Producer disconnected!');
      producerConnected = false;
    });

  } catch (error) {
    logger.error('Failed to connect Kafka Producer:', error);
    // Cân nhắc thử kết nối lại sau một khoảng thời gian
  }
};

export const sendUserInteraction = async (event) => {
  if (!producerConnected) {
    logger.warn('Kafka Producer not connected. Skipping message send.');
    return;
  }

  try {
    await producer.send({
      topic: topic,
      messages: [
        { value: JSON.stringify(event) },
      ],
    });
    logger.info(`Sent user interaction event to Kafka: ${event.eventType}`, event);
  } catch (error) {
    logger.error('Error sending message to Kafka:', { error, event });
  }
};

// Định nghĩa cấu trúc event
// eventType: 'VIEW_JOB', 'SAVE_JOB', 'APPLY_JOB'
//
// {
//   eventType: string,
//   userId: string,
//   jobId: string,
//   timestamp: ISOString,
//   details: {
//     weight: number // 1 for view, 3 for save, 5 for apply
//   }
// }
