// 📦 Core Dependencies
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport'; // Đảm bảo có import này
import './config/passport.js'; // Import để cấu hình passport

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

// 🚧 Middlewares
import * as errorMiddleware from './middleware/error.middleware.js';
import * as notFoundMiddleware from './middleware/notFound.middleware.js';

dotenv.config();

const app = express();

// Bảo mật
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
);

// Giới hạn số request
app.use(
    '/api/',
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 1000000,
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
    }),
);

// CORS
app.use(
    cors({
        origin: [config.CLIENT_URL,"http://localhost:3001","http://localhost:3000","http://localhost:3002", "http://localhost:3003"],
        credentials: true,
        methods: ['GET', 'POST','PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
);

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

// 404 & error
app.use(notFoundMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

export default app;
