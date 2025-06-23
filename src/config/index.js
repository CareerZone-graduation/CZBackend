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
  PORT: parseInt(process.env.PORT) || 8080,

  // Database
  DB_URI: process.env.DB_URI || 'mongodb://localhost:27017/careerconnect',
  DB_NAME: process.env.DB_NAME || 'careerconnect',

  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',

  // Google OAuth2
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8080/api/auth/google/callback',

  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_URL: process.env.REDIS_URL,

  // RabbitMQ Configuration
  RABBITMQ_URL: process.env.RABBITMQ_URL,
  RABBITMQ_HOST: process.env.RABBITMQ_HOST ,
  RABBITMQ_PORT: parseInt(process.env.RABBITMQ_PORT ) || 5672,
  RABBITMQ_USERNAME: process.env.RABBITMQ_USERNAME ,
  RABBITMQ_PASSWORD: process.env.RABBITMQ_PASSWORD ,
  RABBITMQ_VIRTUAL_HOST: process.env.RABBITMQ_VIRTUAL_HOST || '/',

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  // VNPay Configuration
  VNPAY_TMN_CODE: process.env.VNPAY_TMN_CODE,
  VNPAY_HASH_SECRET: process.env.VNPAY_HASH_SECRET,
  VNPAY_URL: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  VNPAY_RETURN_URL: process.env.VNPAY_RETURN_URL || 'http://localhost:8080/api/vnpay/callback',
  VNPAY_IPN_URL: process.env.VNPAY_IPN_URL || 'http://localhost:8080/api/vnpay/ipn',

  // Email Configuration
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT) || 587,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@careerconnect.com',

  // Groq AI Configuration (for chatbot)
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama3-8b-8192',

  // Client Configuration
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  
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
