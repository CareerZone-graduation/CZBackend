const { createCv: createCvService, getCvById: getCvByIdService, updateCv: updateCvService, deleteCv: deleteCvService, getAllCvsByUser } = require('../services/cv.service');

// @desc    Create a new CV
// @route   POST /api/cvs
// @access  Private
const createCv = async (req, res) => {
  const { templateId } = req.body;
  const userId = req.user._id;

  if (!templateId) {
    return res.status(400).json({ message: 'Template ID is required' });
  }

  try {
    const cvData = {
      templateId,
      name: `New CV`,
      cvData: {}, // Start with empty data
    };

    const createdCv = await createCvService(userId, cvData);
    res.status(201).json(createdCv);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get CV by ID
// @route   GET /api/cvs/:id
// @access  Private
const getCvById = async (req, res) => {
  try {
    const cv = await getCvByIdService(req.params.id, req.user._id);
    res.json(cv);
  } catch (error) {
    if (error.message === 'Không tìm thấy CV.') {
      res.status(404).json({ message: 'CV not found' });
    } else if (error.message === 'Bạn không có quyền truy cập CV này.') {
      res.status(403).json({ message: 'Access denied' });
    } else {
      res.status(500).json({ message: 'Server Error' });
    }
  }
};

// @desc    Update a CV
// @route   PUT /api/cvs/:id
// @access  Private
const updateCv = async (req, res) => {
  const { title, cvData } = req.body;
  const userId = req.user._id;
  console.log("Updating CV with data:", cvData);
  try {
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (cvData !== undefined) updateData.cvData = cvData;

    const updatedCv = await updateCvService(req.params.id, userId, updateData);
    res.json(updatedCv);
  } catch (error) {
    if (error.message === 'Không tìm thấy CV.') {
      res.status(404).json({ message: 'CV not found' });
    } else if (error.message === 'Bạn không có quyền truy cập CV này.') {
      res.status(403).json({ message: 'Access denied' });
    } else {
      console.error(`Error: ${error.message}`);
      res.status(500).json({ message: 'Server Error' });
    }
  }
};

// @desc    Export CV as PDF
// @route   POST /api/cvs/:id/export-pdf
// @access  Private (for now)
const exportPdf = async (req, res) => {
  const { id } = req.params;

  try {
    const browser = await require('puppeteer').launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Navigate to a special, unauthenticated render-only page on the frontend
    const renderUrl = `${process.env.FRONTEND_URL}/render/${id}`;
    
    await page.goto(renderUrl, { waitUntil: 'networkidle0' });

    // const pdfBuffer = await page.pdf({
    //   format: 'A4',
    //   printBackground: true,
    //   margin: { top: '0', right: '0', bottom: '0', left: '0' },
    // });
    const pdfBuffer = await page.pdf({
  format: 'A4',
  printBackground: true,
  // Đặt lại lề để có khoảng trắng xung quanh
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
});

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cv-${id}.pdf`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
};
const CV = require('../models/CV');

const getAllCVs = async (req, res) => {
  try {
    // Make this endpoint public by not requiring authentication
    const cvs = await CV.find({});
    res.status(200).json({
      success: true,
      message: 'Lấy danh sách CV thành công.',
      data: cvs
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ message: 'Server Error' });
  }
};

const deleteCv = async (req, res) => {
  try {
    const cv = await CV.findById(req.params.id);
    if (cv) {
      await CV.deleteOne({ _id: req.params.id });
      res.json({ message: 'CV removed' });
    }
    else {
      res.status(404).json({ message: 'CV not found' });
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { createCv, getCvById, updateCv, exportPdf, getAllCVs, deleteCv };