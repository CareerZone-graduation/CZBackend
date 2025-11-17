// import { Partitioners } from 'kafkajs';
// import kafka from '../config/kafka.js';
// import logger from '../utils/logger.js';

// const producer = kafka.producer({
//     // createPartitioner: Partitioners.LegacyPartitioner,
//   // allowAutoTopicCreation: true,
//   // maxRequestSize: 10485760 // 10MB
// });
// const userInteractionsTopic = 'user-interactions';
// const jobEventsTopic = 'job-events';
// const userEventsTopic = 'user-events';

// let producerConnected = false;

// export const connectProducer = async () => {
//   try {
//     await producer.connect();
//     producerConnected = true;
//     logger.info('Kafka Producer connected successfully.');
    
//     // Use the producer.events enum for event handling
//     producer.on(producer.events.DISCONNECT, () => {
//       logger.warn('Kafka Producer disconnected!');
//       producerConnected = false;
//     });

//   } catch (error) {
//     logger.error('Failed to connect Kafka Producer:', error);
//     // Cân nhắc thử kết nối lại sau một khoảng thời gian
//   }
// };

// export const sendUserInteraction = async (event) => {
//   if (!producerConnected) {
//     logger.warn('Kafka Producer not connected. Skipping message send.');
//     return;
//   }

//   try {
//     await producer.send({
//       topic: userInteractionsTopic,
//       messages: [
//         { value: JSON.stringify(event) },
//       ],
//     });
//     logger.info(`Sent user interaction event to Kafka: ${event.eventType}`, event);
//   } catch (error) {
//     logger.error('Error sending message to Kafka:', { error, event });
//   }
// };

// export const sendJobEvent = async (event) => {
//   if (!producerConnected) {
//     logger.warn('Kafka Producer not connected. Skipping message send.');
//     return;
//   }

//   try {
//     await producer.send({
//       topic: jobEventsTopic,
//       messages: [
//         { value: JSON.stringify(event) },
//       ],
//     });
//     logger.info(`Sent job event to Kafka: ${event.eventType}`, { jobId: event.payload.jobId });
//   } catch (error) {
//     logger.error('Error sending job event to Kafka:', { error, event });
//   }
// };

// export const sendUserEvent = async (event) => {
//   if (!producerConnected) {
//     logger.warn('Kafka Producer not connected. Skipping message send.');
//     return;
//   }

//   try {
//     await producer.send({
//       topic: userEventsTopic,
//       messages: [
//         { value: JSON.stringify(event) },
//       ],
//     });
//     logger.info(`Sent user event to Kafka: ${event.eventType}`, { userId: event.payload.userId });
//   } catch (error) {
//     logger.error('Error sending user event to Kafka:', { error, event });
//   }
// };

// // Định nghĩa cấu trúc event
// // eventType: 'VIEW_JOB', 'SAVE_JOB', 'APPLY_JOB'
// //
// // {
// //   eventType: string,
// //   userId: string,
// //   jobId: string,
// //   timestamp: ISOString,
// //   details: {
// //     weight: number // 1 for view, 3 for save, 5 for apply
// //   }
// // }
