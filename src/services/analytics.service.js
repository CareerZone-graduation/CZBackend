// src/services/analytics.service.js
import {
  User,
  RecruiterProfile,
  Job,
  Application,
  InterviewRoom,
  CoinRecharge,
} from "../models/index.js";
import { ALL_PAYMENT_METHODS, TRANSACTION_STATUS_LABELS } from "../constants/index.js";

// ============================================================================
// VIETNAM TIMEZONE UTILITIES - Sử dụng nhất quán trong toàn bộ file
// ============================================================================
const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 in milliseconds

/**
 * Lấy ngày/tháng/năm hiện tại theo múi giờ Việt Nam
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number }}
 */
const getVNDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year').value),
    month: parseInt(parts.find(p => p.type === 'month').value), // 1-12
    day: parseInt(parts.find(p => p.type === 'day').value),
    hour: parseInt(parts.find(p => p.type === 'hour').value),
    minute: parseInt(parts.find(p => p.type === 'minute').value)
  };
};

/**
 * Chuyển đổi ngày VN (YYYY-MM-DD) sang UTC Date để query MongoDB
 * @param {number} year 
 * @param {number} month - 1-12
 * @param {number} day 
 * @param {boolean} isEndOfDay - true = 23:59:59, false = 00:00:00
 * @returns {Date} UTC Date object
 */
const vnDateToUTC = (year, month, day, isEndOfDay = false) => {
  if (isEndOfDay) {
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - VN_OFFSET_MS);
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - VN_OFFSET_MS);
};

/**
 * Format UTC Date sang chuỗi YYYY-MM-DD theo múi giờ VN
 * @param {Date} utcDate 
 * @returns {string} YYYY-MM-DD
 */
const formatDateVN = (utcDate) => {
  const vnDate = new Date(utcDate.getTime() + VN_OFFSET_MS);
  const year = vnDate.getUTCFullYear();
  const month = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to calculate date ranges - sử dụng múi giờ Việt Nam (UTC+7)
const getDateRange = (period) => {
  const vn = getVNDateParts();
  
  // endDate = cuối ngày hôm nay theo VN
  const endDate = vnDateToUTC(vn.year, vn.month, vn.day, true);
  
  // Tính số ngày lùi lại
  const daysBack = period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;
  
  // Tính ngày bắt đầu
  const startDateObj = new Date(vn.year, vn.month - 1, vn.day - daysBack);
  const startDate = vnDateToUTC(
    startDateObj.getFullYear(),
    startDateObj.getMonth() + 1,
    startDateObj.getDate(),
    false
  );
  
  console.log('📅 getDateRange:', { 
    period, 
    vnToday: `${vn.year}-${vn.month}-${vn.day}`,
    startDate: startDate.toISOString(), 
    endDate: endDate.toISOString() 
  });
  
  return { startDate, endDate };
};

/**
 * GET /api/analytics/dashboard-stats
 * Lấy các chỉ số KPI chính cho dashboard
 */
export const getDashboardStats = async () => {
  // --- Sử dụng VN timezone utilities ---
  const vn = getVNDateParts();
  
  // Tính ngày đầu tháng hiện tại theo VN
  const currentPeriodStart = vnDateToUTC(vn.year, vn.month, 1, false);
  
  // Tính ngày đầu tháng trước theo VN
  const prevMonth = vn.month === 1 ? 12 : vn.month - 1;
  const prevYear = vn.month === 1 ? vn.year - 1 : vn.year;
  const previousPeriodStart = vnDateToUTC(prevYear, prevMonth, 1, false);
  


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
  const currentMonthRevenue = monthlyRevenueResult[0]?.total || 0;
  const previousMonthRevenue = previousMonthlyRevenueResult[0]?.total || 0;

  // --- Trả về cấu trúc dữ liệu hoàn chỉnh ---
  return {
    totalUsers,
    activeCompanies,
    jobListings: totalJobs,
    currentMonth: vn.month, // Tháng hiện tại theo VN timezone (1-12)
    currentMonthRevenue, // Doanh thu tháng hiện tại
    previousMonthRevenue, // Doanh thu tháng trước (để tính growth)
    totalApplications,
    totalInterviews,
    growth: {
      users: calculateGrowth(currentMonthUsers, previousMonthUsers),
      companies: calculateGrowth(currentMonthCompanies, previousMonthCompanies),
      jobs: calculateGrowth(currentMonthJobs, previousMonthJobs),
      revenue: calculateGrowth(currentMonthRevenue, previousMonthRevenue),
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
  // Log toàn bộ queryParams để debug
  console.log('📥 Backend received RAW queryParams:', JSON.stringify(queryParams, null, 2));
  
  const { period, granularity, customStartDate, customEndDate } = queryParams;
  
  console.log('📥 Destructured params:', { 
    period, 
    granularity, 
    customStartDate, 
    customEndDate,
    'typeof customStartDate': typeof customStartDate,
    'typeof customEndDate': typeof customEndDate
  });
  
  // Sử dụng custom dates từ frontend nếu có, nếu không thì dùng period
  let startDate, endDate;
  
  if (customStartDate && customEndDate) {
    // Frontend gửi ngày dạng YYYY-MM-DD, parse và chuyển sang UTC
    const [startYear, startMonth, startDay] = customStartDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = customEndDate.split('-').map(Number);
    
    startDate = vnDateToUTC(startYear, startMonth, startDay, false);
    endDate = vnDateToUTC(endYear, endMonth, endDay, true);
    
    console.log('✅ Using custom dates (VN timezone):', { 
      input: { customStartDate, customEndDate },
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
  } else {
    // Sử dụng period mặc định
    const dateRange = getDateRange(period || '30d');
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
    
    console.log('✅ Using period dates:', { 
      period: period || '30d',
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
  }

  // --- THAY ĐỔI: Sử dụng $dateTrunc để chuẩn hóa ngày - múi giờ Việt Nam ---
  const dateGroupingExpression = {
    $dateToString: {
      format: '%Y-%m-%d', // Luôn trả về định dạng YYYY-MM-DD
      date: {
        $dateTrunc: {
          date: '$createdAt',
          unit: granularity === 'weekly' ? 'week' : (granularity === 'monthly' ? 'month' : 'day'),
          timezone: 'Asia/Ho_Chi_Minh',
        },
      },
      timezone: 'Asia/Ho_Chi_Minh',
    },
  };

  // Lấy dữ liệu user từ DB
  const userData = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        role: { $ne: "admin" },
      },
    },
    {
      $group: {
        _id: {
          date: dateGroupingExpression,
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

  // --- Logic hợp nhất dữ liệu để lấp đầy các ngày/tuần/tháng còn thiếu ---
  let completeData = [];
  let allDates = [];

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    let key;
    if (granularity === 'daily') {
        key = formatDateVN(currentDate);
    } else if (granularity === 'weekly') {
        // Lấy ngày đầu tuần (Chủ Nhật)
        const vnCurrent = new Date(currentDate.getTime() + VN_OFFSET_MS);
        const dayOfWeek = vnCurrent.getUTCDay();
        const firstDayOfWeek = new Date(currentDate.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        key = formatDateVN(firstDayOfWeek);
    } else { // monthly
        const vnCurrent = new Date(currentDate.getTime() + VN_OFFSET_MS);
        key = `${vnCurrent.getUTCFullYear()}-${String(vnCurrent.getUTCMonth() + 1).padStart(2, '0')}-01`;
    }
    
    if (!allDates.includes(key)) {
        allDates.push(key);
    }

    if (granularity === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
    } else if (granularity === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
    } else { // monthly
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  // Hợp nhất dữ liệu để lấp đầy các ngày còn thiếu
  completeData = allDates.map(dateStr => {
    const foundData = userData.find(u => u.date === dateStr);
    if (foundData) {
      return foundData;
    }
    return {
      date: dateStr,
      users: 0,
      job_seekers: 0,
      recruiters: 0
    };
  });

  return completeData;
};

/**
 * GET /api/analytics/revenue-trends
 * Thống kê doanh thu theo thời gian
 */
export const getRevenueTrends = async (queryParams) => {
  const { period, granularity, customStartDate, customEndDate } = queryParams;
  
  // Sử dụng custom dates từ frontend nếu có, nếu không thì dùng period
  let startDate, endDate;
  
  if (customStartDate && customEndDate) {
    // Frontend gửi ngày dạng YYYY-MM-DD, parse và chuyển sang UTC
    const [startYear, startMonth, startDay] = customStartDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = customEndDate.split('-').map(Number);
    
    startDate = vnDateToUTC(startYear, startMonth, startDay, false);
    endDate = vnDateToUTC(endYear, endMonth, endDay, true);
    
    console.log('✅ getRevenueTrends using custom dates (VN timezone):', { 
      input: { customStartDate, customEndDate },
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
  } else {
    // Sử dụng period mặc định
    const dateRange = getDateRange(period || '30d');
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
    
    console.log('✅ getRevenueTrends using period dates:', { 
      period: period || '30d',
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
  }

  // --- THAY ĐỔI LỚN BẮT ĐẦU TỪ ĐÂY ---
  // Thay vì chỉ dùng format string, ta dùng $dateTrunc để chuẩn hóa ngày - múi giờ Việt Nam
  const dateGroupingExpression = {
    $dateToString: {
      format: '%Y-%m-%d', // Luôn trả về định dạng YYYY-MM-DD
      date: {
        $dateTrunc: {
          date: '$createdAt',
          unit: granularity === 'weekly' ? 'week' : (granularity === 'monthly' ? 'month' : 'day'),
          timezone: 'Asia/Ho_Chi_Minh',
          // 'week' sẽ lấy ngày đầu tuần (thường là Chủ Nhật hoặc Thứ Hai tùy cấu hình)
          // 'month' sẽ lấy ngày 01 của tháng
          // 'day' sẽ giữ nguyên ngày
        },
      },
      timezone: 'Asia/Ho_Chi_Minh',
    },
  };
  // --- KẾT THÚC THAY ĐỔI ---

  // --- Thực hiện các truy vấn tổng hợp song song ---
  const [revenueTrendsData, jobPostings, applications] = await Promise.all([
    // 1. Lấy dữ liệu doanh thu thực tế từ DB
    CoinRecharge.aggregate([
      { $match: { status: "SUCCESS", createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: dateGroupingExpression, // <-- Sử dụng biểu thức mới
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
                _id: dateGroupingExpression, // <-- Sử dụng biểu thức mới
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
                _id: dateGroupingExpression, // <-- Sử dụng biểu thức mới
                applications: { $sum: 1 } // Đếm số lượng
            }
        },
        { $sort: { _id: 1 } }
    ])
  ]);

  // --- Logic hợp nhất dữ liệu để lấp đầy các ngày/tuần/tháng còn thiếu ---
  let mergedData = [];
  let allDates = [];

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    let key;
    if (granularity === 'daily') {
        key = formatDateVN(currentDate);
    } else if (granularity === 'weekly') {
        // Lấy ngày đầu tuần (Chủ Nhật) theo VN timezone
        const vnCurrent = new Date(currentDate.getTime() + VN_OFFSET_MS);
        const dayOfWeek = vnCurrent.getUTCDay();
        const firstDayOfWeek = new Date(currentDate.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        key = formatDateVN(firstDayOfWeek);
    } else { // monthly
        const vnCurrent = new Date(currentDate.getTime() + VN_OFFSET_MS);
        key = `${vnCurrent.getUTCFullYear()}-${String(vnCurrent.getUTCMonth() + 1).padStart(2, '0')}-01`;
    }
    
    if (!allDates.includes(key)) {
        allDates.push(key);
    }

    if (granularity === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
    } else if (granularity === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
    } else { // monthly
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }
  

  mergedData = allDates.map(dateStr => {
      const revenue = revenueTrendsData.find(rt => rt.date === dateStr);
      const jobs = jobPostings.find(jp => jp._id === dateStr);
      const apps = applications.find(ap => ap._id === dateStr);
      
      return {
        date: dateStr,
        revenue: revenue ? revenue.revenue : 0,
        job_postings: jobs ? jobs.job_postings : 0,
        applications: apps ? apps.applications : 0
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
    { 
      $match: { 
        status: "ACTIVE", 
        moderationStatus: "APPROVED" // Sửa từ approved thành moderationStatus
      } 
    },
    { 
      $group: { 
        _id: "$category", 
        count: { $sum: 1 } 
      } 
    },
    { 
      $project: { 
        _id: 0, 
        category: "$_id", 
        count: 1 
      } 
    },
    { $sort: { count: -1 } },
    { $limit: 10 }, // Lấy top 10 categories
  ]);
  
  return results;
};

/**
 * GET /api/analytics/top-companies
 * Lấy danh sách công ty hàng đầu (theo số lượng tin đăng tuyển nhiều nhất)
 * Sắp xếp: Công ty có nhiều việc làm ACTIVE + APPROVED nhất sẽ lên đầu
 */
export const getTopCompanies = async (limit = 6) => {
  try {
    // Bước 1: Thử lấy công ty APPROVED có tin active
    let companies = await RecruiterProfile.aggregate([
      {
        $match: {
          'company.name': { $exists: true },
          approvalStatus: 'APPROVED' // Chỉ lấy công ty đã được phê duyệt
        }
      },
      {
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: 'recruiterProfileId',
          as: 'jobs'
        }
      },
      {
        $addFields: {
          activeJobCount: {
            $size: {
              $filter: {
                input: '$jobs',
                as: 'job',
                cond: { 
                  $and: [
                    { $eq: ['$$job.status', 'ACTIVE'] },
                    { $eq: ['$$job.moderationStatus', 'APPROVED'] },
                    { $gte: ['$$job.deadline', new Date()] } // Chỉ đếm jobs chưa hết hạn
                  ]
                }
              }
            }
          },
          // Tổng số tất cả tin đăng (kể cả inactive) để hiển thị thêm
          totalJobCount: { $size: '$jobs' }
        }
      },
      {
        $match: {
          activeJobCount: { $gt: 0 } // Chỉ lấy công ty có ít nhất 1 việc làm active
        }
      },
      {
        $project: {
          _id: 1,
          companyName: '$company.name',
          logo: '$company.logo',
          industry: '$company.industry',
          employees: '$company.employees',
          about: '$company.about',
          location: {
            province: '$company.location.province',
            district: '$company.location.district',
            address: '$company.location.address'
          },
          activeJobCount: 1,
          totalJobCount: 1,
          userId: 1,
          approvalStatus: 1
        }
      },
      { 
        $sort: { 
          activeJobCount: -1,  // Sắp xếp theo số việc làm active giảm dần
          totalJobCount: -1     // Nếu bằng nhau thì xét tổng số tin
        } 
      },
      { $limit: limit }
    ]);

    // Bước 2: Nếu không có kết quả, lấy bất kỳ công ty nào có tin đăng
    if (companies.length === 0) {
      companies = await RecruiterProfile.aggregate([
        {
          $match: {
            'company.name': { $exists: true }
          }
        },
        {
          $lookup: {
            from: 'jobs',
            localField: '_id',
            foreignField: 'recruiterProfileId',
            as: 'jobs'
          }
        },
        {
          $addFields: {
            activeJobCount: {
              $size: {
                $filter: {
                  input: '$jobs',
                  as: 'job',
                  cond: { 
                    $and: [
                      { $eq: ['$$job.status', 'ACTIVE'] },
                      { $eq: ['$$job.moderationStatus', 'APPROVED'] },
                      { $gte: ['$$job.deadline', new Date()] } // Chỉ đếm jobs chưa hết hạn
                    ]
                  }
                }
              }
            },
            totalJobCount: { $size: '$jobs' }
          }
        },
        {
          $match: {
            totalJobCount: { $gt: 0 } // Lấy công ty có ít nhất 1 tin (kể cả chưa active)
          }
        },
        {
          $project: {
            _id: 1,
            companyName: '$company.name',
            logo: '$company.logo',
            industry: '$company.industry',
            employees: '$company.employees',
            about: '$company.about',
            location: {
              province: '$company.location.province',
              district: '$company.location.district',
              address: '$company.location.address'
            },
            activeJobCount: 1,
            totalJobCount: 1,
            userId: 1,
            approvalStatus: 1
          }
        },
        { 
          $sort: { 
            activeJobCount: -1,
            totalJobCount: -1
          } 
        },
        { $limit: limit }
      ]);
    }
    
    return companies;
  } catch (error) {
    throw error;
  }
};

/**
 * GET /api/analytics/company-stats
 * Thống kê các công ty theo trạng thái
 * Logic khớp với getAdminStats: chỉ đếm RecruiterProfile có company.name không rỗng
 */
export const getCompanyStats = async () => {
  const stats = await RecruiterProfile.aggregate([
    {
      $match: {
        'company.name': { $exists: true, $ne: null, $ne: '' },
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

/**
 * GET /api/analytics/transaction-trends  
 * Phân tích chi tiết về giao dịch - dành riêng cho trang quản lý giao dịch
 */
export const getTransactionAnalytics = async (queryParams) => {
  const { period, granularity, customStartDate, customEndDate } = queryParams;
  
  // Sử dụng custom dates từ frontend nếu có, nếu không thì dùng period
  let startDate, endDate;
  
  if (customStartDate && customEndDate) {
    // Frontend gửi ngày dạng ISO string hoặc YYYY-MM-DD, parse và chuyển sang UTC
    const startParsed = new Date(customStartDate);
    const endParsed = new Date(customEndDate);
    
    // Nếu là ISO string đầy đủ, dùng trực tiếp
    if (customStartDate.includes('T')) {
      startDate = startParsed;
      endDate = endParsed;
    } else {
      // Nếu là YYYY-MM-DD, chuyển sang UTC theo VN timezone
      const [startYear, startMonth, startDay] = customStartDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = customEndDate.split('-').map(Number);
      
      startDate = vnDateToUTC(startYear, startMonth, startDay, false);
      endDate = vnDateToUTC(endYear, endMonth, endDay, true);
    }
    
    console.log('✅ getTransactionAnalytics using custom dates:', { 
      input: { customStartDate, customEndDate },
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
  } else {
    // Sử dụng period mặc định
    const dateRange = getDateRange(period || '30d');
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
    
    console.log('✅ getTransactionAnalytics using period dates:', { 
      period: period || '30d',
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString() 
    });
  }
  // Xác định định dạng ngày tháng cho việc nhóm dữ liệu - sử dụng múi giờ Việt Nam (UTC+7)
  const dateGroupingExpression = {
    $dateToString: {
      format: '%Y-%m-%d', // Luôn trả về định dạng YYYY-MM-DD
      date: {
        $dateTrunc: {
          date: '$createdAt',
          unit: granularity === 'weekly' ? 'week' : (granularity === 'monthly' ? 'month' : 'day'),
          timezone: 'Asia/Ho_Chi_Minh', // Múi giờ Việt Nam
        },
      },
      timezone: 'Asia/Ho_Chi_Minh', // Múi giờ Việt Nam
    },
  };

  // --- Thực hiện các truy vấn song song (bỏ revenueOverTime ra để xử lý riêng) ---
  const [
    transactionData,
    revenueByRole,
    rawRevenueByPaymentMethod,
    transactionStatusBreakdown,
    kpiMetrics,
    topSpendingUsers
  ] = await Promise.all([
    // 1. Doanh thu theo thời gian - lấy dữ liệu thực tế từ DB
    CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: dateGroupingExpression,
          revenue: { $sum: '$amountPaid' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenue: 1, transactionCount: 1 } }
    ]),

    // 2. Cơ cấu doanh thu theo vai trò người dùng
    CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: '$user.role',
          totalRevenue: { $sum: '$amountPaid' },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 'candidate'] }, then: 'Ứng viên' },
                { case: { $eq: ['$_id', 'recruiter'] }, then: 'Nhà tuyển dụng' }
              ],
              default: 'Khác'
            }
          },
          value: '$totalRevenue',
          transactionCount: '$transactionCount'
        }
      }
    ]),

    // 3. Cơ cấu doanh thu theo phương thức thanh toán - lấy dữ liệu thô từ DB
    CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$paymentMethod',
          totalRevenue: { $sum: '$amountPaid' },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          value: '$totalRevenue',
          transactionCount: '$transactionCount'
        }
      },
      { $sort: { value: -1 } }
    ]),

    // 4. Phân bố trạng thái giao dịch
    CoinRecharge.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id', // Sẽ được xử lý sau để hiển thị tên tiếng Việt
          value: '$count'
        }
      }
    ]),

    // 5. Các chỉ số KPI quan trọng
    CoinRecharge.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$amountPaid', 0]
            }
          },
          totalTransactions: { $sum: 1 },
          successfulTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0]
            }
          },
          failedTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0]
            }
          },
          pendingTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0]
            }
          },
          totalCoinsRecharged: {
            $sum: {
              $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$coinAmount', 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalTransactions: 1,
          successfulTransactions: 1,
          failedTransactions: 1,
          pendingTransactions: 1,
          totalCoinsRecharged: 1,
          averageTransactionValue: {
            $cond: [
              { $gt: ['$successfulTransactions', 0] },
              { $divide: ['$totalRevenue', '$successfulTransactions'] },
              0
            ]
          },
          successRate: {
            $cond: [
              { $gt: ['$totalTransactions', 0] },
              {
                $multiply: [
                  { $divide: ['$successfulTransactions', '$totalTransactions'] },
                  100
                ]
              },
              0
            ]
          }
        }
      }
    ]),

    // 6. Top 5 người dùng chi tiêu nhiều nhất
    CoinRecharge.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$amountPaid' },
          transactionCount: { $sum: 1 },
          userEmail: { $first: '$user.email' },
          userRole: { $first: '$user.role' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          email: '$userEmail',
          role: {
            $switch: {
              branches: [
                { case: { $eq: ['$userRole', 'candidate'] }, then: 'Ứng viên' },
                { case: { $eq: ['$userRole', 'recruiter'] }, then: 'Nhà tuyển dụng' }
              ],
              default: 'Khác'
            }
          },
          totalSpent: '$totalSpent',
          transactionCount: '$transactionCount'
        }
      }
    ])
  ]);

  console.log("Raw revenue by payment method:", rawRevenueByPaymentMethod); // Debug log
  // --- Xử lý đặc biệt: Hợp nhất dữ liệu để đảm bảo đủ các phương thức thanh toán ---
  const revenueByPaymentMethod = ALL_PAYMENT_METHODS.map(methodName => {
    const foundData = rawRevenueByPaymentMethod.find(item => item.name === methodName);
    if (foundData) {
      return foundData;
    }
    return {
      name: methodName,
      value: 0, // Giá trị doanh thu là 0
      transactionCount: 0
    };
  });

  // --- Xử lý tên hiển thị cho trạng thái giao dịch ---
  const processedTransactionStatusBreakdown = transactionStatusBreakdown.map(item => ({
    ...item,
    name: TRANSACTION_STATUS_LABELS[item.name] || item.name
  }));

let revenueOverTime = [];
let allDates = [];

// Sử dụng formatDateVN đã định nghĩa ở đầu file để đồng bộ với MongoDB timezone
let currentDate = new Date(startDate);

while (currentDate <= endDate) {
  let key;
  if (granularity === 'daily') {
      key = formatDateVN(currentDate);
  } else if (granularity === 'weekly') {
      // Lấy ngày đầu tuần (Chủ Nhật) theo VN timezone
      const vnCurrent = new Date(currentDate.getTime() + VN_OFFSET_MS);
      const dayOfWeek = vnCurrent.getUTCDay();
      const firstDayOfWeek = new Date(currentDate.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      key = formatDateVN(firstDayOfWeek);
  } else { // monthly
      // Lấy ngày đầu tháng theo VN timezone
      const vnCurrent = new Date(currentDate.getTime() + VN_OFFSET_MS);
      key = `${vnCurrent.getUTCFullYear()}-${String(vnCurrent.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  if (!allDates.includes(key)) {
      allDates.push(key);
  }

  // Tăng ngày cho vòng lặp tiếp theo
  if (granularity === 'daily') {
      currentDate.setDate(currentDate.getDate() + 1);
  } else if (granularity === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7);
  } else { // monthly
      currentDate.setMonth(currentDate.getMonth() + 1);
  }
}

console.log('📅 Generated allDates for revenueOverTime:', allDates);
  // Hợp nhất dữ liệu để lấp đầy các ngày còn thiếu
  revenueOverTime = allDates.map(dateStr => {
    const foundData = transactionData.find(t => t.date === dateStr);
    if (foundData) {
      return foundData;
    }
    return {
      date: dateStr,
      revenue: 0,
      transactionCount: 0
    };
  });

  // Hợp nhất dữ liệu để lấp đầy các ngày còn thiếu
  revenueOverTime = allDates.map(dateStr => {
    const foundData = transactionData.find(t => t.date === dateStr);
    if (foundData) {
      return foundData;
    }
    return {
      date: dateStr,
      revenue: 0,
      transactionCount: 0
    };
  });

  // Xử lý dữ liệu KPI
  const metrics = kpiMetrics[0] || {
    totalRevenue: 0,
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    pendingTransactions: 0,
    totalCoinsRecharged: 0,
    averageTransactionValue: 0,
    successRate: 0
  };

  // Cấu trúc dữ liệu meta cho phân trang (mặc dù không cần thiết ở đây)
  const meta = {
    period,
    granularity,
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    },
    summary: metrics
  };

  // Cấu trúc dữ liệu trả về
  const data = {
    revenueOverTime, // Sử dụng dữ liệu đã được hợp nhất
    revenueByRole,
    revenueByPaymentMethod, // Sử dụng dữ liệu đã được làm đầy
    transactionStatusBreakdown: processedTransactionStatusBreakdown, // Sử dụng dữ liệu đã xử lý tên hiển thị
    topSpendingUsers
  };

  // Trả về cấu trúc { meta, data } như quy định
  return { meta, data };
};

/**
 * GET /api/analytics/transaction-today
 * Thống kê giao dịch trong ngày hiện tại - Real-time data
 */
export const getTransactionTodayStats = async () => {
  // Lấy thời gian đầu ngày và cuối ngày hôm nay theo múi giờ Việt Nam (UTC+7)
  const now = new Date();
  
  // Tính offset UTC+7 (7 giờ = 7 * 60 * 60 * 1000 ms)
  const vnOffset = 7 * 60 * 60 * 1000;
  
  // Lấy thời gian hiện tại theo UTC+7
  const vnNow = new Date(now.getTime() + vnOffset);
  
  // Tạo ngày bắt đầu (00:00:00) theo UTC+7, sau đó chuyển về UTC để query MongoDB
  const todayStart = new Date(Date.UTC(
    vnNow.getUTCFullYear(),
    vnNow.getUTCMonth(),
    vnNow.getUTCDate(),
    0, 0, 0, 0
  ) - vnOffset);
  
  // Tạo ngày kết thúc (23:59:59.999) theo UTC+7, sau đó chuyển về UTC
  const todayEnd = new Date(Date.UTC(
    vnNow.getUTCFullYear(),
    vnNow.getUTCMonth(),
    vnNow.getUTCDate(),
    23, 59, 59, 999
  ) - vnOffset);
  
  console.log('📅 Today stats date range (VN timezone):', {
    vnNow: vnNow.toISOString(),
    todayStart: todayStart.toISOString(),
    todayEnd: todayEnd.toISOString()
  });

  const stats = await CoinRecharge.aggregate([
    { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
    {
      $group: {
        _id: null,
        // Doanh thu hôm nay (chỉ tính giao dịch thành công)
        todayRevenue: {
          $sum: {
            $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$amountPaid', 0]
          }
        },
        // Tổng số giao dịch hôm nay
        totalTransactions: { $sum: 1 },
        // Số giao dịch thành công
        successfulTransactions: {
          $sum: {
            $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0]
          }
        },
        // Số giao dịch đang xử lý
        pendingTransactions: {
          $sum: {
            $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0]
          }
        },
        // Số giao dịch thất bại
        failedTransactions: {
          $sum: {
            $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0]
          }
        },
        // Tổng số xu được nạp thành công
        totalCoinsRecharged: {
          $sum: {
            $cond: [{ $eq: ['$status', 'SUCCESS'] }, '$coinAmount', 0]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        todayRevenue: 1,
        totalTransactions: 1,
        successfulTransactions: 1,
        pendingTransactions: 1,
        failedTransactions: 1,
        totalCoinsRecharged: 1,
        // Tính giá trị giao dịch trung bình
        averageTransactionValue: {
          $cond: [
            { $gt: ['$successfulTransactions', 0] },
            { $divide: ['$todayRevenue', '$successfulTransactions'] },
            0
          ]
        },
        // Tỷ lệ thành công
        successRate: {
          $cond: [
            { $gt: ['$totalTransactions', 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ['$successfulTransactions', '$totalTransactions'] },
                    100
                  ]
                },
                2
              ]
            },
            0
          ]
        }
      }
    }
  ]);

  // Format ngày theo múi giờ Việt Nam
  const vnDateStr = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}-${String(vnNow.getUTCDate()).padStart(2, '0')}`;

  // Nếu không có giao dịch nào hôm nay, trả về dữ liệu mặc định
  if (stats.length === 0) {
    return {
      todayRevenue: 0,
      totalTransactions: 0,
      successfulTransactions: 0,
      pendingTransactions: 0,
      failedTransactions: 0,
      totalCoinsRecharged: 0,
      averageTransactionValue: 0,
      successRate: 0,
      date: vnDateStr // Format: YYYY-MM-DD theo múi giờ VN
    };
  }

  return {
    ...stats[0],
    date: vnDateStr // Format: YYYY-MM-DD theo múi giờ VN
  };
};

/**
 * GET /api/analytics/top-spending-users
 * Danh sách người dùng chi tiêu nhiều nhất trong khoảng thời gian
 */
export const getTopSpendingUsers = async (queryParams) => {
  const { period = '30d' } = queryParams;
  const { startDate, endDate } = getDateRange(period);

  const topUsers = await CoinRecharge.aggregate([
    { $match: { status: 'SUCCESS', createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $group: {
        _id: '$userId',
        totalSpent: { $sum: '$amountPaid' },
        transactionCount: { $sum: 1 },
        totalCoinsRecharged: { $sum: '$coinAmount' },
        userEmail: { $first: '$user.email' },
        userRole: { $first: '$user.role' },
        userActive: { $first: '$user.active' },
        firstTransaction: { $min: '$createdAt' },
        lastTransaction: { $max: '$createdAt' }
      }
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 }, // Lấy top 10 thay vì 5
    {
      $project: {
        _id: 0,
        userId: '$_id',
        email: '$userEmail',
        role: {
          $switch: {
            branches: [
              { case: { $eq: ['$userRole', 'candidate'] }, then: 'Ứng viên' },
              { case: { $eq: ['$userRole', 'recruiter'] }, then: 'Nhà tuyển dụng' }
            ],
            default: 'Khác'
          }
        },
        isActive: '$userActive',
        totalSpent: '$totalSpent',
        transactionCount: '$transactionCount',
        totalCoinsRecharged: '$totalCoinsRecharged',
        averageTransactionValue: {
          $round: [{ $divide: ['$totalSpent', '$transactionCount'] }, 2]
        },
        firstTransaction: '$firstTransaction',
        lastTransaction: '$lastTransaction'
      }
    }
  ]);

  return topUsers;
};

// [MỚI] Lấy danh sách tất cả giao dịch cho admin
export const getAllTransactions = async (queryParams) => {
  const { page, limit, search, status, paymentMethod, startDate, endDate, sort } = queryParams;

  const matchStage = {};

  // Lọc theo trạng thái
  if (status) {
    matchStage.status = status;
  }
  // Lọc theo phương thức thanh toán
  if (paymentMethod) {
    matchStage.paymentMethod = paymentMethod;
  }
  // Lọc theo khoảng thời gian
  if (startDate && endDate) {
    matchStage.createdAt = { $gte: startDate, $lte: endDate };
  }

  const lookupStage = [
    // Join với collection 'users' để lấy thông tin người dùng
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    // Join với 'recruiterprofiles' và 'candidateprofiles' để lấy fullname
    {
      $lookup: {
        from: 'recruiterprofiles',
        localField: 'userId',
        foreignField: 'userId',
        as: 'recruiterProfile'
      }
    },
    {
      $lookup: {
        from: 'candidateprofiles',
        localField: 'userId',
        foreignField: 'userId',
        as: 'candidateProfile'
      }
    },
    { $unwind: { path: '$recruiterProfile', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$candidateProfile', preserveNullAndEmptyArrays: true } },
  ];

  // Lọc theo từ khóa tìm kiếm (sau khi đã join)
  if (search) {
    const searchRegex = new RegExp(search, 'i');
    matchStage.$or = [
      { transactionCode: searchRegex },
      { 'user.email': searchRegex },
      { 'recruiterProfile.fullname': searchRegex },
      { 'candidateProfile.fullname': searchRegex }
    ];
  }
  
  const sortStage = {};
  if (sort) {
      const [field, order] = sort.startsWith('-') ? [sort.substring(1), -1] : [sort, 1];
      sortStage[field] = order;
  } else {
      sortStage.createdAt = -1;
  }

  const pipeline = [
    { $match: matchStage },
    ...lookupStage,
    {
        $project: {
            _id: 1,
            transactionCode: 1,
            amountPaid: 1,
            coinAmount: 1,
            status: 1,
            paymentMethod: 1,
            createdAt: 1,
            user: {
                _id: '$user._id',
                email: '$user.email',
                fullname: { $ifNull: ['$recruiterProfile.fullname', '$candidateProfile.fullname'] }
            }
        }
    },
    {
        $facet: {
            data: [
                { $sort: sortStage },
                { $skip: (page - 1) * limit },
                { $limit: limit }
            ],
            meta: [
                { $count: 'totalItems' }
            ]
        }
    }
  ];

  const result = await CoinRecharge.aggregate(pipeline);
  const data = result[0].data;
  const totalItems = result[0].meta[0]?.totalItems || 0;
  
  return {
      data,
      meta: {
          currentPage: page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit)
      }
  };
};

// Get KPI metrics from real MongoDB data
export const getKPIData = async () => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    // Application Success Rate (current month)
    currentMonthApplications,
    currentMonthInterviewedApps,
    // Application Success Rate (last month)
    lastMonthApplications,
    lastMonthInterviewedApps,
    // Average Time to Hire
    acceptedApplications,
    // User Engagement
    totalUsers,
    activeUsers,
    totalUsersLastMonth,
    activeUsersLastMonth,
    // Platform Revenue
    currentMonthRevenue,
    lastMonthRevenue
  ] = await Promise.all([
    // Current month application success rate
    Application.countDocuments({ 
      createdAt: { $gte: currentMonthStart } 
    }),
    Application.countDocuments({ 
      createdAt: { $gte: currentMonthStart },
      status: { $in: ['SCHEDULED_INTERVIEW', 'INTERVIEWED', 'ACCEPTED'] }
    }),
    // Last month application success rate
    Application.countDocuments({ 
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
    }),
    Application.countDocuments({ 
      createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      status: { $in: ['SCHEDULED_INTERVIEW', 'INTERVIEWED', 'ACCEPTED'] }
    }),
    // Accepted applications for time to hire calculation
    Application.find({ 
      status: 'ACCEPTED',
      appliedAt: { $exists: true }
    }).populate('jobId', 'createdAt').limit(1000).lean(),
    // User engagement
    User.countDocuments(),
    User.countDocuments({ updatedAt: { $gte: thirtyDaysAgo } }),
    User.countDocuments({ createdAt: { $lt: lastMonthEnd } }),
    User.countDocuments({ 
      createdAt: { $lt: lastMonthEnd },
      updatedAt: { $gte: new Date(lastMonthStart.getTime() - 30 * 24 * 60 * 60 * 1000) }
    }),
    // Platform revenue
    CoinRecharge.aggregate([
      { 
        $match: { 
          status: 'SUCCESS', 
          createdAt: { $gte: currentMonthStart } 
        }
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: '$amountPaid' }
        }
      }
    ]),
    CoinRecharge.aggregate([
      { 
        $match: { 
          status: 'SUCCESS', 
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
        }
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: '$amountPaid' }
        }
      }
    ])
  ]);

  // Calculate Application Success Rate
  const currentSuccessRate = currentMonthApplications > 0 
    ? (currentMonthInterviewedApps / currentMonthApplications * 100) 
    : 0;
  const lastSuccessRate = lastMonthApplications > 0 
    ? (lastMonthInterviewedApps / lastMonthApplications * 100) 
    : 0;
  const successRateChange = lastSuccessRate > 0 
    ? ((currentSuccessRate - lastSuccessRate) / lastSuccessRate * 100) 
    : 0;

  // Calculate Average Time to Hire
  let avgTimeToHire = 0;
  let avgTimeToHireLastMonth = 0;
  if (acceptedApplications.length > 0) {
    const currentMonthAccepted = acceptedApplications.filter(
      app => app.appliedAt >= currentMonthStart
    );
    const lastMonthAccepted = acceptedApplications.filter(
      app => app.appliedAt >= lastMonthStart && app.appliedAt <= lastMonthEnd
    );

    if (currentMonthAccepted.length > 0) {
      const totalDays = currentMonthAccepted.reduce((sum, app) => {
        if (app.jobId && app.jobId.createdAt && app.appliedAt) {
          const days = Math.floor(
            (new Date(app.appliedAt) - new Date(app.jobId.createdAt)) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }
        return sum;
      }, 0);
      avgTimeToHire = Math.floor(totalDays / currentMonthAccepted.length);
    }

    if (lastMonthAccepted.length > 0) {
      const totalDaysLast = lastMonthAccepted.reduce((sum, app) => {
        if (app.jobId && app.jobId.createdAt && app.appliedAt) {
          const days = Math.floor(
            (new Date(app.appliedAt) - new Date(app.jobId.createdAt)) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }
        return sum;
      }, 0);
      avgTimeToHireLastMonth = Math.floor(totalDaysLast / lastMonthAccepted.length);
    }
  }
  const timeToHireChange = avgTimeToHireLastMonth > 0
    ? avgTimeToHireLastMonth - avgTimeToHire
    : 0;

  // Calculate User Engagement
  const engagementRate = totalUsers > 0 
    ? (activeUsers / totalUsers * 100) 
    : 0;
  const lastEngagementRate = totalUsersLastMonth > 0 
    ? (activeUsersLastMonth / totalUsersLastMonth * 100) 
    : 0;
  const engagementChange = lastEngagementRate > 0 
    ? ((engagementRate - lastEngagementRate) / lastEngagementRate * 100) 
    : 0;

  // Calculate Platform Revenue
  const currentRevenue = currentMonthRevenue[0]?.total || 0;
  const lastRevenue = lastMonthRevenue[0]?.total || 0;
  const revenueChange = lastRevenue > 0 
    ? ((currentRevenue - lastRevenue) / lastRevenue * 100) 
    : 0;

  return {
    applicationSuccessRate: {
      value: `${currentSuccessRate.toFixed(1)}%`,
      change: successRateChange >= 0 ? `+${successRateChange.toFixed(1)}%` : `${successRateChange.toFixed(1)}%`,
      trend: successRateChange >= 0 ? 'up' : 'down',
      description: 'Tỷ lệ ứng viên được phỏng vấn'
    },
    averageTimeToHire: {
      value: `${avgTimeToHire} ngày`,
      change: timeToHireChange !== 0 ? `${timeToHireChange > 0 ? '+' : ''}${timeToHireChange} ngày` : 'Không đổi',
      trend: timeToHireChange < 0 ? 'up' : timeToHireChange > 0 ? 'down' : 'neutral',
      description: 'Thời gian trung bình để tuyển dụng'
    },
    userEngagement: {
      value: `${Math.round(engagementRate)}%`,
      change: engagementChange >= 0 ? `+${engagementChange.toFixed(1)}%` : `${engagementChange.toFixed(1)}%`,
      trend: engagementChange >= 0 ? 'up' : 'down',
      description: 'Người dùng hoạt động trong 30 ngày'
    },
    platformRevenue: {
      value: `${(currentRevenue / 1000000).toFixed(1)}M VNĐ`,
      change: revenueChange >= 0 ? `+${revenueChange.toFixed(1)}%` : `${revenueChange.toFixed(1)}%`,
      trend: revenueChange >= 0 ? 'up' : 'down',
      description: 'Doanh thu nền tảng tháng này'
    }
  };
};

/**
 * Get most applied companies - Lấy công ty được ứng viên nộp CV nhiều nhất
 * @param {number} limit - Số lượng công ty tối đa
 * @returns {Promise<Array>} Danh sách công ty theo số lượng application
 */
export const getMostAppliedCompanies = async (limit = 12) => {
  try {
    
    // Kiểm tra tổng số applications trong DB
    const totalApplications = await Application.countDocuments();
    
    if (totalApplications === 0) {
      console.log('⚠️ No applications found, falling back to top companies by job count');
      return await getTopCompanies(limit);
    }
    
    // Đếm applications theo từng job trước
    const applicationsByJob = await Application.aggregate([
      {
        $group: {
          _id: '$jobId',
          applicationCount: { $sum: 1 }
        }
      }
    ]);
    
    
    // Tạo map jobId -> applicationCount
    const jobAppCountMap = {};
    applicationsByJob.forEach(item => {
      jobAppCountMap[item._id.toString()] = item.applicationCount;
    });
    
    // Aggregation để đếm số application cho mỗi công ty
    const companies = await RecruiterProfile.aggregate([
      {
        $match: {
          'company.name': { $exists: true }
          // BỎ filter APPROVED để hiển thị tất cả công ty (bao gồm PENDING)
          // approvalStatus: 'APPROVED'
        }
      },
      {
        // Lookup tất cả jobs của công ty
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: 'recruiterProfileId',
          as: 'allJobs'
        }
      },
      {
        // Lookup chỉ jobs ACTIVE và chưa hết hạn để hiển thị
        $lookup: {
          from: 'jobs',
          localField: '_id',
          foreignField: 'recruiterProfileId',
          as: 'activeJobs',
          pipeline: [
            {
              $match: {
                status: 'ACTIVE',
                moderationStatus: 'APPROVED',
                deadline: { $gte: new Date() } // Chỉ lấy jobs chưa hết hạn
              }
            }
          ]
        }
      },
      {
        $addFields: {
          activeJobCount: { $size: '$activeJobs' },
          totalJobCount: { $size: '$allJobs' },
          // Đếm applications thủ công từ map
          allJobIds: {
            $map: {
              input: '$allJobs',
              as: 'job',
              in: { $toString: '$$job._id' }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          companyName: '$company.name',
          logo: '$company.logo',
          industry: '$company.industry',
          employees: '$company.employees',
          about: '$company.about',
          location: {
            province: '$company.location.province',
            district: '$company.location.district',
            address: '$company.location.address'
          },
          activeJobCount: 1,
          totalJobCount: 1,
          allJobIds: 1,
          userId: 1,
          approvalStatus: 1
        }
      }
    ]);

    
    // Tính applicationCount cho từng company từ jobAppCountMap
    const companiesWithAppCount = companies.map(company => {
      let applicationCount = 0;
      
      // Cộng dồn applications từ tất cả jobs của company
      if (company.allJobIds && company.allJobIds.length > 0) {
        company.allJobIds.forEach(jobIdStr => {
          applicationCount += (jobAppCountMap[jobIdStr] || 0);
        });
      }
      
      // Tính average
      const avgApplicationPerJob = company.totalJobCount > 0 
        ? Math.round((applicationCount / company.totalJobCount) * 10) / 10
        : 0;
      
      return {
        _id: company._id,
        companyName: company.companyName,
        logo: company.logo,
        industry: company.industry,
        employees: company.employees,
        about: company.about,
        location: company.location,
        activeJobCount: company.activeJobCount,
        totalJobCount: company.totalJobCount,
        applicationCount,
        avgApplicationPerJob,
        userId: company.userId,
        approvalStatus: company.approvalStatus
      };
    });
    
    // KHÔNG LỌC BỎ công ty 0 CV - chỉ đẩy xuống cuối
    
    const companiesWithCV = companiesWithAppCount.filter(c => c.applicationCount > 0);
    const companiesWithoutCV = companiesWithAppCount.filter(c => c.applicationCount === 0);

    // Sort companies có CV theo applicationCount DESC
    companiesWithCV.sort((a, b) => {
      if (b.applicationCount !== a.applicationCount) {
        return b.applicationCount - a.applicationCount;
      }
      return b.activeJobCount - a.activeJobCount;
    });
    
    // Sort companies không có CV theo activeJobCount DESC
    companiesWithoutCV.sort((a, b) => {
      return b.activeJobCount - a.activeJobCount;
    });
    
    // Ghép lại: Có CV trước, không CV sau
    const allCompaniesSorted = [...companiesWithCV, ...companiesWithoutCV];
    
    // Take limit
    const topCompanies = allCompaniesSorted.slice(0, limit);
    
    return topCompanies;
  } catch (error) {
    throw error;
  }
};
