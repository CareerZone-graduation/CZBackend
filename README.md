# CareerConnect Backend - Express.js Migration

This is a complete migration of the CareerConnect job portal from Java Spring Boot to a modern Express.js application.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18+
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with bcryptjs
- **Validation**: Zod schemas
- **Real-time**: Socket.IO for chat and video interviews
- **File Upload**: Cloudinary integration
- **Queue**: RabbitMQ for background jobs
- **Cache**: Redis for session and data caching
- **Payment**: VNPay integration for coin recharge
- **Email**: Nodemailer with queue support
- **Documentation**: JSDoc comments
- **Security**: Helmet, CORS, rate limiting

## Features

### Core Features
- ✅ User Authentication & Authorization (JWT-based)
- ✅ Role-based Access Control (Admin, Recruiter, Candidate)
- ✅ Company Management & Verification
- ✅ Job Posting & Management
- ✅ Application Management & Tracking
- ✅ Real-time Chat System
- ✅ Video Interview Rooms
- ✅ Notification System
- ✅ File Upload & Management
- ✅ Payment Integration (VNPay)
- ✅ Admin Dashboard & Analytics
- ✅ Email Notifications

### Advanced Features
- ✅ Background Job Processing (RabbitMQ)
- ✅ Real-time Updates (Socket.IO)
- ✅ Caching Layer (Redis)
- ✅ File Storage (Cloudinary)
- ✅ Search & Filtering
- ✅ Pagination
- ✅ Error Handling & Logging
- ✅ Security Middleware
- ✅ API Documentation

## Project Structure

```
src/
├── config/           # Configuration files
├── controllers/      # Route controllers
├── middleware/       # Express middleware
├── models/          # Mongoose models
├── routes/          # Express routes
├── schemas/         # Zod validation schemas
├── services/        # Business logic services
├── socket/          # Socket.IO handlers
├── utils/           # Utility functions
└── server.js        # Main server file
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/careerconnect

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# VNPay
VNP_TMN_CODE=your-vnpay-terminal-code
VNP_HASH_SECRET=your-vnpay-hash-secret
VNP_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNP_RETURN_URL=http://localhost:3000/payment/vnpay-return

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## Installation & Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Database**
   - Install and start MongoDB
   - Install and start Redis
   - Install and start RabbitMQ

3. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Update environment variables

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Start Production Server**
   ```bash
   npm run prod
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/forgot-password` - Forgot password
- `POST /api/auth/reset-password` - Reset password

### Users
- `GET /api/users` - Get users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/upload-avatar` - Upload avatar
- `POST /api/users/upload-cv` - Upload CV

### Companies
- `POST /api/companies` - Create company
- `GET /api/companies` - Get companies
- `GET /api/companies/:id` - Get company by ID
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company
- `POST /api/companies/:id/follow` - Follow/Unfollow company

### Jobs
- `POST /api/jobs` - Create job
- `GET /api/jobs` - Get jobs
- `GET /api/jobs/:id` - Get job by ID
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/save` - Save/Unsave job

### Applications
- `POST /api/applications` - Apply for job
- `GET /api/applications` - Get applications
- `GET /api/applications/:id` - Get application by ID
- `PUT /api/applications/:id/status` - Update application status
- `DELETE /api/applications/:id` - Delete application

### Chat
- `GET /api/chat/rooms` - Get chat rooms
- `GET /api/chat/:participantId/messages` - Get messages
- `PUT /api/chat/:participantId/read` - Mark messages as read
- `GET /api/chat/unread-count` - Get unread count

### Interviews
- `POST /api/interviews` - Create interview room
- `GET /api/interviews/my` - Get user's interviews
- `GET /api/interviews/:roomId` - Get interview room
- `POST /api/interviews/:roomId/join` - Join interview
- `PUT /api/interviews/:roomId/end` - End interview

### Notifications
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/mark-all-read` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/status` - Update user status
- `GET /api/admin/companies` - Get all companies
- `PUT /api/admin/companies/:id/verification` - Update verification
- `GET /api/admin/analytics` - Get analytics

### Payment (VNPay)
- `POST /api/vnpay/create-payment` - Create payment
- `GET /api/vnpay/return` - Payment return handler
- `POST /api/vnpay/ipn` - Payment IPN handler
- `GET /api/vnpay/payments` - Get payment history

## Socket.IO Events

### Chat Events
- `join_room` - Join chat room
- `leave_room` - Leave chat room
- `send_message` - Send message
- `message_received` - Receive message
- `typing` - Typing indicator
- `stop_typing` - Stop typing

### Interview Events
- `join_interview` - Join interview room
- `leave_interview` - Leave interview room
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice_candidate` - ICE candidate
- `interview_ended` - Interview ended

### Notification Events
- `notification` - New notification
- `notification_read` - Notification read

## Models

### User Model
- Authentication fields (email, password)
- Profile information (name, avatar, etc.)
- Role-based access control
- Account status management

### Company Model
- Company information and branding
- Verification status
- Follower system
- Statistics tracking

### Job Model
- Job details and requirements
- Application tracking
- Status management
- Search and filtering support

### Application Model
- Application tracking
- Status workflow
- File attachments
- Interview scheduling

### Chat & Interview Models
- Real-time messaging
- Video interview rooms
- WebRTC signaling support
- Message history

## Services

### Authentication Service
- JWT token management
- Password hashing and validation
- Role-based authorization
- Session management

### Email Service
- Template-based emails
- Queue integration
- SMTP configuration
- Notification emails

### File Upload Service
- Cloudinary integration
- Image optimization
- File type validation
- Secure upload handling

### Queue Service
- RabbitMQ integration
- Background job processing
- Email queue management
- Scalable architecture

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- CORS configuration
- Helmet security headers
- Input validation with Zod
- SQL injection prevention
- XSS protection

## Performance Features

- MongoDB indexing
- Redis caching
- Response compression
- Pagination
- Background job processing
- Connection pooling
- Memory optimization

## Development

### Code Style
- ES6+ JavaScript
- JSDoc documentation
- Error handling best practices
- Consistent naming conventions
- Modular architecture

### Testing
- Unit tests for services
- Integration tests for API endpoints
- Socket.IO event testing
- Database testing with test containers

### Deployment
- Docker containerization
- Environment-based configuration
- Health check endpoints
- Logging and monitoring
- Graceful shutdown handling

## Migration Status

✅ **Completed Features:**
- Complete project setup and configuration
- All Mongoose models with proper relationships
- Zod validation schemas for all DTOs
- JWT authentication and authorization middleware
- All controller and service implementations
- Socket.IO real-time communication setup
- Background job processing with RabbitMQ
- File upload integration with Cloudinary
- Email service with queue support
- VNPay payment integration
- Admin dashboard and analytics
- All API routes with proper validation
- Error handling and logging

⚠️ **Pending Items:**
- Unit and integration tests
- Docker containerization
- Production deployment configuration
- API documentation (Swagger/OpenAPI)
- Performance optimization
- Monitoring and logging setup

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.
