import asyncHandler from 'express-async-handler';
import * as companyService from '../services/company.service.js';
import * as jobService from '../services/job.service.js';
import * as companySchema from '../schemas/company.schema.js';
import { BadRequestError } from '../utils/AppError.js';

// Helper to parse and validate data from a JSON string field
const parseAndValidate = (jsonString, schema) => {
  if (!jsonString) {
    throw new BadRequestError('Trường companyData là bắt buộc.');
  }
  try {
    const data = JSON.parse(jsonString);
    const validationResult = schema.safeParse(data);
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.errors.map(e => e.message).join(', '));
    }
    return validationResult.data;
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError('Dữ liệu companyData không phải là JSON hợp lệ.');
  }
};

// @desc    Create a new company
// @route   POST /api/v1/companies
// @access  Private/Recruiter
export const createCompany = asyncHandler(async (req, res) => {
  const validatedData = parseAndValidate(req.body.companyData, companySchema.createCompanySchema);
  const company = await companyService.createCompany(validatedData, req.user._id, req.file);
  res.status(201).json({
    success: true,
    message: 'Đăng ký công ty thành công.',
    data: company,
  });
});

// @desc    Get the company profile of the logged-in recruiter
// @route   GET /api/v1/companies/my-company
// @access  Private/Recruiter
export const getMyCompany = asyncHandler(async (req, res) => {
  const company = await companyService.getMyCompany(req.user._id);
  res.status(200).json({
    success: true,
    message: 'Lấy thông tin công ty thành công.',
    data: company,
  });
});

// @desc    Get my company address of the logged-in recruiter
// @route   GET /api/v1/companies/my-company/address
// @access  Private/Recruiter
export const getMyCompanyAddress = asyncHandler(async (req, res) => {
  const address = await companyService.getMyCompanyAddress(req.user._id);
  res.status(200).json({
    success: true,
    message: 'Lấy địa chỉ công ty thành công.',
    data: address,
  });
});

// @desc    Update the company profile of the logged-in recruiter
// @route   PATCH /api/v1/companies/my-company
// @access  Private/Recruiter
export const updateMyCompany = asyncHandler(async (req, res) => {
  const validatedData = parseAndValidate(req.body.companyData, companySchema.updateCompanySchema);
  const company = await companyService.updateMyCompany(req.user._id, validatedData, req.file);
  res.status(200).json({
    success: true,
    message: 'Cập nhật thông tin công ty thành công.',
    data: company,
  });
});

// @desc    Update the company logo of the logged-in recruiter
// @route   POST /api/v1/companies/my-company/logo
// @access  Private/Recruiter
export const updateMyCompanyLogo = asyncHandler(async (req, res) => {
  const company = await companyService.updateMyCompanyLogo(req.user._id, req.file);
  res.status(200).json({
    success: true,
    message: 'Cập nhật logo công ty thành công.',
    data: company,
  });
});

// @desc    Get all companies (public)
// @route   GET /api/v1/companies
// @access  Public
export const getAllCompanies = asyncHandler(async (req, res) => {
  const result = await companyService.getAllCompanies(req.validatedQuery || req.query);
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách công ty thành công.',
    data: result.data,
    meta: result.meta,
  });
});

// @desc    Get a single company by ID (public)
// @route   GET /api/v1/companies/:id
// @access  Public
export const getCompanyById = asyncHandler(async (req, res) => {
  const company = await companyService.getCompanyById(req.params.id);
  res.status(200).json({
    success: true,
    message: 'Lấy thông tin chi tiết công ty thành công.',
    data: company,
  });
});

// @desc    Get all jobs from a specific company (public)
// @route   GET /api/v1/companies/:id/jobs
// @access  Public
export const getJobsByCompany = asyncHandler(async (req, res) => {
  const { id: companyId } = req.params;
  const options = { ...req.validatedQuery || req.query, companyId };
  
  const result = await jobService.getJobsByCompany(companyId, options);
  
  res.status(200).json({
    success: true,
    message: 'Lấy danh sách việc làm của công ty thành công.',
    data: result.data,
    meta: result.meta,
  });
});
