import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Application configuration object
 * Contains all environment variables and configuration settings
 */
const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 5000,

  // Database
  DB_URI: process.env.DB_URI,

  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d', // 30 days in milliseconds
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m', // 15 minutes in milliseconds

  // Google OAuth2
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,

  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_URL: process.env.REDIS_URL,

  //Kafka Configuration
  // KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'careerzone-be',
  // KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092', // Comma-separated list of brokers
  // KAFKA_SASL_PASSWORD: process.env.KAFKA_SASL_PASSWORD,
  // KAFKA_SASL_USERNAME: process.env.KAFKA_SASL_USERNAME,
  // KAFKA_SSL_ENABLED: process.env.KAFKA_SSL_ENABLED || 'false', // 'true' or 'false'
  // RabbitMQ Configuration
  RABBITMQ_URL: process.env.RABBITMQ_URL,
  RABBITMQ_HOST: process.env.RABBITMQ_HOST,
  RABBITMQ_PORT: parseInt(process.env.RABBITMQ_PORT) || 5672,
  RABBITMQ_USERNAME: process.env.RABBITMQ_USERNAME,
  RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD,
  RABBITMQ_VIRTUAL_HOST: process.env.RABBITMQ_VIRTUAL_HOST || '/',

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  // Email Configuration
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT, 10),
  EMAIL_USERNAME: process.env.EMAIL_USERNAME,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@careerzone.com',

  // Groq AI Configuration (for chatbot)
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama3-8b-8192',

  // Application URLs
  BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`,
  // Client Configuration
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  // ZaloPay Configuration
  zalopay: {
    app_id: process.env.ZALOPAY_APP_ID,
    key1: process.env.ZALOPAY_KEY1,
    key2: process.env.ZALOPAY_KEY2,
    create_order_url: process.env.ZALOPAY_CREATE_ORDER_URL || 'https://sb-openapi.zalopay.vn/v2/create',
    redirect_url: process.env.ZALOPAY_REDIRECT_URL || `${process.env.CLIENT_URL}/payment/zalopay-redirect`,
  },
  // Momo Configuration
  momo: {
    partnerCode: process.env.MOMO_PARTNER_CODE,
    accessKey: process.env.MOMO_ACCESS_KEY,
    secretKey: process.env.MOMO_SECRET_KEY,
    apiEndpoint: process.env.MOMO_API_ENDPOINT,
    redirectUrl: process.env.MOMO_REDIRECT_URL,
    ipnUrl: process.env.MOMO_IPN_URL,
  },

  // VNPay Configuration (object format)
  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE,
    hashSecret: process.env.VNPAY_HASH_SECRET,
    url: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:5000/api/payments/vnpay-redirect',
    ipnUrl: process.env.VNPAY_IPN_URL || 'http://localhost:5000/api/payments/vnpay-ipn',
  },

  // File Upload Configuration
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES?.split(',') || ['image/jpeg', 'image/png', 'application/pdf'],

  // Security
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,

  // Pagination
  DEFAULT_PAGE_SIZE: parseInt(process.env.DEFAULT_PAGE_SIZE) || 10,
  MAX_PAGE_SIZE: parseInt(process.env.MAX_PAGE_SIZE) || 100,

  RECRUITER_FE_URL: process.env.RECRUITER_FE_URL || 'http://localhost:4000',
  CANDIDATE_FE_URL: process.env.CANDIDATE_FE_URL || 'http://localhost:3000',
  ADMIN_FE_URL: process.env.ADMIN_FE_URL || 'http://localhost:5000'
};

// Validate required environment variables
const requiredEnvVars = [
  'DB_URI',
  'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !config[envVar]);

if (missingEnvVars.length > 0 && config.NODE_ENV === 'production') {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}
export default config;
