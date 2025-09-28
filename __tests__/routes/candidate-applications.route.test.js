import request from 'supertest';
import app from '../../src/app.js'; // Sửa từ named import sang default import
import { User, Job, Application, RecruiterProfile, CandidateProfile } from '../../src/models/index.js'; // Đảm bảo không có Company ở đây
import jwt from 'jsonwebtoken';
import config from '../../src/config/index.js';


describe('Candidate Applications Routes', () => {
    let candidate, recruiter, recruiterProfile, job, application, candidateToken, candidateProfile;

    beforeEach(async () => {
        // Di chuyển logic setup vào beforeEach để mỗi test độc lập
        await User.deleteMany({});
        await RecruiterProfile.deleteMany({});
        await Job.deleteMany({});
        await Application.deleteMany({});
        await CandidateProfile.deleteMany({});

        // Create users
        candidate = await User.create({
            email: 'candidate.app@example.com',
            password: 'password123',
            role: 'candidate',
        });
        recruiter = await User.create({
            email: 'recruiter.app@example.com',
            password: 'password123',
            role: 'recruiter',
        });

        // Create candidate profile
        candidateProfile = await CandidateProfile.create({ // Gán vào biến candidateProfile ở ngoài scope
            userId: candidate._id,
            fullname: 'Test Candidate',
        });

        // Create recruiter profile (which includes company info)
        recruiterProfile = await RecruiterProfile.create({
            userId: recruiter._id,
            fullname: 'Test Recruiter',
            company: {
                name: 'Test Company Inc.',
                email: 'company.app@example.com',
            },
        });

        // Create a job
        job = await Job.create({
            title: 'Software Engineer',
            description: 'Develop amazing things.',
            recruiterProfileId: recruiterProfile._id, // Liên kết với RecruiterProfile
            locations: ['Hanoi'],
            salary: { min: 1000, max: 2000, unit: 'Triệu', negotiable: false },
            category: 'IT', // Thêm trường bắt buộc
            experience: 'ENTRY_LEVEL', // Thêm trường bắt buộc
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Thêm trường bắt buộc (1 tuần kể từ bây giờ)
            workType: 'ON_SITE', // Thêm trường bắt buộc
            type: 'FULL_TIME', // Thêm trường bắt buộc
            address: '123 Test Street', // Thêm trường bắt buộc
            'location.ward': 'Test Ward', // Thêm trường bắt buộc
            'location.province': 'Test Province', // Thêm trường bắt buộc
            benefits: 'Health insurance, free snacks', // Thêm trường bắt buộc
            requirements: 'Node.js, React', // Thêm trường bắt buộc
        });

        // Create an application
        application = await Application.create({
            jobId: job._id,
            candidateProfileId: candidateProfile._id, // Sửa thành candidateProfile._id
            status: 'PENDING',
            submittedCV: {
                name: 'Test CV',
                path: 'http://example.com/test.pdf',
                source: 'UPLOADED',
            },
            jobSnapshot: {
                title: job.title,
                company: recruiterProfile.company.name,
                logo: 'http://example.com/logo.png',
            },
        });

        // Create another application with 'viewed' status
        await Application.create({
            jobId: job._id,
            candidateProfileId: candidateProfile._id, // Sửa thành candidateProfile._id
            status: 'REVIEWING',
            submittedCV: {
                name: 'Test CV 2',
                path: 'http://example.com/test2.pdf',
                source: 'UPLOADED',
            },
            jobSnapshot: {
                title: job.title,
                company: recruiterProfile.company.name,
                logo: 'http://example.com/logo.png',
            },
        });

        // Generate token for the candidate
        candidateToken = jwt.sign({ id: candidate._id, role: 'candidate' }, config.JWT_SECRET);
    });

    afterEach(async () => {
        // Dọn dẹp sau mỗi test
        await User.deleteMany({});
        await RecruiterProfile.deleteMany({});
        await Job.deleteMany({});
        await Application.deleteMany({});
        await CandidateProfile.deleteMany({});
    });

    // afterAll được quản lý bởi __tests__/setup.js
    // Không cần đóng kết nối ở đây nữa
    afterAll(async () => {
        // Các kết nối đã được đóng trong setup.js
    });

    describe('GET /api/candidate/my-applications', () => {
        it('should return 200 and the list of applications for the logged-in candidate', async () => {
            const res = await request(app)
                .get('/api/candidate/my-applications')
                .set('Authorization', `Bearer ${candidateToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeInstanceOf(Array);
            expect(res.body.data.length).toBe(2);
            expect(res.body.data[0].jobSnapshot.title).toBe('Software Engineer');
            expect(res.body.meta.totalItems).toBe(2);
        });

        it('should return 200 and filter applications by status', async () => {
            const res = await request(app)
                .get('/api/candidate/my-applications?status=REVIEWING')
                .set('Authorization', `Bearer ${candidateToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeInstanceOf(Array);
            expect(res.body.data.length).toBe(1);
            expect(res.body.data[0].status).toBe('REVIEWING');
            expect(res.body.meta.totalItems).toBe(1); // Changed from total to totalItems
        });

        it('should return 200 and handle pagination correctly', async () => {
            const res = await request(app)
                .get('/api/candidate/my-applications?page=2&limit=1')
                .set('Authorization', `Bearer ${candidateToken}`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeInstanceOf(Array);
            expect(res.body.data.length).toBe(1);
            expect(res.body.meta.currentPage).toBe(2);
            expect(res.body.meta.limit).toBe(1);
            expect(res.body.meta.totalItems).toBe(2); // Changed from total to totalItems
        });

        it('should return 401 if no token is provided', async () => {
            const res = await request(app).get('/api/candidate/my-applications'); // Fixed route
            expect(res.statusCode).toEqual(401);
        });

        it('should return 403 if a user with a non-candidate role tries to access', async () => {
            const recruiterToken = jwt.sign({ id: recruiter._id, role: 'recruiter' }, config.JWT_SECRET); // Changed _id to id
            const res = await request(app)
                .get('/api/candidate/my-applications') // Fixed route
                .set('Authorization', `Bearer ${recruiterToken}`);
            expect(res.statusCode).toEqual(403);
        });
    });
});
