import cloudinary from '../config/cloudinary.js';
import { BadRequestError } from '../utils/AppError.js';

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

export { uploadToCloudinary };
