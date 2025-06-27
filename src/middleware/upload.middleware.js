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

export const uploadAvatar = upload.single('avatar');
