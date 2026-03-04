import mongoose from 'mongoose';
import { Job, InterviewRoom, Application, SavedJob, RecruiterProfile } from '../models/index.js';
import config from '../config/index.js';

/**
 * Tool 2: get_job_detail
 * Retrieve detailed information about a job by its ID.
 * Uses populate to fetch recruiter profile.
 */
export const get_job_detail = async (args) => {
    const { jobId } = args;
    if (!jobId) {
        throw new Error('jobId is required');
    }

    const job = await Job.findById(jobId).populate('recruiterProfileId').lean();
    return job;
};

/**
 * Tool 3: get_recommendations
 * Call FastAPI LightFM endpoint for candidate recommendations.
 */
export const get_recommendations = async (userId, args = {}) => {
    const limit = args.limit || 10;

    try {
        const url = `${config.PYTHON_SERVICE_URL}/api/v1/recommendations/${userId}?top_n=${limit}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`FastAPI returned status ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error calling get_recommendations from FastAPI:', error);
        throw error;
    }
};

/**
 * Tool 8: getUpcomingInterviews (get_my_interviews)
 * Retrieve user's interviews filtered by time range and status.
 */
export const getUpcomingInterviews = async (userId, role, args = {}) => {
    const { timeRange = 'upcoming', limit = 10 } = args;

    const now = new Date();
    const filter = {};

    if (role === 'recruiter') {
        filter.recruiterId = new mongoose.Types.ObjectId(userId);
    } else {
        filter.candidateId = new mongoose.Types.ObjectId(userId);
    }

    switch (timeRange) {
        case 'upcoming':
            filter.scheduledTime = { $gte: now };
            filter.status = { $in: ['SCHEDULED', 'RESCHEDULED'] };
            break;
        case 'past':
            filter.scheduledTime = { $lt: now };
            break;
        default:
            filter.scheduledTime = { $gte: now };
            if (!status) filter.status = { $in: ['SCHEDULED', 'RESCHEDULED'] };
            break;
    }


    const interviews = await InterviewRoom.find(filter)
        .populate('jobId', 'title')
        .populate('recruiterId', 'email')
        .populate('candidateId', 'email')
        .sort({ scheduledTime: timeRange === 'past' ? -1 : 1 })
        .limit(limit)
        .lean();

    return interviews;
};

/**
 * Tool 1: search_jobs (hybridSearchJobs)
 * Tìm kiếm việc làm kết hợp vector search và pre-/post-filters
 */
export const hybridSearchJobs = async (args = {}) => {
    const {
        query, province, district, category, type, workType,
        experience, minSalary, maxSalary, skills, limit = 10
    } = args;

    const pipeline = [];

    // ── Phase 1: Vector Search (nếu có semantic query) ──
    if (query && query.trim()) {
        try {
            const url = `${config.PYTHON_SERVICE_URL}/api/v1/embeddings/query-embedding`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trim(), model: 'models/text-embedding-004' })
            });

            if (!response.ok) {
                console.warn(`FastAPI embedding error: ${response.status}`);
                buildMatchFallback(pipeline, { province, district, category, type, workType, experience });
            } else {
                const data = await response.json();
                const queryVector = data.embedding;

                const vectorFilter = {
                    compound: {
                        must: [
                            { equals: { path: 'status', value: 'ACTIVE' } },
                            { equals: { path: 'moderationStatus', value: 'APPROVED' } }
                        ],
                        filter: []
                    }
                };

                // Hard filters vào vectorSearch pre-filter
                if (province) vectorFilter.compound.must.push({ equals: { path: 'location.province', value: province } });
                if (category) vectorFilter.compound.must.push({ equals: { path: 'category', value: category } });
                if (type) vectorFilter.compound.must.push({ equals: { path: 'type', value: type } });
                if (workType) vectorFilter.compound.must.push({ equals: { path: 'workType', value: workType } });
                if (experience) vectorFilter.compound.must.push({ equals: { path: 'experience', value: experience } });

                pipeline.push({
                    $vectorSearch: {
                        index: 'vt',
                        path: 'chunks.embedding',
                        queryVector: queryVector,
                        numCandidates: 150,
                        limit: parseInt(limit, 10) * 3,
                        filter: vectorFilter
                    }
                });

                pipeline.push({
                    $addFields: {
                        searchScore: { $meta: 'vectorSearchScore' }
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching embedding for search_jobs:', error);
            // Fallback to match if embedding fails
            buildMatchFallback(pipeline, { province, district, category, type, workType, experience });
        }
    } else {
        // Không có semantic query -> chỉ dùng match filter
        buildMatchFallback(pipeline, { province, district, category, type, workType, experience });
    }

    // ── Phase 2: Post-filters ──
    const postFilter = {};

    postFilter.deadline = { $gte: new Date() };

    // Lọc mức lương (Decimal128 -> cần convert)
    if (minSalary || maxSalary) {
        const salaryConditions = [];
        if (minSalary) {
            salaryConditions.push({
                $or: [
                    { minSalary: { $exists: false } },
                    { $expr: { $gte: [{ $toDouble: '$minSalary' }, parseFloat(minSalary)] } }
                ]
            });
        }
        if (maxSalary) {
            salaryConditions.push({
                $or: [
                    { maxSalary: { $exists: false } },
                    { $expr: { $lte: [{ $toDouble: '$maxSalary' }, parseFloat(maxSalary)] } }
                ]
            });
        }
        if (salaryConditions.length > 0) {
            postFilter.$and = salaryConditions;
        }
    }

    // Lọc skills
    if (skills && skills.length > 0) {
        postFilter.skills = { $in: skills.map(s => new RegExp(s, 'i')) };
    }

    if (Object.keys(postFilter).length > 0) {
        pipeline.push({ $match: postFilter });
    }

    // ── Phase 3: Sort + Limit + Project ──
    pipeline.push({ $sort: { searchScore: -1, createdAt: -1 } });
    pipeline.push({ $limit: parseInt(limit, 10) });

    pipeline.push({
        $lookup: {
            from: 'recruiterprofiles',
            localField: 'recruiterProfileId',
            foreignField: '_id',
            as: 'recruiter',
            pipeline: [
                { $project: { 'company.name': 1, 'company.logo': 1 } }
            ]
        }
    });

    pipeline.push({ $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } });

    pipeline.push({
        $project: {
            _id: 1,
            title: 1,
            province: '$location.province',
            district: '$location.district',
            minSalary: 1,
            maxSalary: 1,
            type: 1,
            workType: 1,
            experience: 1,
            category: 1,
            skills: 1,
            deadline: 1,
            createdAt: 1,
            searchScore: 1,
            company: '$recruiter.company.name',
            logo: '$recruiter.company.logo'
        }
    });

    const results = await Job.aggregate(pipeline);

    // Xử lý type minSalary, maxSalary
    const formattedResults = results.map(job => ({
        ...job,
        minSalary: job.minSalary?.toString() || null,
        maxSalary: job.maxSalary?.toString() || null,
    }));

    return {
        jobs: formattedResults,
        totalCount: formattedResults.length,
        hasMore: formattedResults.length === parseInt(limit, 10)
    };
};

function buildMatchFallback(pipeline, options) {
    const { province, district, category, type, workType, experience } = options;
    const matchFilter = {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED'
    };
    if (province) matchFilter['location.province'] = province;
    if (district) matchFilter['location.district'] = district;
    if (category) matchFilter.category = category;
    if (type) matchFilter.type = type;
    if (workType) matchFilter.workType = workType;
    if (experience) matchFilter.experience = experience;

    pipeline.push({ $match: matchFilter });
    pipeline.push({ $addFields: { searchScore: 1.0 } });
}

/**
 * 5.4 getExpiringJobs (việc sắp hết hạn của HR)
 */
export const getExpiringJobs = async (userId, withinDays = 7) => {
    const now = new Date();
    const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    const recruiterProfile = await RecruiterProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!recruiterProfile) {
        return [];
    }
    const results = await Job.find({
        recruiterProfileId: new mongoose.Types.ObjectId(recruiterProfile._id),
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        deadline: { $gte: now, $lte: deadline }
    })
        .populate({
            path: 'recruiterProfileId',
            select: 'company.name company.logo'
        })
        .sort({ deadline: 1 })
        .select('title deadline location.province type minSalary maxSalary category recruiterProfileId')
        .lean();

    return results.map(job => ({
        _id: job._id.toString(),
        title: job.title,
        province: job.location?.province,
        type: job.type,
        minSalary: job.minSalary?.toString() || null,
        maxSalary: job.maxSalary?.toString() || null,
        category: job.category,
        deadline: job.deadline,
        company: job.recruiterProfileId?.company?.name,
        logo: job.recruiterProfileId?.company?.logo
    }));
};


/**
 * 5.6 getSavedJobsExpiringSoon (việc đã lưu sắp hết hạn của Candidate)
 */
export const getSavedJobsExpiringSoon = async (userId, withinDays = 7) => {
    const now = new Date();
    const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const results = await SavedJob.aggregate([
        { $match: { candidateId: new mongoose.Types.ObjectId(userId) } },
        {
            $lookup: {
                from: 'jobs',
                localField: 'jobId',
                foreignField: '_id',
                as: 'job',
                pipeline: [
                    {
                        $match: {
                            status: 'ACTIVE',
                            deadline: { $gte: now, $lte: deadline }
                        }
                    },
                    {
                        $lookup: {
                            from: 'recruiterprofiles',
                            localField: 'recruiterProfileId',
                            foreignField: '_id',
                            as: 'recruiter',
                            pipeline: [{ $project: { 'company.name': 1, 'company.logo': 1 } }]
                        }
                    },
                    { $unwind: { path: '$recruiter', preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            title: 1, deadline: 1, 'location.province': 1, category: 1,
                            type: 1, minSalary: 1, maxSalary: 1,
                            company: '$recruiter.company.name',
                            logo: '$recruiter.company.logo'
                        }
                    }
                ]
            }
        },
        { $unwind: '$job' },
        { $sort: { 'job.deadline': 1 } },
        {
            $project: {
                savedAt: '$createdAt',
                job: 1
            }
        }
    ]);

    return results.map(item => ({
        _id: item.job._id.toString(),
        title: item.job.title,
        province: item.job.location?.province,
        type: item.job.type,
        minSalary: item.job.minSalary?.toString() || null,
        maxSalary: item.job.maxSalary?.toString() || null,
        category: item.job.category,
        deadline: item.job.deadline,
        company: item.job.company,
        logo: item.job.logo,
        savedAt: item.savedAt
    }));
};

/**
 * 5.7 get_my_applications (danh sách công việc đã ứng tuyển của Candidate)
 */
export const get_my_applications = async (candidateProfileId, args = {}) => {
    const { status, limit = 10 } = args;
    const filter = { candidateProfileId: new mongoose.Types.ObjectId(candidateProfileId) };

    if (status) {
        filter.status = status;
    }

    return Application.find(filter)
        .populate({
            path: 'jobId',
            select: 'title location.province type company category deadline',
            populate: {
                path: 'recruiterProfileId',
                select: 'company.name company.logo'
            }
        })
        .sort({ appliedAt: -1 })
        .limit(limit)
        .lean();
};
