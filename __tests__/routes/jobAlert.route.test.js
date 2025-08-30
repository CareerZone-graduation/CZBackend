import request from 'supertest';
import app from '../../src/app.js';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import User from '../../src/models/User.js';
import JobAlertSubscription from '../../src/models/JobAlertSubscription.js';
import redisClient from '../../src/config/redis.js';

// Mock redisClient methods using spyOn
const sAddSpy = jest.spyOn(redisClient, 'sAdd').mockImplementation(async () => {});
const sRemSpy = jest.spyOn(redisClient, 'sRem').mockImplementation(async () => {});
const mockMulti = {
    sRem: jest.fn().mockReturnThis(),
    sAdd: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(true),
};
jest.spyOn(redisClient, 'multi').mockImplementation(() => mockMulti);

describe('Job Alert API', () => {
    let token;
    let userId;

    beforeEach(async () => {
        // Create a mock user and get a token for each test
        const user = await User.create({
            email: 'testjobalert@example.com',
            password: 'password123',
            role: 'candidate',
            isEmailVerified: true,
        });
        userId = user._id;

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'testjobalert@example.com', password: 'password123' });

        token = res.body.data.accessToken;

        // Clear spies
        sAddSpy.mockClear();
        sRemSpy.mockClear();
        mockMulti.sRem.mockClear();
        mockMulti.sAdd.mockClear();
        mockMulti.exec.mockClear();
    });

    describe('POST /api/job-alerts', () => {
        it('should create a new job alert subscription', async () => {
            const newJobAlert = {
                keyword: 'Software Engineer',
                location: { province: 'Hồ Chí Minh' },
                frequency: 'daily',
                salaryRange: 'OVER_30M',
                type: 'FULL_TIME',
                workType: 'ON_SITE',
                experience: 'MID_LEVEL',
                category: 'SOFTWARE_DEVELOPMENT',
                notificationMethod: 'EMAIL',
            };

            const res = await request(app)
                .post('/api/job-alerts')
                .set('Authorization', `Bearer ${token}`)
                .send(newJobAlert);

            expect(res.statusCode).toEqual(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Đăng ký nhận thông báo việc làm thành công.');
            expect(res.body.data).toHaveProperty('_id');
            expect(res.body.data.keyword).toBe(newJobAlert.keyword);
            expect(sAddSpy).toHaveBeenCalledWith('job_alert:keyword:software engineer', userId.toString());

            const subscriptionInDb = await JobAlertSubscription.findById(res.body.data._id);
            expect(subscriptionInDb).not.toBeNull();
            expect(subscriptionInDb.keyword).toBe(newJobAlert.keyword);
        });

        it('should not create more than 3 active job alerts for a candidate', async () => {
            // Create 3 job alerts
            for (let i = 0; i < 3; i++) {
                await JobAlertSubscription.create({
                    candidateId: userId,
                    keyword: `Test Keyword ${i}`,
                    location: { province: 'Hà Nội' },
                    frequency: 'weekly',
                    salaryRange: 'UNDER_10M',
                    type: 'PART_TIME',
                    workType: 'REMOTE',
                    experience: 'ENTRY_LEVEL',
                    category: 'IT',
                    notificationMethod: 'APPLICATION',
                    active: true,
                });
            }

            const newJobAlert = {
                keyword: 'Fourth Job Alert',
                location: { province: 'Hồ Chí Minh' },
                frequency: 'daily',
                salaryRange: 'OVER_30M',
                type: 'FULL_TIME',
                workType: 'ON_SITE',
                experience: 'MID_LEVEL',
                category: 'SOFTWARE_DEVELOPMENT',
                notificationMethod: 'EMAIL',
            };

            const res = await request(app)
                .post('/api/job-alerts')
                .set('Authorization', `Bearer ${token}`)
                .send(newJobAlert);

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Bạn chỉ có thể tạo tối đa 3 đăng ký.');
            expect(sAddSpy).not.toHaveBeenCalled();
        });

        it('should return 400 if validation fails (e.g., missing required fields)', async () => {
            const invalidJobAlert = {
                keyword: 'Invalid Alert',
                // Missing location, salaryRange, type, workType, experience, category
            };

            const res = await request(app)
                .post('/api/job-alerts')
                .set('Authorization', `Bearer ${token}`)
                .send(invalidJobAlert);

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('Required');
            expect(sAddSpy).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/job-alerts', () => {
        it('should retrieve all job alerts for the authenticated candidate', async () => {
            const jobAlert1 = await JobAlertSubscription.create({
                candidateId: userId,
                keyword: 'Frontend Developer',
                location: { province: 'Hà Nội' },
                frequency: 'weekly',
                salaryRange: '10M_20M',
                type: 'FULL_TIME',
                workType: 'HYBRID',
                experience: 'ENTRY_LEVEL',
                category: 'WEB_DEVELOPMENT',
                notificationMethod: 'APPLICATION',
            });

            const jobAlert2 = await JobAlertSubscription.create({
                candidateId: userId,
                keyword: 'Backend Developer',
                location: { province: 'Đà Nẵng' },
                frequency: 'daily',
                salaryRange: '20M_30M',
                type: 'CONTRACT',
                workType: 'REMOTE',
                experience: 'MID_LEVEL',
                category: 'SOFTWARE_DEVELOPMENT',
                notificationMethod: 'EMAIL',
            });

            const res = await request(app)
                .get('/api/job-alerts')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Lấy danh sách đăng ký thành công.');
            expect(res.body.data).toHaveLength(2);
            expect(res.body.data.map(alert => alert.keyword)).toEqual(expect.arrayContaining([jobAlert1.keyword, jobAlert2.keyword]));
        });

        it('should return an empty array if no job alerts exist for the candidate', async () => {
            const res = await request(app)
                .get('/api/job-alerts')
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Lấy danh sách đăng ký thành công.');
            expect(res.body.data).toHaveLength(0);
        });
    });

    describe('PUT /api/job-alerts/:id', () => {
        it('should update an existing job alert subscription', async () => {
            const jobAlert = await JobAlertSubscription.create({
                candidateId: userId,
                keyword: 'Old Keyword',
                location: { province: 'Hồ Chí Minh' },
                frequency: 'weekly',
                salaryRange: 'UNDER_10M',
                type: 'FULL_TIME',
                workType: 'ON_SITE',
                experience: 'ENTRY_LEVEL',
                category: 'IT',
                notificationMethod: 'EMAIL',
            });

            const updatedData = {
                keyword: 'New Keyword',
                frequency: 'daily',
                active: false,
            };

            const res = await request(app)
                .put(`/api/job-alerts/${jobAlert._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send(updatedData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Cập nhật đăng ký thành công.');
            expect(res.body.data.keyword).toBe(updatedData.keyword);
            expect(res.body.data.frequency).toBe(updatedData.frequency);
            expect(res.body.data.active).toBe(updatedData.active);

            // Check Redis calls for keyword change
            expect(mockMulti.sRem).toHaveBeenCalledWith('job_alert:keyword:old keyword', userId.toString());
            expect(mockMulti.sAdd).toHaveBeenCalledWith('job_alert:keyword:new keyword', userId.toString());
            expect(mockMulti.exec).toHaveBeenCalled();

            const updatedSubscriptionInDb = await JobAlertSubscription.findById(jobAlert._id);
            expect(updatedSubscriptionInDb.keyword).toBe(updatedData.keyword);
            expect(updatedSubscriptionInDb.active).toBe(updatedData.active);
        });

        it('should not update a job alert if it does not belong to the authenticated candidate', async () => {
            const otherUser = await User.create({
                email: 'otheruser@example.com',
                password: 'password123',
                role: 'candidate',
                isEmailVerified: true,
            });
            const otherJobAlert = await JobAlertSubscription.create({
                candidateId: otherUser._id,
                keyword: 'Other User Keyword',
                location: { province: 'Hà Nội' },
                frequency: 'daily',
                salaryRange: 'OVER_30M',
                type: 'FULL_TIME',
                workType: 'ON_SITE',
                experience: 'MID_LEVEL',
                category: 'SOFTWARE_DEVELOPMENT',
                notificationMethod: 'EMAIL',
            });

            const updatedData = { keyword: 'Attempted Update' };

            const res = await request(app)
                .put(`/api/job-alerts/${otherJobAlert._id}`)
                .set('Authorization', `Bearer ${token}`)
                .send(updatedData);

            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Không tìm thấy đăng ký hoặc bạn không có quyền.');
        });

        it('should return 404 if the job alert to update is not found', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const updatedData = { keyword: 'This will fail' };

            const res = await request(app)
                .put(`/api/job-alerts/${nonExistentId}`)
                .set('Authorization', `Bearer ${token}`)
                .send(updatedData);

            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Không tìm thấy đăng ký hoặc bạn không có quyền.');
        });
    });

    describe('DELETE /api/job-alerts/:id', () => {
        it('should delete a job alert subscription', async () => {
            const jobAlert = await JobAlertSubscription.create({
                candidateId: userId,
                keyword: 'To Be Deleted',
                location: { province: 'Hồ Chí Minh' },
                frequency: 'weekly',
                salaryRange: 'UNDER_10M',
                type: 'FULL_TIME',
                workType: 'ON_SITE',
                experience: 'ENTRY_LEVEL',
                category: 'IT',
                notificationMethod: 'EMAIL',
            });

            await redisClient.sAdd('job_alert:keyword:to be deleted', userId.toString());

            const res = await request(app)
                .delete(`/api/job-alerts/${jobAlert._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Xóa đăng ký thành công.');

            expect(sRemSpy).toHaveBeenCalledWith('job_alert:keyword:to be deleted', userId.toString());

            const deletedSubscription = await JobAlertSubscription.findById(jobAlert._id);
            expect(deletedSubscription).toBeNull();
        });

        it('should not delete a job alert if it does not belong to the authenticated candidate', async () => {
            const otherUser = await User.create({
                email: 'anotheruser@example.com',
                password: 'password123',
                role: 'candidate',
                isEmailVerified: true,
            });
            const otherJobAlert = await JobAlertSubscription.create({
                candidateId: otherUser._id,
                keyword: 'Another User Keyword',
                location: { province: 'Hà Nội' },
                frequency: 'daily',
                salaryRange: 'OVER_30M',
                type: 'FULL_TIME',
                workType: 'ON_SITE',
                experience: 'MID_LEVEL',
                category: 'SOFTWARE_DEVELOPMENT',
                notificationMethod: 'EMAIL',
            });

            const res = await request(app)
                .delete(`/api/job-alerts/${otherJobAlert._id}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Không tìm thấy đăng ký để xóa.');

            const subscriptionInDb = await JobAlertSubscription.findById(otherJobAlert._id);
            expect(subscriptionInDb).not.toBeNull();

            await User.findByIdAndDelete(otherUser._id);
        });

        it('should return 404 if the job alert to delete is not found', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();

            const res = await request(app)
                .delete(`/api/job-alerts/${nonExistentId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.statusCode).toEqual(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Không tìm thấy đăng ký để xóa.');
        });
    });
});

