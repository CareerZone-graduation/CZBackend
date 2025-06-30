import cloudinary from '../config/cloudinary.js';
import { BadRequestError } from '../utils/AppError.js';
// import axios from 'axios'; // Sẽ cần thêm package này để download file từ URL

/**
 * Uploads a file to Cloudinary.
 * @param {Buffer} fileBuffer - The buffer of the file to upload.
 * @param {string} folder - The folder in Cloudinary to upload the file to.
 * @returns {Promise<object>} - The upload result from Cloudinary.
 */
const uploadToCloudinary = (fileBuffer, folder) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'auto',
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary Upload Error:', error);
                    return reject(new BadRequestError('Lỗi khi tải file lên.'));
                }
                resolve(result);
            }
        );
        uploadStream.end(fileBuffer);
    });
};

/**
 * Tạo bản sao của file từ URL (clone từ Cloudinary hoặc từ URL khác)
 * @param {string} fileUrl - URL của file cần sao chép
 * @param {string} folder - Thư mục đích trên Cloudinary
 * @param {string} publicId - ID công khai cho file mới (tùy chọn)
 * @returns {Promise<object>} - Kết quả từ Cloudinary
 */
const copyFileFromUrlToCloudinary = async (fileUrl, folder, publicId = null) => {
    try {
        // Cấu hình upload
        const uploadOptions = {
            folder,
            resource_type: 'auto',
        };
        
        // Thêm publicId nếu được cung cấp
        if (publicId) {
            uploadOptions.public_id = publicId;
        }
        
        // Sử dụng API upload_large của Cloudinary để tải lên từ URL
        const result = await cloudinary.uploader.upload(fileUrl, uploadOptions);
        return result;
    } catch (error) {
        console.error('Cloudinary Copy Error:', error);
        throw new BadRequestError('Không thể tạo bản sao của CV.');
    }
};

export { uploadToCloudinary, copyFileFromUrlToCloudinary };
