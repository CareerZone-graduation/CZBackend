import mongoose from 'mongoose';
import {
  createSupportRequest,
  getUserSupportRequests,
  getSupportRequestById,
  addFollowUpMessage,
  markAdminResponseAsRead,
  getAllSupportRequests,
  respondToRequest,
  updateRequestStatus,
  updateRequestPriority,
  reopenRequest,
  getAnalytics,
  sanitizeInput
} from '../../src/services/supportRequest.service.js';
import { SupportRequest, User, CandidateProfile, RecruiterProfile } from '../../src/models/index.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../src/utils/AppError.js';

describe('Support Request Service', () => {
  let candidateUser, recruiterUser, adminUser, candidateProfile;

  beforeEach(async () => {
    // Create Users before each test (since afterEach in setup.js deletes all data)
    candidateUser = await User.create({
      email: 'candidate@example.com',
      password: 'password123',
      role: 'candidate',
    });

    recruiterUser = await User.create({
      email: 'recruiter@example.com',
      password: 'password123',
      role: 'recruiter',
    });

    adminUser = await User.create({
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin',
    });

    // Create Candidate Profile
    candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      fullname: 'Candidate Name',
    });
  });

  describe('sanitizeInput', () => {
    it('should remove HTML tags from input', () => {
      const input = '<script>alert("xss")</script>Hello <b>World</b>';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello World');
    });

    it('should remove script tags', () => {
      const input = 'Normal text <script>malicious code</script> more text';
      const result = sanitizeInput(input);
      expect(result).toBe('Normal text  more text');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
    });
  });

  describe('createSupportRequest', () => {
    it('should create a support request for candidate', async () => {
      const data = {
        subject: 'Test Support Request',
        description: 'This is a test description for the support request',
        category: 'technical-issue'
      };

      const result = await createSupportRequest(
        candidateUser._id.toString(),
        'candidate',
        data,
        []
      );

      expect(result).toBeDefined();
      expect(result.subject).toBe(data.subject);
      expect(result.description).toBe(data.description);
      expect(result.category).toBe(data.category);
      expect(result.status).toBe('pending');
      expect(result.priority).toBe('medium');
      expect(result.requester.userId.toString()).toBe(candidateUser._id.toString());
      expect(result.requester.userType).toBe('candidate');
    });

    it('should create a support request for recruiter without profile', async () => {
      const data = {
        subject: 'Recruiter Support Request',
        description: 'This is a test description for recruiter support',
        category: 'account-issue'
      };

      const result = await createSupportRequest(
        recruiterUser._id.toString(),
        'recruiter',
        data,
        []
      );

      expect(result).toBeDefined();
      expect(result.requester.userType).toBe('recruiter');
      // Should use email as fallback when no profile exists
      expect(result.requester.name).toBe(recruiterUser.email);
    });

    it('should sanitize input when creating request', async () => {
      const data = {
        subject: '<script>alert("xss")</script>Test Subject',
        description: 'Description with <b>HTML</b> tags',
        category: 'general-inquiry'
      };

      const result = await createSupportRequest(
        candidateUser._id.toString(),
        'candidate',
        data,
        []
      );

      expect(result.subject).toBe('Test Subject');
      expect(result.description).toBe('Description with HTML tags');
    });
  });

  describe('getUserSupportRequests', () => {
    beforeEach(async () => {
      // Create test support requests
      await SupportRequest.create([
        {
          requester: {
            userId: candidateUser._id,
            userType: 'candidate',
            name: 'Candidate Name',
            email: candidateUser.email
          },
          subject: 'Request 1',
          description: 'Description 1 with enough characters',
          category: 'technical-issue',
          status: 'pending'
        },
        {
          requester: {
            userId: candidateUser._id,
            userType: 'candidate',
            name: 'Candidate Name',
            email: candidateUser.email
          },
          subject: 'Request 2',
          description: 'Description 2 with enough characters',
          category: 'account-issue',
          status: 'in-progress'
        }
      ]);
    });

    it('should get all support requests for a user', async () => {
      const result = await getUserSupportRequests(candidateUser._id.toString());

      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
    });

    it('should filter by status', async () => {
      const result = await getUserSupportRequests(candidateUser._id.toString(), {
        status: 'pending'
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('pending');
    });

    it('should filter by category', async () => {
      const result = await getUserSupportRequests(candidateUser._id.toString(), {
        category: 'technical-issue'
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].category).toBe('technical-issue');
    });
  });

  describe('getSupportRequestById', () => {
    let supportRequest;

    beforeEach(async () => {
      supportRequest = await SupportRequest.create({
        requester: {
          userId: candidateUser._id,
          userType: 'candidate',
          name: 'Candidate Name',
          email: candidateUser.email
        },
        subject: 'Test Request',
        description: 'Test description with enough characters',
        category: 'technical-issue'
      });
    });

    it('should get support request by ID', async () => {
      const result = await getSupportRequestById(
        supportRequest._id.toString(),
        candidateUser._id.toString()
      );

      expect(result).toBeDefined();
      expect(result._id.toString()).toBe(supportRequest._id.toString());
    });

    it('should throw ForbiddenError if user does not own the request', async () => {
      await expect(
        getSupportRequestById(
          supportRequest._id.toString(),
          recruiterUser._id.toString()
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if request does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await expect(
        getSupportRequestById(fakeId.toString(), candidateUser._id.toString())
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('addFollowUpMessage', () => {
    let supportRequest;

    beforeEach(async () => {
      supportRequest = await SupportRequest.create({
        requester: {
          userId: candidateUser._id,
          userType: 'candidate',
          name: 'Candidate Name',
          email: candidateUser.email
        },
        subject: 'Test Request',
        description: 'Test description with enough characters',
        category: 'technical-issue',
        status: 'pending'
      });
    });

    it('should add follow-up message to pending request', async () => {
      const messageData = {
        content: 'This is a follow-up message'
      };

      const result = await addFollowUpMessage(
        supportRequest._id.toString(),
        candidateUser._id.toString(),
        messageData,
        []
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe(messageData.content);
    });

    it('should throw BadRequestError when adding message to closed request', async () => {
      supportRequest.status = 'closed';
      await supportRequest.save();

      const messageData = {
        content: 'This should fail'
      };

      await expect(
        addFollowUpMessage(
          supportRequest._id.toString(),
          candidateUser._id.toString(),
          messageData,
          []
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('markAdminResponseAsRead', () => {
    let supportRequest;

    beforeEach(async () => {
      supportRequest = await SupportRequest.create({
        requester: {
          userId: candidateUser._id,
          userType: 'candidate',
          name: 'Candidate Name',
          email: candidateUser.email
        },
        subject: 'Test Request',
        description: 'Test description with enough characters',
        category: 'technical-issue',
        hasUnreadAdminResponse: true
      });
    });

    it('should mark admin response as read', async () => {
      const result = await markAdminResponseAsRead(
        supportRequest._id.toString(),
        candidateUser._id.toString()
      );

      expect(result.hasUnreadAdminResponse).toBe(false);
    });
  });

  describe('getAllSupportRequests', () => {
    beforeEach(async () => {
      await SupportRequest.create([
        {
          requester: {
            userId: candidateUser._id,
            userType: 'candidate',
            name: 'Candidate Name',
            email: candidateUser.email
          },
          subject: 'Request 1',
          description: 'Description 1 with enough characters',
          category: 'technical-issue',
          status: 'pending',
          priority: 'high'
        },
        {
          requester: {
            userId: recruiterUser._id,
            userType: 'recruiter',
            name: 'Recruiter Name',
            email: recruiterUser.email
          },
          subject: 'Request 2',
          description: 'Description 2 with enough characters',
          category: 'account-issue',
          status: 'in-progress',
          priority: 'urgent'
        }
      ]);
    });

    it('should get all support requests', async () => {
      const result = await getAllSupportRequests();

      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
    });

    it('should filter by status', async () => {
      const result = await getAllSupportRequests({ status: 'pending' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('pending');
    });

    it('should search by keyword', async () => {
      const result = await getAllSupportRequests({ keyword: 'Request 1' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subject).toBe('Request 1');
    });
  });

  describe('respondToRequest', () => {
    let supportRequest;

    beforeEach(async () => {
      supportRequest = await SupportRequest.create({
        requester: {
          userId: candidateUser._id,
          userType: 'candidate',
          name: 'Candidate Name',
          email: candidateUser.email
        },
        subject: 'Test Request',
        description: 'Test description with enough characters',
        category: 'technical-issue',
        status: 'pending'
      });
    });

    it('should add admin response', async () => {
      const response = 'This is an admin response';

      const result = await respondToRequest(
        supportRequest._id.toString(),
        adminUser._id.toString(),
        response
      );

      expect(result.adminResponses).toHaveLength(1);
      expect(result.adminResponses[0].response).toBe(response);
      expect(result.hasUnreadAdminResponse).toBe(true);
    });

    it('should update status when provided', async () => {
      const response = 'Resolving this issue';

      const result = await respondToRequest(
        supportRequest._id.toString(),
        adminUser._id.toString(),
        response,
        'resolved'
      );

      expect(result.status).toBe('resolved');
      expect(result.resolvedAt).toBeDefined();
    });

    it('should update priority when provided', async () => {
      const response = 'Marking as urgent';

      const result = await respondToRequest(
        supportRequest._id.toString(),
        adminUser._id.toString(),
        response,
        null,
        'urgent'
      );

      expect(result.priority).toBe('urgent');
    });
  });

  describe('updateRequestStatus', () => {
    let supportRequest;

    beforeEach(async () => {
      supportRequest = await SupportRequest.create({
        requester: {
          userId: candidateUser._id,
          userType: 'candidate',
          name: 'Candidate Name',
          email: candidateUser.email
        },
        subject: 'Test Request',
        description: 'Test description with enough characters',
        category: 'technical-issue',
        status: 'pending'
      });
    });

    it('should update status from pending to in-progress', async () => {
      const result = await updateRequestStatus(
        supportRequest._id.toString(),
        adminUser._id.toString(),
        'in-progress'
      );

      expect(result.status).toBe('in-progress');
    });

    it('should throw BadRequestError for invalid transition', async () => {
      await expect(
        updateRequestStatus(
          supportRequest._id.toString(),
          adminUser._id.toString(),
          'resolved'
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('reopenRequest', () => {
    let supportRequest;

    beforeEach(async () => {
      supportRequest = await SupportRequest.create({
        requester: {
          userId: candidateUser._id,
          userType: 'candidate',
          name: 'Candidate Name',
          email: candidateUser.email
        },
        subject: 'Test Request',
        description: 'Test description with enough characters',
        category: 'technical-issue',
        status: 'closed',
        closedAt: new Date()
      });
    });

    it('should reopen closed request', async () => {
      const result = await reopenRequest(
        supportRequest._id.toString(),
        adminUser._id.toString()
      );

      expect(result.status).toBe('in-progress');
      expect(result.reopenedAt).toBeDefined();
      expect(result.reopenedBy.toString()).toBe(adminUser._id.toString());
    });

    it('should throw BadRequestError when reopening non-closed request', async () => {
      supportRequest.status = 'pending';
      await supportRequest.save();

      await expect(
        reopenRequest(
          supportRequest._id.toString(),
          adminUser._id.toString()
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('getAnalytics', () => {
    beforeEach(async () => {
      const now = new Date();
      await SupportRequest.create([
        {
          requester: {
            userId: candidateUser._id,
            userType: 'candidate',
            name: 'Candidate Name',
            email: candidateUser.email
          },
          subject: 'Request 1',
          description: 'Description 1 with enough characters',
          category: 'technical-issue',
          status: 'pending',
          createdAt: now
        },
        {
          requester: {
            userId: candidateUser._id,
            userType: 'candidate',
            name: 'Candidate Name',
            email: candidateUser.email
          },
          subject: 'Request 2',
          description: 'Description 2 with enough characters',
          category: 'account-issue',
          status: 'resolved',
          resolvedAt: new Date(now.getTime() + 3600000), // 1 hour later
          createdAt: now
        }
      ]);
    });

    it('should return analytics data', async () => {
      const result = await getAnalytics();

      expect(result).toBeDefined();
      expect(result.countByStatus).toBeDefined();
      expect(result.countByCategory).toBeDefined();
      expect(result.totalRequests).toBe(2);
    });

    it('should count by status correctly', async () => {
      const result = await getAnalytics();

      expect(result.countByStatus.pending).toBe(1);
      expect(result.countByStatus.resolved).toBe(1);
    });

    it('should count by category correctly', async () => {
      const result = await getAnalytics();

      expect(result.countByCategory['technical-issue']).toBe(1);
      expect(result.countByCategory['account-issue']).toBe(1);
    });
  });
});
