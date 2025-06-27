import multer from 'multer';
import { BadRequestError } from '../utils/AppError.js';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter to allow only images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new BadRequestError('Chỉ cho phép tải lên file hình ảnh!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
});

export { upload };
export const uploadAvatar = upload.single('avatar');

// File filter for CVs (PDF, DOC, DOCX)
const cvFileFilter = (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new BadRequestError('Chỉ cho phép tải lên file PDF, DOC, hoặc DOCX!'), false);
    }
};

const uploadCvFile = multer({
    storage: storage,
    fileFilter: cvFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
});

export const uploadCv = uploadCvFile.single('cv');
