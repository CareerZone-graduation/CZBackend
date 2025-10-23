// Initialize Firebase Admin SDK
import './config/firebase.js';
// 📦 Core Dependencies
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport'; // Đảm bảo có import này
import path from 'path';
import { fileURLToPath } from 'url';
import './config/passport.js'; // Import để cấu hình passport

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚙️ Configuration
import config from './config/index.js';
import './config/redis.js'; // Initialize Redis connection

// 🚦 Routes
import authRoutes from './routes/auth.route.js';
import userRoutes from './routes/user.route.js';
import jobRoutes from './routes/job.route.js';
import candidateRoutes from './routes/candidate.route.js';
import companyRoutes from './routes/company.route.js';
import applicationRoutes from './routes/application.route.js';
import jobAlertRoutes from './routes/jobAlert.route.js';
import notificationRoutes from './routes/notification.route.js';
import templateRoutes from './routes/template.route.js';
import cvRoutes from './routes/cv.route.js';
import aiRoutes from './routes/ai.route.js';
import paymentRoutes from './routes/payment.route.js';
import chatRoutes from './routes/chat.route.js';
import adminRoutes from './routes/admin.route.js';
import interviewRoutes from './routes/interview.route.js';
import analyticsRoutes from './routes/analytics.route.js'; // [MỚI] Import route mới
import sonioxRoutes from './routes/soniox.route.js'; // Soniox voice search API
import searchHistoryRoutes from './routes/searchHistory.route.js'; // Search history API

// 🚧 Middlewares
import * as errorMiddleware from './middleware/error.middleware.js';
import * as notFoundMiddleware from './middleware/notFound.middleware.js';

dotenv.config();

const app = express();

// Cấu hình view engine (chỉ dành cho 1 số trang như xác thực email trả về HTML)
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Bảo mật
// app.use(
//     helmet({
//         crossOriginResourcePolicy: { policy: 'cross-origin' },
//     }),
// );

// // Giới hạn số request
// app.use(
//     '/api/',
//     rateLimit({
//         windowMs: 15 * 60 * 1000,
//         max: 1000000,
//         message: 'Too many requests from this IP, please try again later.',
//         standardHeaders: true,
//         legacyHeaders: false,
//     }),
// );

// CORS
// app.use(
//     cors({
//         origin: [config.CLIENT_URL,"http://localhost:3001","http://localhost:3000","http://localhost:3002", "http://localhost:3003","http://*.ngrok-free.app"],
//         credentials: true,
//         methods: ['GET', 'POST','PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
//         allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
//     }),
// );
app.use(cors({
  origin: true,       // cho phép tất cả origin hợp lệ
  credentials: true   // cho phép cookie, auth header
}));

// app.options("*", cors()); // xử lý preflight
// Khác
const shouldCompress = (req, res) => {
  if (req.noCompression) {
    // don't compress responses with this request header
    return false;
  }
  // fallback to standard filter function
  return compression.filter(req, res);
};
app.use(compression({ filter: shouldCompress }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// === KHỞI TẠO PASSPORT ===
app.use(passport.initialize());

// Health check
app.get('/health', (_, res) =>
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
    }),
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/job-alerts', jobAlertRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/cvs', cvRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/analytics', analyticsRoutes); // [MỚI] Thêm route mới vào app
app.use('/api/soniox', sonioxRoutes); // Soniox voice search API
app.use('/api/search-history', searchHistoryRoutes); // Search history API

// 404 & error
app.use(notFoundMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

export default app;
