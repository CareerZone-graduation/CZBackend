// import { Kafka } from 'kafkajs';
// import config from './index.js';
// const isSSL = config.KAFKA_SSL_ENABLED === 'true';

// const kafka = new Kafka({
//   clientId: config.KAFKA_CLIENT_ID || 'careerzone-be',
//   brokers: config.KAFKA_BROKERS.split(','), // e.g., "localhost:9092,localhost:9093"
//   sasl: isSSL ? {
//     mechanism: 'scram-sha-256',
//     username: config.KAFKA_SASL_USERNAME,
//     password: config.KAFKA_SASL_PASSWORD,
//   } : undefined,
//   ssl: isSSL ? {
//     rejectUnauthorized: false, // Set to true in production with valid certificates
//   } : false,
// });

// export default kafka;
