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


export const evaluateInterviewResult = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { result, feedback } = req.body;

  const updatedApplication = await applicationService.evaluateInterviewResult(
    applicationId,
    req.user._id,
    result,
    feedback
  );

  res.status(200).json({
    success: true,
    message: 'Đánh giá kết quả phỏng vấn thành công',
    data: updatedApplication
    });
});

/**
 * Chấm điểm CV của một application
 * @route POST /api/applications/:applicationId/score-cv
 */
export const scoreCV = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const userId = req.user._id;
  const forceRefresh = req.body?.forceRefresh === true;

  const cvScore = await applicationService.scoreApplicationCV(applicationId, userId, { forceRefresh });

  res.status(200).json({
    success: true,
    message: 'Chấm điểm CV thành công',
    data: cvScore
    });
  });


export const generateCV = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const userId = req.user._id;

  const generatedCV = await applicationService.generateImprovedCVForApplication(applicationId, userId);

  res.status(200).json({
    success: true,
    message: 'Tạo CV mới thành công',
    data: generatedCV
  });
});

export const getFailedExecutions = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  // Kiểm tra quyền sở hữu bằng cách lấy chi tiết ứng viên
  await applicationService.getApplicationById(applicationId, req.user._id);
  const WorkflowExecution = (await import('../models/index.js')).WorkflowExecution;
  const executions = await WorkflowExecution.find({ 
    applicationId, 
    status: 'FAILED' 
  }).sort({ executedAt: -1 }).lean();

  res.status(200).json({ success: true, data: executions });
});

export const getMyApplicationDetail = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const userId = req.user._id;

  const application = await applicationService.getMyApplicationDetail(applicationId, userId);

  res.status(200).json({
    success: true,
    message: 'Lấy chi tiết đơn ứng tuyển thành công',
    data: application
  });
});

export const startCvScoreAnalysis = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const forceRefresh = req.body?.forceRefresh === true;
  const result = await applicationService.startCvScoreAnalysis(req.user._id, applicationId, { forceRefresh });

  res.status(201).json({
    success: true,
    message: 'Khoi tao phan tich CV thanh cong',
    data: result,
  });
});

const writeSseEvent = (res, eventName, data) => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === 'function') {
    res.flush();
  }
};

export const streamCvScoreAnalysis = asyncHandler(async (req, res, next) => {
  let streamStarted = false;

  try {
    req.noCompression = true;
    const { analysisId } = req.params;
    const state = await applicationService.streamCvScoreAnalysis(req.user._id, analysisId);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    streamStarted = true;

    // Send already-buffered events immediately
    let lastEventIndex = 0;
    for (const event of state.events || []) {
      const eventName = event.type || 'progress_update';
      writeSseEvent(res, eventName, event);
      lastEventIndex++;
    }

    // If session is already completed/error, close right away
    if (state.status === 'completed' || state.status === 'error') {
      res.end();
      return;
    }

    // Keep connection open and poll for new events
    const POLL_INTERVAL = 500; // ms
    const MAX_DURATION = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    let closed = false;

    const cleanup = () => {
      closed = true;
      clearInterval(pollTimer);
    };

    req.on('close', cleanup);

    const pollTimer = setInterval(async () => {
      if (closed) return;

      // Timeout guard
      if (Date.now() - startTime > MAX_DURATION) {
        writeSseEvent(res, 'analysis_error', { message: 'Phân tích quá thời gian cho phép' });
        cleanup();
        res.end();
        return;
      }

      try {
        const latest = await applicationService.streamCvScoreAnalysis(req.user._id, analysisId);
        if (!latest) {
          cleanup();
          res.end();
          return;
        }

        const newEvents = (latest.events || []).slice(lastEventIndex);
        for (const event of newEvents) {
          const eventName = event.type || 'progress_update';
          writeSseEvent(res, eventName, event);
          lastEventIndex++;
        }

        if (latest.status === 'completed' || latest.status === 'error') {
          cleanup();
          res.end();
        }
      } catch (pollError) {
        cleanup();
        writeSseEvent(res, 'analysis_error', { message: pollError.message || 'stream_poll_error' });
        res.end();
      }
    }, POLL_INTERVAL);

  } catch (error) {
    if (!streamStarted) {
      return next(error);
    }

    writeSseEvent(res, 'analysis_error', { message: error.message || 'stream_error' });
    res.end();
  }
});
