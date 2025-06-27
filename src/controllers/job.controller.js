import * as jobService from '../services/job.service.js';

export const createJob = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const jobData = req.body;
    const job = await jobService.createJob(userId, jobData);
    res.status(201).json({
      success: true,
      message: 'Tạo công việc thành công.',
      data: job,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyJobs = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const options = req.query;
    console.log('getMyJobs options:', options);
    const result = await jobService.getJobsByRecruiter(userId, options);
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách công việc thành công.',
      meta: result.meta,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

export const getJobById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const job = await jobService.getJobById(id);
      res.status(200).json({
        success: true,
        message: 'Lấy thông tin công việc thành công.',
        data: job,
      });
    } catch (error) {
      next(error);
    }
};

export const updateJob = async (req, res, next) => {
  try {
    const { id: jobId } = req.params;
    const userId = req.user._id;
    const updateData = req.body;
    const updatedJob = await jobService.updateJob(jobId, userId, updateData);
    res.status(200).json({
      success: true,
      message: 'Cập nhật công việc thành công.',
      data: updatedJob,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteJob = async (req, res, next) => {
  try {
    const { id: jobId } = req.params;
    const userId = req.user._id;
    await jobService.deleteJob(jobId, userId);
    res.status(200).json({
      success: true,
      message: 'Xóa (soft-delete) công việc thành công.',
    });
  } catch (error)
 {
    next(error);
  }
};
