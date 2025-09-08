// src/services/analytics.service.js
import {
  User,
  RecruiterProfile,
  Job,
  Application,
  InterviewRoom,
  CoinRecharge,
} from "../models/index.js";
import { NotFoundError } from "../utils/AppError.js";
import mongoose from "mongoose";

// Helper function to calculate date ranges
const getDateRange = (period) => {
  const endDate = new Date();
  let startDate = new Date();

  switch (period) {
    case "7d":
      startDate.setDate(endDate.getDate() - 7);
      break;
    case "90d":
      startDate.setDate(endDate.getDate() - 90);
      break;
    case "1y":
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case "30d":
    default:
      startDate.setDate(endDate.getDate() - 30);
      break;
  }
  return { startDate, endDate };
};

/**
 * GET /api/analytics/dashboard-stats
 * Lấy các chỉ số KPI chính cho dashboard
 */
export const getDashboardStats = async () => {
  // --- Định nghĩa khoảng thời gian ---
  // Lấy ngày hiện tại
  const now = new Date();
  // `currentPeriodStart`: Ngày bắt đầu của tháng hiện tại (ví dụ: 01/09/2025)
  const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // `previousPeriodStart`: Ngày bắt đầu của tháng trước (ví dụ: 01/08/2025)
  const previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // --- Hàm hỗ trợ tính toán tăng trưởng ---
  // Công thức: ((Số liệu hiện tại - Số liệu quá khứ) / Số liệu quá khứ) * 100
  const calculateGrowth = (current, previous) => {
    // Nếu số liệu quá khứ là 0, tăng trưởng là 100% nếu hiện tại có số liệu, ngược lại là 0%
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  };

  // --- Thực hiện các truy vấn song song để tối ưu hiệu năng ---
  const [
    // 1. Lấy các chỉ số tổng quan (tổng số từ trước đến nay)
    totalUsers,
    activeCompanies,
    totalJobs,
    totalApplications,
    totalInterviews,

    // 2. Tính doanh thu tháng hiện tại
    monthlyRevenueResult,
    // 3. Tính doanh thu tháng trước
    previousMonthlyRevenueResult,

    // 4. Lấy số lượng bản ghi mới của tháng trước để làm cơ sở so sánh tăng trưởng
    previousMonthUsers,
    previousMonthCompanies,
    previousMonthJobs,
    previousMonthApplications,
    previousMonthInterviews,
    
    // 5. Lấy số lượng bản ghi mới của tháng này để tính tăng trưởng
    currentMonthUsers,
    currentMonthCompanies,
    currentMonthJobs,
    currentMonthApplications,
    currentMonthInterviews,

  ] = await Promise.all([
    // --- Các chỉ số tổng quan ---
    User.countDocuments({ role: { $ne: "admin" } }),
    RecruiterProfile.countDocuments({ "company.name": { $exists: true } }),
    Job.countDocuments(),
    Application.countDocuments(),
    InterviewRoom.countDocuments(),

    // --- Doanh thu tháng hiện tại (từ đầu tháng đến nay) ---
    CoinRecharge.aggregate([
      { $match: { status: "SUCCESS", createdAt: { $gte: currentPeriodStart } } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]),
    // --- Doanh thu tháng trước ---
    CoinRecharge.aggregate([
      { $match: { status: "SUCCESS", createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } } },
      { $group: { _id: null, total: { $sum: "$amountPaid" } } },
    ]),

    // --- Dữ liệu tăng trưởng: Đếm số lượng bản ghi được tạo trong tháng trước ---
    User.countDocuments({ role: { $ne: "admin" }, createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    RecruiterProfile.countDocuments({ "company.name": { $exists: true }, createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Job.countDocuments({ createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Application.countDocuments({ createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    InterviewRoom.countDocuments({ createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    
    // --- Dữ liệu tăng trưởng: Đếm số lượng bản ghi được tạo trong tháng này ---
    User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: currentPeriodStart } }),
    RecruiterProfile.countDocuments({ 'company.name': { $exists: true }, createdAt: { $gte: currentPeriodStart } }),
    Job.countDocuments({ createdAt: { $gte: currentPeriodStart } }),
    Application.countDocuments({ createdAt: { $gte: currentPeriodStart } }),
    InterviewRoom.countDocuments({ createdAt: { $gte: currentPeriodStart } }),
  ]);

  // --- Xử lý kết quả và tính toán ---
  const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;
  const previousMonthlyRevenue = previousMonthlyRevenueResult[0]?.total || 0;

  // --- Trả về cấu trúc dữ liệu hoàn chỉnh ---
  return {
    totalUsers,
    activeCompanies,
    jobListings: totalJobs,
    monthlyRevenue,
    totalApplications,
    totalInterviews,
    growth: {
      users: calculateGrowth(currentMonthUsers, previousMonthUsers),
      companies: calculateGrowth(currentMonthCompanies, previousMonthCompanies),
      jobs: calculateGrowth(currentMonthJobs, previousMonthJobs),
      revenue: calculateGrowth(monthlyRevenue, previousMonthlyRevenue),
      applications: calculateGrowth(currentMonthApplications, previousMonthApplications),
      interviews: calculateGrowth(currentMonthInterviews, previousMonthInterviews),
    },
  };
};

/**
 * GET /api/analytics/user-growth
 * Thống kê tăng trưởng người dùng theo thời gian
 */
export const getUserGrowth = async (queryParams) => {
  const { period, granularity } = queryParams;
  const { startDate, endDate } = getDateRange(period);

  let format;
  switch (granularity) {
    case "weekly":
      format = "%Y-%U"; // Year-Week
      break;
    case "monthly":
      format = "%Y-%m"; // Year-Month
      break;
    case "daily":
    default:
      format = "%Y-%m-%d"; // Year-Month-Day
      break;
  }

  const results = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        role: { $ne: "admin" },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format, date: "$createdAt" } },
          role: "$role",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.date",
        users: { $sum: "$count" },
        details: { $push: { role: "$_id.role", count: "$count" } },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        users: "$users",
        job_seekers: {
          $ifNull: [
            {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$details",
                    as: "d",
                    cond: { $eq: ["$$d.role", "candidate"] },
                  },
                },
                0,
              ],
            },
            { count: 0 },
          ],
        },
        recruiters: {
          $ifNull: [
            {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$details",
                    as: "d",
                    cond: { $eq: ["$$d.role", "recruiter"] },
                  },
                },
                0,
              ],
            },
            { count: 0 },
          ],
        },
      },
    },
    {
      $project: {
        date: 1,
        users: 1,
        job_seekers: "$job_seekers.count",
        recruiters: "$recruiters.count",
      },
    },
    { $sort: { date: 1 } },
  ]);
  return results;
};

/**
 * GET /api/analytics/revenue-trends
 * Thống kê doanh thu theo thời gian
 */
export const getRevenueTrends = async (queryParams) => {
  const { period, granularity } = queryParams;
  const { startDate, endDate } = getDateRange(period);

  // Xác định định dạng ngày tháng cho việc nhóm dữ liệu (daily, weekly, monthly)
  let format;
  switch (granularity) {
    case "weekly":
      format = "%Y-%U"; // Nhóm theo Năm-Tuần
      break;
    case "monthly":
      format = "%Y-%m"; // Nhóm theo Năm-Tháng
      break;
    case "daily":
    default:
      format = "%Y-%m-%d"; // Nhóm theo Năm-Tháng-Ngày
      break;
  }

  // --- Thực hiện các truy vấn tổng hợp song song ---
  const [revenueTrends, jobPostings, applications] = await Promise.all([
    // 1. Lấy dữ liệu doanh thu
    CoinRecharge.aggregate([
      { $match: { status: "SUCCESS", createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt" } }, // Nhóm theo ngày/tuần/tháng
          revenue: { $sum: "$amountPaid" }, // Tính tổng doanh thu
        },
      },
      { $sort: { _id: 1 } }, // Sắp xếp theo ngày
      { $project: { _id: 0, date: "$_id", revenue: "$revenue" } },
    ]),

    // 2. Lấy dữ liệu số lượng công việc đăng
    Job.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
            $group: {
                _id: { $dateToString: { format, date: '$createdAt' } },
                job_postings: { $sum: 1 } // Đếm số lượng
            }
        },
        { $sort: { _id: 1 } }
    ]),

    // 3. Lấy dữ liệu số lượng đơn ứng tuyển
    Application.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
            $group: {
                _id: { $dateToString: { format, date: '$createdAt' } },
                applications: { $sum: 1 } // Đếm số lượng
            }
        },
        { $sort: { _id: 1 } }
    ])
  ]);

  // --- Gộp dữ liệu từ 3 truy vấn trên ---
  // Mục đích: Tạo ra một mảng duy nhất chứa tất cả thông tin theo từng ngày/tuần/tháng
  const mergedData = revenueTrends.map(rt => {
      // Tìm dữ liệu job và application tương ứng với ngày của doanh thu
      const jobs = jobPostings.find(jp => jp._id === rt.date);
      const apps = applications.find(ap => ap._id === rt.date);
      return {
          date: rt.date,
          revenue: rt.revenue,
          job_postings: jobs ? jobs.job_postings : 0, // Nếu không có thì trả về 0
          applications: apps ? apps.applications : 0 // Nếu không có thì trả về 0
      };
  });

  return mergedData;
};

/**
 * GET /api/analytics/user-demographics
 * Phân bổ người dùng theo vai trò
 */
export const getUserDemographics = async () => {
  const total = await User.countDocuments({ role: { $ne: "admin" } });
  const results = await User.aggregate([
    { $match: { role: { $ne: "admin" } } },
    { $group: { _id: "$role", value: { $sum: 1 } } },
    {
      $project: {
        _id: 0,
        name: {
          $switch: {
            branches: [
              { case: { $eq: ["$_id", "candidate"] }, then: "Job Seekers" },
              { case: { $eq: ["$_id", "recruiter"] }, then: "Recruiters" },
            ],
            default: "Other",
          },
        },
        value: "$value",
        percentage: {
          $round: [{ $multiply: [{ $divide: ["$value", total] }, 100] }, 2],
        },
      },
    },
  ]);
  return results;
};

/**
 * GET /api/analytics/job-categories
 * Phân bổ công việc theo ngành nghề
 */
export const getJobCategories = async () => {
  const results = await Job.aggregate([
    { $match: { status: "ACTIVE", approved: true } },
    { $group: { _id: "$category", value: { $sum: 1 } } },
    { $project: { _id: 0, name: "$_id", value: 1 } },
    { $sort: { value: -1 } },
    { $limit: 10 }, // Lấy top 10
  ]);
  return results;
};

/**
 * GET /api/analytics/company-stats
 * Thống kê các công ty theo trạng thái
 */
export const getCompanyStats = async () => {
  const stats = await RecruiterProfile.aggregate([
    {
      $match: {
        'company.name': { $exists: true },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [{ $eq: ['$company.status', 'pending'] }, 1, 0],
          },
        },
        approved: {
          $sum: {
            $cond: [{ $eq: ['$company.status', 'approved'] }, 1, 0],
          },
        },
        rejected: {
          $sum: {
            $cond: [{ $eq: ['$company.status', 'rejected'] }, 1, 0],
          },
        },
        verified: {
          $sum: {
            $cond: [{ $eq: ['$company.verified', true] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        total: 1,
        pending: 1,
        approved: 1,
        rejected: 1,
        verified: 1,
      },
    },
  ]);

  if (stats.length === 0) {
    return {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      verified: 0,
    };
  }

  return stats[0];
};
