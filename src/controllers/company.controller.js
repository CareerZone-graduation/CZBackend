import asyncHandler from 'express-async-handler';
import * as companyService from '../services/company.service.js';

// @desc    Get the company profile of the logged-in recruiter
// @route   GET /api/v1/companies/my-company
// @access  Private/Recruiter
export const getMyCompany = asyncHandler(async (req, res) => {
  const company = await companyService.getMyCompany(req.user.id);
  res.status(200).json({
    success: true,
    message: 'Lấy thông tin công ty thành công.',
    data: company,
  });
});

// @desc    Create or Update the company profile of the logged-in recruiter
// @route   PATCH /api/v1/companies/my-company
// @access  Private/Recruiter
export const updateMyCompany = asyncHandler(async (req, res) => {
  const company = await companyService.updateMyCompany(req.user.id, req.body);
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
  const company = await companyService.updateMyCompanyLogo(req.user.id, req.file);
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
  const result = await companyService.getAllCompanies(req.query);
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
