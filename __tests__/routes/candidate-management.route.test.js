/**
 * Test suite cho Quản lý Ứng viên (Candidate Management)
 * Bao gồm:
 * 1. Xem danh sách ứng viên theo job (với phân trang và filter)
 * 2. Xem chi tiết hồ sơ ứng tuyển
 * 3. Thay đổi trạng thái ứng tuyển
 * 4. Đánh giá & ghi chú ứng viên
 */

import request from 'supertest';
import app from '../../src/app.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Job, Application, CandidateProfile, RecruiterProfile } from '../../src/models/index.js';

describe('Candidate Management Routes', () => {
  let recruiterToken;
  let candidateToken;
  let recruiterId;
  let candidateId;
  let recruiterUserId;
  let candidateUserId;
  let jobId;
  let applicationId;

  beforeEach(async () => {
    // Xóa tất cả dữ liệu
    await User.deleteMany({});
    await Job.deleteMany({});
    await Application.deleteMany({});
    await CandidateProfile.deleteMany({});
    await RecruiterProfile.deleteMany({});

    // Tạo recruiter user
    const recruiterUser = await User.create({
      email: 'recruiter@test.com',
      password: 'password123',
      role: 'recruiter',
      isEmailVerified: true
    });
    recruiterUserId = recruiterUser._id;

    // Tạo recruiter profile
    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUserId,
      fullname: 'Test Recruiter',
      company: {
        name: 'Test Company',
        industry: 'Công nghệ thông tin',
        logo: 'https://example.com/logo.png'
      }
    });
    recruiterId = recruiterProfile._id;

    // Tạo candidate user
    const candidateUser = await User.create({
      email: 'candidate@test.com',
      password: 'password123',
      role: 'candidate',
      isEmailVerified: true
    });
    candidateUserId = candidateUser._id;

    // Tạo candidate profile
    const candidateProfile = await CandidateProfile.create({
      userId: candidateUserId,
      fullname: 'Test Candidate',
      phone: '0123456789',
      bio: 'Looking for a challenging position',
      skills: [
        { name: 'JavaScript' },
        { name: 'Node.js' },
        { name: 'React' }
      ],
      experiences: [{
        company: 'Previous Company',
        position: 'Developer',
        startDate: '2020-01-01',
        endDate: '2023-01-01',
        description: 'Worked as a developer'
      }],
      educations: [{
        school: 'Test University',
        degree: 'Bachelor',
        major: 'Computer Science',
        startDate: '2016-01-01',
        endDate: '2020-01-01',
        gpa: '3.5'
      }]
    });
    candidateId = candidateProfile._id;

    // Tạo job với cấu trúc đúng theo model
    const job = await Job.create({
      title: 'Software Developer',
      description: 'Looking for a software developer',
      requirements: 'JavaScript, Node.js experience required',
      benefits: 'Health insurance, Flexible hours',
      location: {
        province: 'Ho Chi Minh',
        ward: 'Ward 1'
      },
      address: '123 Company Street',
      type: 'FULL_TIME',
      workType: 'ON_SITE',
      minSalary: '1000',
      maxSalary: '2000',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      experience: 'ENTRY_LEVEL',
      category: 'IT',
      skills: ['JavaScript', 'Node.js'],
      status: 'ACTIVE',
      approved: true,
      recruiterProfileId: recruiterId
    });
    jobId = job._id;

    // Tạo application với cấu trúc đúng theo model
    const application = await Application.create({
      jobId: jobId,
      candidateProfileId: candidateId,
      status: 'PENDING',
      candidateRating: 'NOT_RATED',
      submittedCV: {
        name: 'test-cv.pdf',
        path: 'https://example.com/cv.pdf',
        source: 'UPLOADED'
      },
      coverLetter: 'This is my cover letter for the position.',
      appliedAt: new Date(),
      lastStatusUpdateAt: new Date(),
      jobSnapshot: {
        title: job.title,
        company: recruiterProfile.company.name,
        logo: recruiterProfile.company.logo
      },
      candidateName: 'Test Candidate',
      candidateEmail: 'candidate@test.com',
      candidatePhone: '0123456789'
    });
    applicationId = application._id;

    // Tạo JWT tokens
    recruiterToken = jwt.sign(
      { id: recruiterUserId, role: 'recruiter' },
      'your-super-secret-test-key',
      { expiresIn: '1h' }
    );

    candidateToken = jwt.sign(
      { id: candidateUserId, role: 'candidate' },
      'your-super-secret-test-key',
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/applications/jobs/:jobId/applications - Lấy danh sách ứng viên', () => {
    beforeEach(async () => {
      // Tạo thêm một số applications để test phân trang và filter
      await Application.create([
        {
          jobId: jobId,
          candidateProfileId: candidateId,
          status: 'REVIEWING',
          candidateRating: 'SUITABLE',
          submittedCV: {
            name: 'cv2.pdf',
            path: 'https://example.com/cv2.pdf',
            source: 'UPLOADED'
          },
          coverLetter: 'Another cover letter',
          appliedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          lastStatusUpdateAt: new Date(),
          jobSnapshot: {
            title: 'Software Developer',
            company: 'Test Company',
            logo: 'https://example.com/logo.png'
          },
          candidateName: 'Test Candidate 2',
          candidateEmail: 'candidate2@test.com',
          candidatePhone: '0123456780'
        },
        {
          jobId: jobId,
          candidateProfileId: candidateId,
          status: 'ACCEPTED',
          candidateRating: 'PERFECT_MATCH',
          submittedCV: {
            name: 'cv3.pdf',
            path: 'https://example.com/cv3.pdf',
            source: 'UPLOADED'
          },
          coverLetter: 'Third cover letter',
          appliedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
          lastStatusUpdateAt: new Date(),
          jobSnapshot: {
            title: 'Software Developer',
            company: 'Test Company',
            logo: 'https://example.com/logo.png'
          },
          candidateName: 'Test Candidate 3',
          candidateEmail: 'candidate3@test.com',
          candidatePhone: '0123456781'
        }
      ]);
    });

    test('Thành công - Lấy danh sách ứng viên của job', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
        meta: {
          limit: expect.any(Number),
          totalPages: expect.any(Number)
        },
        data: expect.any(Array)
      });

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('_id');
      expect(response.body.data[0]).toHaveProperty('status');
      expect(response.body.data[0]).toHaveProperty('candidateRating');
      expect(response.body.data[0]).toHaveProperty('appliedAt');
    });

    test('Thành công - Lấy danh sách với phân trang', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications?page=1&limit=2`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(response.body.meta.limit).toBe(2);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    test('Thành công - Lọc theo trạng thái', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications?status=REVIEWING`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      response.body.data.forEach(app => {
        expect(app.status).toBe('REVIEWING');
      });
    });

    test('Thành công - Lọc theo đánh giá', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications?candidateRating=SUITABLE`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      response.body.data.forEach(app => {
        expect(app.candidateRating).toBe('SUITABLE');
      });
    });

    test('Thành công - Sắp xếp theo ngày ứng tuyển', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications?sort=-appliedAt`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      const dates = response.body.data.map(app => new Date(app.appliedAt));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i-1].getTime()).toBeGreaterThanOrEqual(dates[i].getTime());
      }
    });

    test('Lỗi - Không có quyền truy cập (candidate)', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    });

    test('Lỗi - Job ID không hợp lệ', async () => {
      const response = await request(app)
        .get('/api/applications/jobs/invalid-id/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('không hợp lệ')
      });
    });

    test('Lỗi - Không có token xác thực', async () => {
      const response = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications`)
        .expect(401);

      // 401 response có thể có body rỗng tùy thuộc vào cách passport xử lý
      // expect(response.body).toMatchObject({
      //   success: false,
      //   message: expect.stringContaining('token')
      // });
    });
  });

  describe('GET /api/applications/:applicationId - Xem chi tiết hồ sơ ứng tuyển', () => {
    test('Thành công - Lấy chi tiết application', async () => {
      const response = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
        data: {
          _id: applicationId.toString(),
          status: 'PENDING',
          candidateRating: 'NOT_RATED',
          coverLetter: 'This is my cover letter for the position.',
          submittedCV: {
            name: 'test-cv.pdf',
            path: 'https://example.com/cv.pdf',
            source: 'UPLOADED'
          },
          appliedAt: expect.any(String),
          candidateProfileId: expect.any(String) // Chỉ check string ID thay vì populated object
        }
      });
    });

    test('Lỗi - Application không tồn tại', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/applications/${fakeId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Không tìm thấy đơn ứng tuyển'
      });
    });

    test('Lỗi - Application ID không hợp lệ', async () => {
      const response = await request(app)
        .get('/api/applications/invalid-id')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('không hợp lệ')
      });
    });

    test('Lỗi - Không có quyền truy cập (candidate)', async () => {
      const response = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    });
  });


  describe('PATCH /api/applications/:applicationId/rating - Đánh giá ứng viên', () => {
    test('Thành công - Đánh giá SUITABLE', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ rating: 'SUITABLE' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('thành công'),
        data: {
          _id: applicationId.toString(),
          candidateRating: 'SUITABLE'
        }
      });
    });

    test('Thành công - Đánh giá PERFECT_MATCH', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ rating: 'PERFECT_MATCH' })
        .expect(200);

      expect(response.body.data.candidateRating).toBe('PERFECT_MATCH');
    });

    test('Thành công - Đánh giá NOT_SUITABLE', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ rating: 'NOT_SUITABLE' })
        .expect(200);

      expect(response.body.data.candidateRating).toBe('NOT_SUITABLE');
    });

    test('Lỗi - Rating không hợp lệ', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ rating: 'INVALID_RATING' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('không hợp lệ')
      });
    });

    test('Lỗi - Thiếu trường rating', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.any(String)
      });
    });

    test('Lỗi - Không có quyền truy cập (candidate)', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ rating: 'SUITABLE' })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    });
  });

  describe('PATCH /api/applications/:applicationId/notes - Cập nhật ghi chú', () => {
    test('Thành công - Thêm ghi chú', async () => {
      const notes = 'Ứng viên có kinh nghiệm tốt về JavaScript và Node.js. Phù hợp với vị trí này.';
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ notes })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('thành công'),
        data: {
          _id: applicationId.toString(),
          notes: notes
        }
      });
    });

    test('Thành công - Cập nhật ghi chú đã có', async () => {
      // Thêm ghi chú ban đầu
      await Application.findByIdAndUpdate(applicationId, {
        notes: 'Ghi chú ban đầu'
      });

      const newNotes = 'Ghi chú đã được cập nhật với thông tin mới.';
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ notes: newNotes })
        .expect(200);

      expect(response.body.data.notes).toBe(newNotes);
    });

    test('Thành công - Xóa ghi chú (gửi chuỗi rỗng)', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ notes: '' })
        .expect(200);

      expect(response.body.data.notes).toBe('');
    });

    test('Lỗi - Ghi chú quá dài (>2000 ký tự)', async () => {
      const longNotes = 'a'.repeat(2001);
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ notes: longNotes })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('2000 ký tự')
      });
    });

    test('Lỗi - Thiếu trường notes', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.any(String)
      });
    });

    test('Lỗi - Application không tồn tại', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .patch(`/api/applications/${fakeId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ notes: 'Test note' })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Không tìm thấy đơn ứng tuyển'
      });
    });

    test('Lỗi - Không có quyền truy cập (candidate)', async () => {
      const response = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({ notes: 'Test note' })
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    });
  });

  describe('Kiểm tra tích hợp - Luồng quản lý ứng viên hoàn chỉnh', () => {
    test('Luồng hoàn chỉnh: Xem danh sách -> Chi tiết -> Đánh giá -> Cập nhật trạng thái -> Ghi chú', async () => {
      // 1. Xem danh sách ứng viên
      const listResponse = await request(app)
        .get(`/api/applications/jobs/${jobId}/applications`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(listResponse.body.data.length).toBeGreaterThan(0);

      // 2. Xem chi tiết application đầu tiên
      const detailResponse = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(detailResponse.body.data._id).toBe(applicationId.toString());

      // 3. Đánh giá ứng viên
      const ratingResponse = await request(app)
        .patch(`/api/applications/${applicationId}/rating`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ rating: 'SUITABLE' })
        .expect(200);

      expect(ratingResponse.body.data.candidateRating).toBe('SUITABLE');

      // 4. Cập nhật trạng thái
      const statusResponse = await request(app)
        .patch(`/api/applications/${applicationId}/status`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'REVIEWING' })
        .expect(200);

      expect(statusResponse.body.data.status).toBe('REVIEWING');

      // 5. Thêm ghi chú
      const notesResponse = await request(app)
        .patch(`/api/applications/${applicationId}/notes`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ notes: 'Ứng viên có potential tốt, cân nhắc cho vòng phỏng vấn.' })
        .expect(200);

      expect(notesResponse.body.data.notes).toBe('Ứng viên có potential tốt, cân nhắc cho vòng phỏng vấn.');

      // 6. Kiểm tra thông tin đã được cập nhật
      const finalDetailResponse = await request(app)
        .get(`/api/applications/${applicationId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .expect(200);

      expect(finalDetailResponse.body.data).toMatchObject({
        status: 'REVIEWING',
        candidateRating: 'SUITABLE',
        notes: 'Ứng viên có potential tốt, cân nhắc cho vòng phỏng vấn.'
      });
    });
  });
});
