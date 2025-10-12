// src/controllers/cv.controller.js
import asyncHandler from 'express-async-handler';
import puppeteer from 'puppeteer';
import CV from '../models/CV.js';
import { NotFoundError } from '../utils/AppError.js';

/**
 * @desc    Create a new CV
 * @route   POST /api/cvs
 * @access  Private
 */
export const createCv = asyncHandler(async (req, res) => {
    const { templateId } = req.body;

    if (!templateId) {
        return res.status(400).json({ 
            success: false,
            message: 'Template ID is required' 
        });
    }

    // Create a new CV with the selected templateId and empty data
    const newCv = new CV({
        userId: req.user._id,
        templateId,
        title: 'New CV',
        cvData: {
            personalInfo: {},
            professionalSummary: '',
            workExperience: [],
            education: [],
            skills: [],
            projects: [],
            certificates: [],
            sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'certificates'],
            template: templateId
        }
    });

    const createdCv = await newCv.save();
    
    res.status(201).json({
        success: true,
        message: 'Tạo CV thành công.',
        data: createdCv
    });
});

/**
 * @desc    Create a new CV from a template with initial data
 * @route   POST /api/cvs/from-template
 * @access  Private
 */
export const createCvFromTemplate = asyncHandler(async (req, res) => {
    const { templateId, cvData, title } = req.body;

    if (!templateId || !cvData) {
        return res.status(400).json({
            success: false,
            message: 'Template ID and CV data are required'
        });
    }

    // Create a new CV with the selected templateId and provided data
    const newCv = new CV({
        userId: req.user._id,
        templateId,
        title: title || 'New CV from Template',
        cvData: {
            ...cvData,
            template: templateId // Ensure template is set in cvData
        }
    });

    const createdCv = await newCv.save();

    res.status(201).json({
        success: true,
        message: 'Tạo CV từ mẫu thành công.',
        data: createdCv
    });
});

/**
 * @desc    Get CV by ID
 * @route   GET /api/cvs/:id
 * @access  Private
 */
export const getCvById = asyncHandler(async (req, res) => {
    const cv = await CV.findById(req.params.id);
    
    if (!cv) {
        throw new NotFoundError('CV not found');
    }
    
    // Check if user owns this CV
    if (cv.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to access this CV'
        });
    }
    
    res.status(200).json({
        success: true,
        message: 'Lấy CV thành công.',
        data: cv
    });
});

/**
 * @desc    Update a CV
 * @route   PUT /api/cvs/:id
 * @access  Private
 */
export const updateCv = asyncHandler(async (req, res) => {
    const { title, cvData } = req.body;
    
    console.log('Updating CV with data:', { title, cvData });
    
    const cv = await CV.findById(req.params.id);
    
    if (!cv) {
        throw new NotFoundError('CV not found');
    }
    
    // Check if user owns this CV
    if (cv.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to update this CV'
        });
    }
    
    // Update fields
    if (title) cv.title = title;
    if (cvData) cv.cvData = cvData;
    
    const updatedCv = await cv.save();
    
    res.status(200).json({
        success: true,
        message: 'Cập nhật CV thành công.',
        data: updatedCv
    });
});

/**
 * @desc    Delete a CV
 * @route   DELETE /api/cvs/:id
 * @access  Private
 */
export const deleteCv = asyncHandler(async (req, res) => {
    const cv = await CV.findById(req.params.id);
    
    if (!cv) {
        throw new NotFoundError('CV not found');
    }
    
    // Check if user owns this CV
    if (cv.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to delete this CV'
        });
    }
    
    await CV.deleteOne({ _id: req.params.id });
    
    res.status(200).json({
        success: true,
        message: 'Xóa CV thành công.'
    });
});

/**
 * @desc    Get all CVs of current user
 * @route   GET /api/cvs
 * @access  Private
 */
export const getAllCvsByUser = asyncHandler(async (req, res) => {
    const cvs = await CV.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
    
    res.status(200).json({
        success: true,
        message: 'Lấy tất cả CV thành công.',
        data: cvs
    });
});

/**
 * @desc    Duplicate a CV
 * @route   POST /api/cvs/:id/duplicate
 * @access  Private
 */
export const duplicateCv = asyncHandler(async (req, res) => {
    const { name } = req.body;
    
    const originalCv = await CV.findById(req.params.id);
    
    if (!originalCv) {
        throw new NotFoundError('CV not found');
    }
    
    // Check if user owns this CV
    if (originalCv.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to duplicate this CV'
        });
    }
    
    // Create duplicate
    const duplicatedCv = new CV({
        userId: req.user._id,
        templateId: originalCv.templateId,
        title: name || `${originalCv.title} (Copy)`,
        cvData: originalCv.cvData
    });
    
    await duplicatedCv.save();
    
    res.status(201).json({
        success: true,
        message: 'Sao chép CV thành công.',
        data: duplicatedCv
    });
});

/**
 * @desc    Export CV as PDF
 * @route   POST /api/cvs/:id/export-pdf
 * @access  Private
 */
export const exportPdf = asyncHandler(async (req, res) => {
    console.log('Exporting CV as PDF');
    const { id } = req.params;

    // Verify CV exists and belongs to user
    const cv = await CV.findById(id);
    
    if (!cv) {
        throw new NotFoundError('CV not found');
    }
    
    if (cv.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to export this CV'
        });
    }

    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--font-render-hinting=none' // Optimize font rendering
            ]
        });
        
        const page = await browser.newPage();

        // Log console messages from the Puppeteer page to help with debugging
        // page.on('console', msg => console.log(`PUPPETEER CONSOLE: ${msg.text()}`));
        // page.on('pageerror', error => {
        //     console.error(`PUPPETEER PAGE ERROR: ${error.message}`);
        // });

        // Set viewport to match A4 size for consistent rendering
        await page.setViewport({
            width: 794,  // A4 width in pixels at 96 DPI (210mm)
            height: 1123, // A4 height in pixels at 96 DPI (297mm)
            deviceScaleFactor: 2, // Reduced from 2 to lower file size
        });

        // Lấy accessToken từ header của request gốc
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        // Navigate to the render page
        const renderUrl = `${process.env.CLIENT_URL}/render/${id}`;
        console.log('Navigating to:', renderUrl);
        
        await page.goto(renderUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Pass token to the page's localStorage
        if (token) {
            await page.evaluate(token => {
                localStorage.setItem('accessToken', token);
            }, token);
            console.log('Access token has been set in Puppeteer page context.');
            // Tải lại trang để Redux và apiClient có thể sử dụng token mới
            await page.reload({ waitUntil: 'networkidle0' });
        }

        // Wait for any fonts to load
        await page.evaluateHandle('document.fonts.ready');

        // Additional wait for the CV content to be rendered
        await page.waitForSelector('#cv-preview', { timeout: 10000 });

        // Wait a bit more for any dynamic content and rendering
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate PDF with exact settings
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '0mm',
                right: '0mm',
                bottom: '0mm',
                left: '0mm'
            },
            preferCSSPageSize: false,
            displayHeaderFooter: false,
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=cv-${id}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate PDF'
        });
    }
});
