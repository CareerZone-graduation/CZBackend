import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import config from './config/index.js';
import authRoutes from './routes/auth.route.js';
// import userRoutes from './routes/user.route.js'; // No longer in use
import jobRoutes from './routes/job.route.js';
import candidateRoutes from './routes/candidate.route.js';
import companyRoutes from './routes/company.route.js';
import applicationRoutes from './routes/application.route.js';
import jobAlertRoutes from './routes/jobAlert.route.js';
import notificationRoutes from './routes/notification.route.js';

import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/notFound.middleware.js';
import './config/redis.js'; // Initialize Redis connection

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
        origin: config.CLIENT_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
);

// Khác
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

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
// app.use('/api/users', userRoutes); // No longer in use
app.use('/api/jobs', jobRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/job-alerts', jobAlertRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 & error
app.use(notFound);
app.use(errorHandler);

export default app;
