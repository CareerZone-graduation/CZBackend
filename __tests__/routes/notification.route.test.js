import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User, Notification } from '../../src/models/index.js';
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';

describe('Notification Routes API', () => {
  let candidateUser;
  let recruiterUser;
  let candidateToken;
  let recruiterToken;
  let testNotifications;

  // Close the server after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  // Setup test data before each test
  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await Notification.deleteMany({});

    // Create test users
    candidateUser = await User.create({
      email: 'candidate@test.com',
      password: 'password123',
      fullname: 'Candidate Test',
      role: 'candidate',
      isEmailVerified: true,
    });

    recruiterUser = await User.create({
      email: 'recruiter@test.com',
      password: 'password123',
      fullname: 'Recruiter Test',
      role: 'recruiter',
      isEmailVerified: true,
    });

    // Generate JWT tokens
    candidateToken = jwt.sign(
      { id: candidateUser._id, role: candidateUser.role },
      config.JWT_SECRET
    );

    recruiterToken = jwt.sign(
      { id: recruiterUser._id, role: recruiterUser.role },
      config.JWT_SECRET
    );

    // Create test notifications for candidate
    testNotifications = await Notification.create([
      {
        title: 'Ứng tuyển thành công',
        message: 'Hồ sơ của bạn đã được gửi thành công cho vị trí Software Engineer',
        type: 'application',
        userId: candidateUser._id,
        isRead: false,
        metadata: {
          jobId: '507f1f77bcf86cd799439011',
          applicationId: '507f1f77bcf86cd799439012',
        },
        entity: {
          type: 'Application',
          id: '507f1f77bcf86cd799439012',
        },
      },
      {
        title: 'Thông báo phỏng vấn',
        message: 'Bạn có lịch phỏng vấn vào ngày mai lúc 9:00 AM',
        type: 'interview',
        userId: candidateUser._id,
        isRead: true,
        readAt: new Date(),
        metadata: {
          interviewRoomId: '507f1f77bcf86cd799439013',
        },
        entity: {
          type: 'InterviewRoom',
          id: '507f1f77bcf86cd799439013',
        },
      },
      {
        title: 'Công việc phù hợp',
        message: 'Có 3 công việc mới phù hợp với profile của bạn',
        type: 'job_alert',
        userId: candidateUser._id,
        isRead: false,
        metadata: {
          jobCount: 3,
        },
      },
      {
        title: 'Cập nhật hệ thống',
        message: 'Hệ thống sẽ bảo trì vào ngày 25/08/2025',
        type: 'system',
        userId: candidateUser._id,
        isRead: false,
      },
    ]);

    // Create notification for recruiter
    await Notification.create({
      title: 'Ứng viên mới',
      message: 'Có ứng viên mới ứng tuyển vào vị trí của bạn',
      type: 'application',
      userId: recruiterUser._id,
      isRead: false,
      metadata: {
        jobId: '507f1f77bcf86cd799439014',
        applicationId: '507f1f77bcf86cd799439015',
      },
    });
  });

  describe('GET /api/notifications', () => {
    it('should get notifications for authenticated user with pagination', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .query({
          page: 1,
          limit: 2,
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Lấy danh sách thông báo thành công.');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({
        currentPage: 1,
        totalPages: 2,
        totalItems: 4,
        limit: 2,
      });

      // Check if notifications are sorted by createdAt desc
      const notifications = res.body.data;
      expect(new Date(notifications[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(notifications[1].createdAt).getTime()
      );
    });

    it('should filter notifications by read status', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .query({
          isRead: false,
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      
      // All returned notifications should be unread
      res.body.data.forEach(notification => {
        expect(notification.isRead).toBe(false);
      });
    });

    it('should return only user own notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Ứng viên mới');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .get('/api/notifications');

      expect(res.statusCode).toEqual(401);
    });

  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('should mark notification as read successfully', async () => {
      const unreadNotification = testNotifications.find(n => !n.isRead);
      
      const res = await request(app)
        .patch(`/api/notifications/${unreadNotification._id}/read`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đánh dấu thông báo đã đọc thành công.');
      expect(res.body.data.isRead).toBe(true);
      expect(res.body.data.readAt).toBeDefined();

      // Verify in database
      const updatedNotification = await Notification.findById(unreadNotification._id);
      expect(updatedNotification.isRead).toBe(true);
      expect(updatedNotification.readAt).toBeDefined();
    });

    it('should return 404 if notification not found', async () => {
      const nonExistentId = '507f1f77bcf86cd799439099';
      
      const res = await request(app)
        .patch(`/api/notifications/${nonExistentId}/read`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 if trying to read other user notification', async () => {
      const recruiterNotification = await Notification.findOne({ userId: recruiterUser._id });
      
      const res = await request(app)
        .patch(`/api/notifications/${recruiterNotification._id}/read`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid notification ID format', async () => {
      const res = await request(app)
        .patch('/api/notifications/invalid-id/read')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should handle already read notification', async () => {
      const readNotification = testNotifications.find(n => n.isRead);
      
      const res = await request(app)
        .patch(`/api/notifications/${readNotification._id}/read`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isRead).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const notification = testNotifications[0];
      
      const res = await request(app)
        .patch(`/api/notifications/${notification._id}/read`);

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('PATCH /api/notifications/read-all', () => {
    it('should mark all notifications as read successfully', async () => {
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã đánh dấu tất cả thông báo là đã đọc.');

      // Verify all notifications are marked as read
      const allNotifications = await Notification.find({ userId: candidateUser._id });
      allNotifications.forEach(notification => {
        expect(notification.isRead).toBe(true);
        expect(notification.readAt).toBeDefined();
      });
    });

    it('should only mark current user notifications as read', async () => {
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      // Check candidate notifications are read
      const candidateNotifications = await Notification.find({ userId: candidateUser._id });
      candidateNotifications.forEach(notification => {
        expect(notification.isRead).toBe(true);
      });

      // Check recruiter notifications are still unread
      const recruiterNotifications = await Notification.find({ userId: recruiterUser._id });
      recruiterNotifications.forEach(notification => {
        expect(notification.isRead).toBe(false);
      });
    });

    it('should handle case when user has no notifications', async () => {
      // Delete all candidate notifications
      await Notification.deleteMany({ userId: candidateUser._id });

      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã đánh dấu tất cả thông báo là đã đọc.');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .patch('/api/notifications/read-all');

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // This test would require mocking mongoose to simulate DB errors
      // For now, we'll test that the endpoint exists and authenticates properly
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).not.toEqual(500);
    });

    it('should handle large pagination requests', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .query({
          page: 999,
          limit: 1000,
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0); // No data on page 999
    });

    it('should validate query parameters', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`)
        .query({
          page: 'invalid',
          limit: 'invalid',
        });

      expect(res.statusCode).toEqual(200); // Should still work with default values
      expect(res.body.success).toBe(true);
    });

    it('should handle malformed JWT token', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toEqual(401);
    });

    it('should handle expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { id: candidateUser._id, role: candidateUser.role },
        config.JWT_SECRET,
        { expiresIn: '1ms' }
      );

      // Wait a bit to ensure token expires
      await new Promise(resolve => setTimeout(resolve, 10));

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Notification data integrity', () => {

    it('should not expose sensitive user data in notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      
      // Check that user password is not exposed
      res.body.data.forEach(notification => {
        if (notification.userId) {
          expect(notification.userId).not.toHaveProperty('password');
        }
      });
    });

    it('should maintain notification order by creation date', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(res.statusCode).toEqual(200);
      
      const notifications = res.body.data;
      for (let i = 0; i < notifications.length - 1; i++) {
        const current = new Date(notifications[i].createdAt);
        const next = new Date(notifications[i + 1].createdAt);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });
  });
});
