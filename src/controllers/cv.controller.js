// src/controllers/cv.controller.js
import puppeteer from "puppeteer";
import CV from "../models/CV.js";
import { NotFoundError } from "../utils/AppError.js";
import config  from "../config/index.js";
/**
 * @desc    Create a new CV
 * @route   POST /api/cvs
 * @access  Private
 */
export const createCv = async (req, res) => {
  const { templateId } = req.body;

  if (!templateId) {
    return res.status(400).json({
      success: false,
      message: "Template ID is required",
    });
  }

  // Create a new CV with the selected templateId and empty data
  const newCv = new CV({
    userId: req.user._id,
    templateId,
    title: "New CV",
    cvData: {
      personalInfo: {},
      professionalSummary: "",
      workExperience: [],
      education: [],
      skills: [],
      projects: [],
      certificates: [],
      sectionOrder: [
        "summary",
        "experience",
        "education",
        "skills",
        "projects",
        "certificates",
      ],
      hiddenSections: [], // Thêm hiddenSections
      template: templateId,
    },
  });

  const createdCv = await newCv.save();

  res.status(201).json({
    success: true,
    message: "Tạo CV thành công.",
    data: createdCv,
  });
};

/**
 * @desc    Create a new CV from a template with initial data
 * @route   POST /api/cvs/from-template
 * @access  Private
 */
export const createCvFromTemplate = async (req, res) => {
  const { templateId, cvData, title } = req.body;

  if (!templateId) {
    return res.status(400).json({
      success: false,
      message: "Template ID is required",
    });
  }

  // Create a new CV with the selected templateId and provided data
  const newCv = new CV({
    userId: req.user._id,
    templateId,
    title: title || "New CV from Template",
    cvData: {
      ...cvData,
      template: templateId, // Ensure template is set in cvData
    },
  });

  const createdCv = await newCv.save();

  res.status(201).json({
    success: true,
    message: "Tạo CV từ mẫu thành công.",
    data: createdCv,
  });
};

/**
 * @desc    Create a new CV from profile data
 * @route   POST /api/cvs/from-profile
 * @access  Private
 */
export const createCvFromProfile = async (req, res) => {
  const { templateId, title } = req.body;

  if (!templateId) {
    return res.status(400).json({
      success: false,
      message: "Template ID is required",
    });
  }

  // Import CandidateProfile model
  const { CandidateProfile } = await import('../models/index.js');
  
  // Get candidate profile
  const profile = await CandidateProfile.findOne({ userId: req.user._id }).lean();
  
  if (!profile) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy hồ sơ ứng viên. Vui lòng hoàn thiện hồ sơ trước.",
    });
  }

  // Map profile data to CV format
  const cvData = {
    personalInfo: {
      fullName: profile.fullname || '',
      email: req.user.email || '',
      phone: profile.phone || '',
      address: profile.address || '',
      website: profile.website || '',
      linkedin: profile.linkedin || '',
      github: profile.github || '',
      profileImage: profile.avatar || '',
    },
    professionalSummary: profile.bio || '',
    workExperience: (profile.experiences || []).map(exp => ({
      position: exp.position || '',
      company: exp.company || '',
      location: exp.location || '',
      startDate: exp.startDate || '',
      endDate: exp.endDate || '',
      isCurrentJob: exp.isCurrentJob || false,
      description: exp.description || '',
      achievements: exp.achievements || exp.responsibilities || [],
    })),
    education: (profile.educations || []).map(edu => ({
      degree: edu.degree || '',
      institution: edu.school || '',
      fieldOfStudy: edu.major || '',
      location: edu.location || '',
      startDate: edu.startDate || '',
      endDate: edu.endDate || '',
      gpa: edu.gpa || '',
      honors: edu.honors || '',
      description: edu.description || '',
    })),
    skills: (profile.skills || []).map(skill => ({
      name: skill.name || '',
      level: skill.level || '',
      category: skill.category || 'Technical',
    })),
    projects: (profile.projects || []).map(project => ({
      name: project.name || '',
      description: project.description || '',
      url: project.url || '',
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      technologies: project.technologies || [],
    })),
    certificates: (profile.certificates || []).map(cert => ({
      name: cert.name || '',
      issuer: cert.issuer || '',
      issueDate: cert.issueDate || '',
      expiryDate: cert.expiryDate || '',
      credentialId: cert.credentialId || '',
      url: cert.url || '',
    })),
    sectionOrder: [
      "summary",
      "experience",
      "education",
      "skills",
      "projects",
      "certificates",
    ],
    hiddenSections: [],
    template: templateId,
  };

  // Create new CV with profile data
  const newCv = new CV({
    userId: req.user._id,
    templateId,
    title: title || `${profile.fullname || 'My'} CV`,
    cvData,
  });

  const createdCv = await newCv.save();

  res.status(201).json({
    success: true,
    message: "Tạo CV từ hồ sơ thành công.",
    data: createdCv,
  });
};

/**
 * @desc    Get CV by ID
 * @route   GET /api/cvs/:id
 * @access  Private
 */
export const getCvById = async (req, res) => {
  const cv = await CV.findById(req.params.id);

  if (!cv) {
    throw new NotFoundError("CV not found");
  }

  // Check if user owns this CV
  // if (cv.userId.toString() !== req.user._id.toString()) {
  //     return res.status(403).json({
  //         success: false,
  //         message: 'Not authorized to access this CV'
  //     });
  // }

  res.status(200).json({
    success: true,
    message: "Lấy CV thành công.",
    data: cv,
  });
};

/**
 * @desc    Update a CV
 * @route   PUT /api/cvs/:id
 * @access  Private
 */
export const updateCv = async (req, res) => {
  const { title, cvData } = req.body;

  console.log("Updating CV with data:", { title, cvData });

  const cv = await CV.findById(req.params.id);

  if (!cv) {
    throw new NotFoundError("CV not found");
  }

  // Check if user owns this CV
  if (cv.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to update this CV",
    });
  }

  // Update fields
  if (title) cv.title = title;
  if (cvData) cv.cvData = cvData;

  const updatedCv = await cv.save();

  res.status(200).json({
    success: true,
    message: "Cập nhật CV thành công.",
    data: updatedCv,
  });
};

/**
 * @desc    Rename a CV (update only the name/title)
 * @route   PATCH /api/cvs/:id
 * @access  Private
 */
export const renameCv = async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "CV name is required",
    });
  }

  const cv = await CV.findById(req.params.id);

  if (!cv) {
    throw new NotFoundError("CV not found");
  }

  // Check if user owns this CV
  if (cv.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to update this CV",
    });
  }

  // Update only the title/name
  cv.title = name.trim();
  const updatedCv = await cv.save();

  res.status(200).json({
    success: true,
    message: "Đổi tên CV thành công.",
    data: updatedCv,
  });
};

export const deleteCv = async (req, res) => {
  const cv = await CV.findById(req.params.id);

  if (!cv) {
    throw new NotFoundError("CV not found");
  }

  // Check if user owns this CV
  if (cv.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to delete this CV",
    });
  }

  await CV.deleteOne({ _id: req.params.id });

  res.status(200).json({
    success: true,
    message: "Xóa CV thành công.",
  });
};

export const getAllCvsByUser = async (req, res) => {
  const cvs = await CV.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    message: "Lấy tất cả CV thành công.",
    data: cvs,
  });
};

export const duplicateCv = async (req, res) => {
  const { name } = req.body;

  const originalCv = await CV.findById(req.params.id);

  if (!originalCv) {
    throw new NotFoundError("CV not found");
  }

  // Check if user owns this CV
  if (originalCv.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to duplicate this CV",
    });
  }

  // Create duplicate
  const duplicatedCv = new CV({
    userId: req.user._id,
    templateId: originalCv.templateId,
    title: name || `${originalCv.title} (Copy)`,
    cvData: originalCv.cvData,
  });

  await duplicatedCv.save();

  res.status(201).json({
    success: true,
    message: "Sao chép CV thành công.",
    data: duplicatedCv,
  });
};

export const exportPdf = async (req, res) => {
  console.log("Exporting CV as PDF");
  const { id } = req.params;
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
    ],
  });
  const page = await browser.newPage();
  // ================= THÊM CÁC LISTENER GỠ LỖI =================
  // 1. In ra tất cả console log từ trang web
  // page.on('console', msg => console.log(`[PUPPETEER CONSOLE] ${msg.text()}`));
  // // 2. In ra lỗi nếu có yêu cầu mạng thất bại (VD: Lỗi API, CORS)
  // page.on('requestfailed', request => {
  //     console.error(`[PUPPETEER REQUEST FAILED] URL: ${request.url()}, Method: ${request.method()}, Error: ${request.failure().errorText}`);
  // });
  try {
    // Set viewport to match A4 size for consistent rendering
    await page.setViewport({
      width: 794, // A4 width in pixels at 96 DPI (210mm)
      height: 1123, // A4 height in pixels at 96 DPI (297mm)
      deviceScaleFactor: 2, // Higher quality rendering
    });

    // Navigate to the render page
    const renderUrl = `${config.CANDIDATE_FE_URL}/render.html?cvId=${id}`;
    // const renderUrl =
    //   "http://localhost:3000/render.html?cvId=68da98728ae1c8ab421b668d";
    console.log("Navigating to:", renderUrl);
    // ✅ Thêm header auth tại đây
    await page.setExtraHTTPHeaders({
      Authorization: `Bearer ${req.headers.authorization?.split(" ")[1] ||
        process.env.INTERNAL_PDF_TOKEN
        }`,
    });

    await page.goto(renderUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    // console.log('Waiting for frontend signal (data-cv-ready="true")...');
    // await page.waitForSelector('body[data-cv-ready="true"]', {
    //     timeout: 25000 // Chờ tối đa 25 giây, nếu không sẽ báo lỗi
    // });
    // console.log('Frontend signal received! Generating PDF...');

    console.log(
      '[DEBUG] Waiting for frontend signal (data-cv-ready="true")...'
    );
    await page.waitForSelector('body[data-cv-ready="true"]', {
      timeout: 30000,
    });
    await page.waitForSelector('[data-cv-ready="true"]', { timeout: 10000 });
    console.log("[DEBUG] Frontend signal received!");

    // ================= CHỤP ẢNH MÀN HÌNH ĐỂ XEM =================
    // const screenshotPath = `debug_screenshot_${id}.png`;
    // await page.screenshot({ path: screenshotPath, fullPage: true });
    // console.log(`[DEBUG] Screenshot saved to: ${screenshotPath}`);
    // ==============================================================
// 2. Bắt Puppeteer dùng CSS media "screen"
    // Generate PDF with exact settings
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      width: '210mm',         // Giữ nguyên chiều rộng A4
  height: '1123px',         // <-- CON SỐ NÀY PHẢI KHỚP VỚI A4_HEIGHT_PX
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
      preferCSSPageSize: false,
      displayHeaderFooter: false,
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=cv-${id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ success: false, message: "Failed to generate PDF" });
  } finally {
    await browser.close();
    console.log("[DEBUG] Browser closed.");
  }
};