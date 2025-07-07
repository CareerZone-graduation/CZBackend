import { Kafka } from 'kafkajs';
import config from './index.js';

const kafka = new Kafka({
  clientId: config.KAFKA_CLIENT_ID || 'careerzone-be',
  brokers: config.KAFKA_BROKERS.split(','), // e.g., "localhost:9092,localhost:9093"
});

export default kafka;
