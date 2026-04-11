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
import morgan from 'morgan';
import logger from './utils/logger.js';


// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚙️ Configuration
import config from './config/index.js';
import './config/redis.js'; // Initialize Redis connection
import { connectAutocompleteDB } from './config/autocompleteDb.js'; // Autocomplete DB
import { connectKnowledgeDB } from './config/knowledgeDb.js'; // Knowledge DB (secondary cluster)

// Initialize autocomplete database connection
connectAutocompleteDB().catch(err => console.error('Autocomplete DB init failed:', err.message));
// Initialize knowledge database connection (KnowledgeChunk lives here for Atlas Search index)
connectKnowledgeDB().catch(err => console.error('Knowledge DB init failed:', err.message));

// 🚦 Routes
import authRoutes from './routes/auth.route.js';
import userRoutes from './routes/user.route.js';
import jobRoutes from './routes/job.route.js';
import candidateRoutes from './routes/candidate.route.js';
import companyRoutes from './routes/company.route.js';
import recruiterRoutes from './routes/recruiter.route.js';
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
import viewHistoryRoutes from './routes/viewHistory.route.js'; // Job view history API
import creditHistoryRoutes from './routes/creditHistory.route.js'; // Credit history API
import sharePreviewRoutes from './routes/sharePreview.route.js'; // Facebook share preview
import talentPoolRoutes from './routes/talentPool.route.js'; // Talent pool management
import supportRequestRoutes from './routes/supportRequest.route.js'; // Support request system
import contactRoutes from './routes/contact.route.js'; // Public contact form
import aiInterviewRoutes from './routes/aiInterview.route.js'; // MỚI: Route orchestration API sang FastAPI
import interactionRoutes from './routes/interaction.route.js';
import copilotRoutes from './routes/copilot.route.js'; // Copilot API
import knowledgeBaseRoutes from './routes/knowledgeBase.route.js';
import knowledgeChatRoutes from './routes/knowledgeChat.route.js';

// 🚧 Middlewares
import * as errorMiddleware from './middleware/error.middleware.js';
import * as notFoundMiddleware from './middleware/notFound.middleware.js';

dotenv.config();

const app = express();
// app.use(morgan('combined', { stream: logger.stream }));
// if (process.env.NODE_ENV === "development") {
//   app.use(morgan("combined", { stream: logger.stream }));
// }

// Cấu hình view engine (chỉ dành cho 1 số trang như xác thực email trả về HTML)
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Bảo mật
// app.use(
//     helmet({
//         crossOriginResourcePolicy: { policy: 'cross-origin' },
//     }),
// );
app.set('trust proxy', 1);
// Giới hạn số request
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  }),
);


// CORS
// app.use(
//     cors({
//         origin: [config.CANDIDATE_FE_URL,"http://localhost:3001","http://localhost:3000","http://localhost:3002", "http://localhost:3003","http://*.ngrok-free.app"],
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

// === KHỞI TẠO PASSPORT ===
app.use(passport.initialize());


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

// welcome
app.get('/', (_, res) => res.status(200).json(
  { message: 'Welcome to CareerZone API!' }
))
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
app.use('/api/recruiters', recruiterRoutes);
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
app.use('/api/analytics', analyticsRoutes);
app.use('/api/soniox', sonioxRoutes);
app.use('/api/search-history', searchHistoryRoutes);
app.use('/api/job-view-history', viewHistoryRoutes);
app.use('/api/credit-history', creditHistoryRoutes);
app.use('/api/share-preview', sharePreviewRoutes);
app.use('/api/talent-pool', talentPoolRoutes);
app.use('/api/support-requests', supportRequestRoutes);
app.use('/api/contact', contactRoutes);

app.use('/api/ai-interview', aiInterviewRoutes); // MỚI: Route orchestration API sang FastAPI
app.use('/api/interactions', interactionRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/recruiter/knowledge-base', knowledgeBaseRoutes);
app.use('/api/candidate/chat', knowledgeChatRoutes);

// 404 & error
app.use(notFoundMiddleware.notFound);
app.use(errorMiddleware.errorHandler);

export default app;
