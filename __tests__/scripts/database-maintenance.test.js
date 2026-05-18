import mongoose from 'mongoose';
import { Notification, InterviewRoom, User, RecruiterProfile, Job } from '../../src/models/index.js';
import {
  getInterviewNotificationReferenceId,
  getJobApplicantsNotificationReferenceId,
  getJobApprovalNotificationReferenceId,
  getTalentPoolInvitationNotificationReferenceId,
  runInterviewNotificationOrphanCleanup,
  runJobApplicantsNotificationOrphanCleanup,
  runJobApprovalNotificationOrphanCleanup,
  runTalentPoolInvitationNotificationOrphanCleanup,
} from '../../scripts/database-maintenance.js';

const createUser = (email, role = 'candidate') =>
  User.create({
    email,
    password: 'hashed-password',
    role,
    fullName: email,
  });

const createJob = async (recruiterProfileId, title = 't12345') =>
  Job.create({
    title,
    description: 'Job description',
    requirements: 'Job requirements',
    benefits: 'Job benefits',
    location: {
      province: 'Ho Chi Minh',
      district: 'District 1',
      coordinates: {
        type: 'Point',
        coordinates: [106.700981, 10.776889],
      },
    },
    address: '123 Nguyen Hue',
    type: 'FULL_TIME',
    workType: 'ON_SITE',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    experience: 'ENTRY_LEVEL',
    category: 'IT',
    recruiterProfileId,
  });

describe('database-maintenance interview notification cleanup', () => {
  test('prefers entity InterviewRoom id over metadata interviewId', () => {
    const entityId = new mongoose.Types.ObjectId();
    const metadataId = new mongoose.Types.ObjectId();

    const refId = getInterviewNotificationReferenceId({
      type: 'interview',
      entity: { type: 'InterviewRoom', id: entityId },
      metadata: { interviewId: metadataId.toString() },
    });

    expect(refId).toBe(entityId.toString());
  });

  test('deletes only interview notifications whose referenced interview room is missing', async () => {
    const candidate = await createUser('candidate@example.com');
    const recruiter = await createUser('recruiter@example.com', 'recruiter');
    const existingRoom = await InterviewRoom.create({
      roomName: 'Backend Interview',
      recruiterId: recruiter._id,
      candidateId: candidate._id,
      scheduledTime: new Date(Date.now() + 60 * 60 * 1000),
    });
    const missingRoomId = new mongoose.Types.ObjectId();

    const validNotification = await Notification.create({
      userId: candidate._id,
      title: 'Valid interview',
      message: 'This notification should stay',
      type: 'interview',
      entity: { type: 'InterviewRoom', id: existingRoom._id },
      metadata: { interviewId: existingRoom._id.toString() },
    });
    const orphanedNotification = await Notification.create({
      userId: candidate._id,
      title: 'Missing interview',
      message: 'This notification should be deleted',
      type: 'interview',
      entity: { type: 'InterviewRoom', id: missingRoomId },
      metadata: { interviewId: missingRoomId.toString() },
    });
    const applicationNotification = await Notification.create({
      userId: candidate._id,
      title: 'Application notification',
      message: 'Non-interview notification should stay',
      type: 'application',
      metadata: { interviewId: missingRoomId.toString() },
    });

    const dryRunCount = await runInterviewNotificationOrphanCleanup(true);

    expect(dryRunCount).toBe(1);
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeTruthy();

    const deletedCount = await runInterviewNotificationOrphanCleanup(false);

    expect(deletedCount).toBe(1);
    await expect(Notification.exists({ _id: validNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: applicationNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeNull();
  });
});

describe('database-maintenance job applicants notification cleanup', () => {
  test('prefers metadata jobId and falls back to aggregationKey', () => {
    const metadataJobId = new mongoose.Types.ObjectId();
    const aggregationJobId = new mongoose.Types.ObjectId();

    expect(getJobApplicantsNotificationReferenceId({
      type: 'job_applicants_rollup',
      metadata: { jobId: metadataJobId },
      aggregationKey: `job:${aggregationJobId}:applicants`,
    })).toBe(metadataJobId.toString());

    expect(getJobApplicantsNotificationReferenceId({
      type: 'job_applicants_rollup',
      aggregationKey: `job:${aggregationJobId}:applicants`,
    })).toBe(aggregationJobId.toString());
  });

  test('deletes only applicants rollup notifications whose referenced job is missing', async () => {
    const recruiterUser = await createUser('rollup-recruiter@example.com', 'recruiter');
    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Rollup Recruiter',
    });
    const existingJob = await createJob(recruiterProfile._id);
    const missingJobId = new mongoose.Types.ObjectId();

    const validNotification = await Notification.create({
      userId: recruiterUser._id,
      title: 'Có ứng viên mới cho vị trí "t12345"',
      message: 'Ứng viên A đã nộp đơn vào vị trí "t12345" của bạn.',
      type: 'job_applicants_rollup',
      aggregationKey: `job:${existingJob._id}:applicants`,
      metadata: { jobId: existingJob._id, jobTitle: existingJob.title },
    });
    const orphanedNotification = await Notification.create({
      userId: recruiterUser._id,
      title: 'Có ứng viên mới cho vị trí "missing"',
      message: 'Ứng viên B đã nộp đơn vào vị trí "missing" của bạn.',
      type: 'job_applicants_rollup',
      aggregationKey: `job:${missingJobId}:applicants`,
      metadata: { jobId: missingJobId, jobTitle: 'missing' },
    });
    const unrelatedNotification = await Notification.create({
      userId: recruiterUser._id,
      title: 'System notification',
      message: 'This should stay',
      type: 'system',
      metadata: { jobId: missingJobId },
    });

    const dryRunCount = await runJobApplicantsNotificationOrphanCleanup(true);

    expect(dryRunCount).toBe(1);
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeTruthy();

    const deletedCount = await runJobApplicantsNotificationOrphanCleanup(false);

    expect(deletedCount).toBe(1);
    await expect(Notification.exists({ _id: validNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: unrelatedNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeNull();
  });
});

describe('database-maintenance job approval notification cleanup', () => {
  test('prefers entity Job id over metadata jobId', () => {
    const entityJobId = new mongoose.Types.ObjectId();
    const metadataJobId = new mongoose.Types.ObjectId();

    const refId = getJobApprovalNotificationReferenceId({
      type: 'job_approval',
      entity: { type: 'Job', id: entityJobId },
      metadata: { jobId: metadataJobId.toString() },
    });

    expect(refId).toBe(entityJobId.toString());
  });

  test('deletes only job approval notifications whose referenced job is missing', async () => {
    const recruiterUser = await createUser('approval-recruiter@example.com', 'recruiter');
    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Approval Recruiter',
    });
    const existingJob = await createJob(recruiterProfile._id, 'approved job');
    const missingJobId = new mongoose.Types.ObjectId();

    const validNotification = await Notification.create({
      userId: recruiterUser._id,
      title: 'Tin tuyển dụng được phê duyệt',
      message: 'Tin tuyển dụng "approved job" đã được duyệt và đang hiển thị công khai.',
      type: 'job_approval',
      entity: { type: 'Job', id: existingJob._id },
      metadata: { status: 'APPROVED', jobId: existingJob._id, jobTitle: existingJob.title },
    });
    const orphanedNotification = await Notification.create({
      userId: recruiterUser._id,
      title: 'Tin tuyển dụng được phê duyệt',
      message: 'Tin tuyển dụng "missing job" đã được duyệt và đang hiển thị công khai.',
      type: 'job_approval',
      entity: { type: 'Job', id: missingJobId },
      metadata: { status: 'APPROVED', jobId: missingJobId, jobTitle: 'missing job' },
    });
    const unrelatedNotification = await Notification.create({
      userId: recruiterUser._id,
      title: 'System notification',
      message: 'This should stay',
      type: 'system',
      entity: { type: 'Job', id: missingJobId },
      metadata: { jobId: missingJobId },
    });

    const dryRunCount = await runJobApprovalNotificationOrphanCleanup(true);

    expect(dryRunCount).toBe(1);
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeTruthy();

    const deletedCount = await runJobApprovalNotificationOrphanCleanup(false);

    expect(deletedCount).toBe(1);
    await expect(Notification.exists({ _id: validNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: unrelatedNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeNull();
  });
});

describe('database-maintenance talent pool invitation notification cleanup', () => {
  test('prefers entity Job id over metadata jobId', () => {
    const entityJobId = new mongoose.Types.ObjectId();
    const metadataJobId = new mongoose.Types.ObjectId();

    const refId = getTalentPoolInvitationNotificationReferenceId({
      type: 'talent_pool_invitation',
      entity: { type: 'Job', id: entityJobId },
      metadata: { jobId: metadataJobId.toString() },
    });

    expect(refId).toBe(entityJobId.toString());
  });

  test('deletes only talent pool invitation notifications whose referenced job is missing', async () => {
    const candidateUser = await createUser('talent-candidate@example.com');
    const recruiterUser = await createUser('talent-recruiter@example.com', 'recruiter');
    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      fullname: 'Talent Recruiter',
    });
    const existingJob = await createJob(recruiterProfile._id, 'talent job');
    const missingJobId = new mongoose.Types.ObjectId();

    const validNotification = await Notification.create({
      userId: candidateUser._id,
      title: 'Lời mời ứng tuyển từ Talent Pool',
      message: 'CareerZone mời bạn ứng tuyển vào vị trí "talent job"',
      type: 'talent_pool_invitation',
      entity: { type: 'Job', id: existingJob._id },
      metadata: { jobId: existingJob._id.toString(), recruiterProfileId: recruiterProfile._id.toString() },
    });
    const orphanedNotification = await Notification.create({
      userId: candidateUser._id,
      title: 'Lời mời ứng tuyển từ Talent Pool',
      message: 'CareerZone mời bạn ứng tuyển vào vị trí "missing job"',
      type: 'talent_pool_invitation',
      entity: { type: 'Job', id: missingJobId },
      metadata: { jobId: missingJobId.toString(), recruiterProfileId: recruiterProfile._id.toString() },
    });
    const unrelatedNotification = await Notification.create({
      userId: candidateUser._id,
      title: 'System notification',
      message: 'This should stay',
      type: 'system',
      entity: { type: 'Job', id: missingJobId },
      metadata: { jobId: missingJobId },
    });

    const dryRunCount = await runTalentPoolInvitationNotificationOrphanCleanup(true);

    expect(dryRunCount).toBe(1);
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeTruthy();

    const deletedCount = await runTalentPoolInvitationNotificationOrphanCleanup(false);

    expect(deletedCount).toBe(1);
    await expect(Notification.exists({ _id: validNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: unrelatedNotification._id })).resolves.toBeTruthy();
    await expect(Notification.exists({ _id: orphanedNotification._id })).resolves.toBeNull();
  });
});
