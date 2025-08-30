import request from 'supertest';
import app from '../../src/app.js';
import { server } from '../../src/server.js';
import { User } from '../../src/models/index.js';

describe('Auth Routes API', () => {
  // Close the server after all tests are done
  afterAll((done) => {
    server.close(done);
  });

  // Clean up the User collection before each test
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        email: 'test@example.com',
        password: 'password123',
        fullname: 'Test User',
        role: 'candidate',
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đăng ký thành công. Vui lòng kiểm tra email để xác thực tài khoản.');

      // Check if the user was actually created in the database
      const userInDb = await User.findOne({ email: 'test@example.com' });
      expect(userInDb).not.toBeNull();
    });

    it('should return 400 if email is already taken', async () => {
      // First, create a user
      await User.create({
        email: 'test@example.com',
        password: 'password123',
        fullname: 'Existing User',
        role: 'candidate',
      });

      // Then, try to register with the same email
      const newUser = {
        email: 'test@example.com',
        password: 'password456',
        fullname: 'New User',
        role: 'candidate',
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Email đã được sử dụng.');
    });

    it('should return 400 for invalid data (e.g., missing password)', async () => {
        const newUser = {
            email: 'invalid@example.com',
            fullname: 'Invalid User',
            role: 'candidate',
        };

        const res = await request(app)
            .post('/api/auth/register')
            .send(newUser);

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        // The message comes from Zod validation middleware for a missing required field
        expect(res.body.message).toBe('Required');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a user to test login against
      await User.create({
        email: 'login@example.com',
        password: 'password123', // The service will hash this
        fullname: 'Login User',
        role: 'candidate',
        isEmailVerified: true,
      });
    });

    it('should login an existing user with correct credentials', async () => {
      const credentials = {
        email: 'login@example.com',
        password: 'password123',
      };

      const res = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đăng nhập thành công');
      expect(res.body.data.email).toBe('login@example.com');
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should return 401 for incorrect password', async () => {
      const credentials = {
        email: 'login@example.com',
        password: 'wrongpassword',
      };

      const res = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Email hoặc mật khẩu không chính xác.');
    });

    it('should return 401 for non-existent email', async () => {
      const credentials = {
        email: 'nouser@example.com',
        password: 'password123',
      };

      const res = await request(app)
        .post('/api/auth/login')
        .send(credentials);

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Email hoặc mật khẩu không chính xác.');
    });
  });

  describe('POST /api/auth/logout', () => {
    let token;

    beforeEach(async () => {
      await User.create({
        email: 'logout@example.com',
        password: 'password123',
        fullname: 'Logout User',
        role: 'candidate',
        isEmailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'logout@example.com', password: 'password123' });
      token = res.body.data.accessToken;
    });

    it('should logout the user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đăng xuất thành công');
    });
  });

  describe('PATCH /api/auth/change-password', () => {
    let token;

    beforeEach(async () => {
      await User.create({
        email: 'changepassword@example.com',
        password: 'oldPassword',
        fullname: 'Change Password User',
        role: 'candidate',
        isEmailVerified: true,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'changepassword@example.com', password: 'oldPassword' });
      token = res.body.data.accessToken;
    });

    it('should change the password successfully', async () => {
      const res = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'oldPassword', newPassword: 'newPassword' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đổi mật khẩu thành công.');

      // Try to login with the old password
      const loginWithOldPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'changepassword@example.com', password: 'oldPassword' });
      expect(loginWithOldPassword.statusCode).toEqual(401);

      // Try to login with the new password
      const loginWithNewPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'changepassword@example.com', password: 'newPassword' });
      expect(loginWithNewPassword.statusCode).toEqual(200);
    });

    it('should return 40 for incorrect old password', async () => {
        const res = await request(app)
            .patch('/api/auth/change-password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: 'wrongOldPassword', newPassword: 'newPassword' });

        expect(res.statusCode).toEqual(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Mật khẩu hiện tại không chính xác.');
    });
  });
});
