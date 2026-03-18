import asyncHandler from 'express-async-handler';
import axios from 'axios';
import config from '../config/index.js';
import * as applicationService from '../services/application.service.js';
import puppeteer from 'puppeteer';

/**
 * @desc      Get all applications for a specific job
 * @route     GET /api/applications/jobs/:jobId/applications
 * @access    Private - Recruiter Only
 */
export const getApplicationsByJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const options = req.validatedQuery || req.query;

  // Gọi service để lấy danh sách ứng viên
  const serviceResult = await applicationService.getApplicationsByJob(jobId, req.user._id, options);

  res.status(200).json({
    success: true,
    message: 'Lấy danh sách ứng viên thành công',
    data: serviceResult.data,
    meta: serviceResult.meta
  });
});

/**
 * @desc      Get application details by ID
 * @route     GET /api/applications/:applicationId
 * @access    Private - Recruiter Only
 */
export const getApplicationById = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await applicationService.getApplicationById(applicationId, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Lấy thông tin đơn ứng tuyển thành công',
    data: application
  });
});

import * as uploadService from '../services/upload.service.js';

/**
 * @desc      Update application status
 * @route     PATCH /api/applications/:applicationId/status
 * @access    Private - Recruiter Only
 */
export const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { status, offerLetter, feedback } = req.body;
  let offerFile = null;

  // Handle file upload if present
  if (req.file) {
    const uploadResult = await uploadService.uploadFile(req.file, 'offers');
    offerFile = uploadResult.secure_url;
  }

  const updatedApplication = await applicationService.updateApplicationStatus(
    applicationId,
    req.user._id,
    status,
    offerLetter,
    offerFile,
    feedback
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật trạng thái đơn ứng tuyển thành công',
    data: updatedApplication
  });
});

export const updateApplicationNotes = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { notes } = req.body;

  const updatedApplication = await applicationService.updateApplicationNotes(
    applicationId,
    req.user._id,
    notes
  );

  res.status(200).json({
    success: true,
    message: 'Cập nhật ghi chú cho đơn ứng tuyển thành công',
    data: updatedApplication
  });
});


/**
 * @desc      Get CV data for rendering in iframe (for CV template type)
 * @route     GET /api/applications/:applicationId/render-cv
 * @access    Private - Recruiter Only
 */
export const getApplicationCVData = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const cvData = await applicationService.getApplicationCVData(applicationId, req.user._id);

  res.status(200).json({
    success: true,
    message: 'Lấy dữ liệu CV thành công',
    data: cvData
  });
});

/**
 * @desc      Export Application CV (Snapshot) to PDF
 * @route     GET /api/applications/:applicationId/export-pdf
 * @access    Private - Recruiter Only
 */
export const exportApplicationCvPdf = async (req, res) => {
  const { applicationId } = req.params;
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
    ],
  });

  try {
    const page = await browser.newPage();
    // Set viewport A4
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2,
    });

    const token = req.headers.authorization?.split(" ")[1] || process.env.INTERNAL_PDF_TOKEN;
    const renderUrl = `${config.CANDIDATE_FE_URL}/render-application.html?applicationId=${applicationId}&token=${token}`;

    console.log("Navigating to:", renderUrl);

    // Set token in localStorage
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('accessToken', token);
    }, token);

    // Set auth header
    await page.setExtraHTTPHeaders({
      Authorization: `Bearer ${token}`,
    });

    await page.goto(renderUrl, {
      waitUntil: "networkidle0",
      timeout: 90000,
    });

    console.log('[DEBUG] Waiting for frontend signal (data-cv-ready="true")...');
    await page.waitForSelector('body[data-cv-ready="true"]', {
      timeout: 30000, // Wait up to 30s
    });
    console.log("[DEBUG] Frontend signal received!");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      width: '210mm',
      height: '1123px',
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
      preferCSSPageSize: false,
      displayHeaderFooter: false,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=application-cv-${applicationId}.pdf`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error("Error generating Application PDF:", error);
    res.status(500).json({ success: false, message: "Failed to generate PDF" });
  } finally {
    await browser.close();
  }
};

/**
 * @desc      Compare candidates via AI and stream markdown
 * @route     POST /api/applications/compare-ai
 * @access    Private - Recruiter Only
 */
export const compareWithAI = asyncHandler(async (req, res) => {
  const { applicationIds } = req.body;
  if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length < 2) {
    res.status(400);
    throw new Error('Vui lòng chọn ít nhất 2 ứng viên để so sánh');
  }

  // 1. Gather data
  const comparisonData = await applicationService.gatherComparisonData(applicationIds, req.user._id);

  // 2. Setup Headers for SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // X-Accel-Buffering for Nginx if deployed
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // 3. Request AI Service
    const aiResponse = await axios({
      method: 'post',
      url: `${config.PYTHON_SERVICE_URL}/api/v1/copilot/compare-candidates`,
      headers: {
        'x-internal-secret': config.INTERNAL_API_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        candidates: comparisonData.candidates,
        job: comparisonData.job,
        stream: true
      },
      responseType: 'stream'
    });

    // 4. Pipe stream to client with immediate flush
    aiResponse.data.on('data', chunk => {
      res.write(chunk);
      // Force flush immediately to prevent buffering
      if (res.flush) res.flush();
    });

    aiResponse.data.on('end', () => {
      res.end();
    });

    aiResponse.data.on('error', err => {
      console.error('[COMPARE_AI] Stream error:', err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('[COMPARE_AI] Error calling AI service:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'AI service unavailable' })}\n\n`);
    res.end();
  }
});
