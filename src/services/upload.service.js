import cloudinary from '../config/cloudinary.js';
import s3Client from '../config/s3.js';
import config from '../config/index.js';
import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { BadRequestError } from '../utils/AppError.js';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Uploads a file to Cloudinary (Internal)
 * @param {Buffer} fileBuffer 
 * @param {string} folder 
 * @returns {Promise<object>}
 */
const _uploadToCloudinary = (fileBuffer, folder, resourceType = 'auto', originalName = null) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder: folder,
            resource_type: resourceType,
        };

        // For raw files (doc, docx, pdf...), Cloudinary strips the extension from the URL.
        // We explicitly set public_id with the extension so the download URL is correct.
        if (resourceType === 'raw' && originalName) {
            const ext = path.extname(originalName); // e.g. ".docx"
            const baseName = path.basename(originalName, ext); // e.g. "report"
            const safeBase = baseName.replace(/[^a-zA-Z0-9_\-]/g, '_');
            uploadOptions.public_id = `${safeBase}_${uuidv4()}${ext}`;
            uploadOptions.use_filename = false; // we set it manually above
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    console.error('Cloudinary Upload Error:', error);
                    return reject(new BadRequestError('Lỗi khi tải file lên Cloudinary.'));
                }
                resolve({
                    secure_url: result.secure_url,
                    public_id: result.public_id,
                    format: result.format,
                    resource_type: result.resource_type,
                    storageType: 'cloudinary'
                });
            }
        );
        uploadStream.end(fileBuffer);
    });
};

/**
 * Uploads a file to AWS S3 (Internal)
 * @param {Buffer} fileBuffer 
 * @param {string} folder 
 * @param {string} originalName 
 * @param {string} mimeType 
 * @returns {Promise<object>}
 */
const _uploadToS3 = async (fileBuffer, folder, originalName, mimeType) => {
    try {
        const ext = path.extname(originalName);
        const fileName = `${folder}/${uuidv4()}${ext}`;

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: config.AWS_BUCKET_NAME,
                Key: fileName,
                Body: fileBuffer,
                ContentType: mimeType,
            },
        });

        const result = await upload.done();

        return {
            secure_url: result.Location,
            public_id: result.Key,
            format: ext.substring(1),
            resource_type: 'image',
            storageType: 's3'
        };
    } catch (error) {
        console.error('S3 Upload Error:', error);
        throw new BadRequestError('Lỗi khi tải file lên S3.');
    }
};

/**
 * Uploads a file to the appropriate storage based on type.
 * Images -> S3
 * Others (CVs, Docs) -> Cloudinary
 * @param {object} file - The file object from multer (buffer, originalname, mimetype).
 * @param {string} folder - The folder to upload to.
 * @returns {Promise<object>} - The upload result.
 */
export const uploadFile = async (file, folder) => {
    if (!file) {
        throw new BadRequestError('Không có file để tải lên.');
    }

    // Images -> S3
    if (file.mimetype && file.mimetype.startsWith('image/')) {
        return await _uploadToS3(file.buffer, folder, file.originalname, file.mimetype);
    }

    // Documents (PDF, DOC, DOCX) -> Cloudinary with resource_type: 'raw'
    // 'raw' bypasses Cloudinary's content detection which rejects binary office files
    const DOC_MIMES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (file.mimetype && DOC_MIMES.includes(file.mimetype)) {
        return await _uploadToCloudinary(file.buffer, folder, 'raw', file.originalname);
    }

    // Default: auto
    return await _uploadToCloudinary(file.buffer, folder, 'auto', file.originalname);
};

// Deprecated: Alias for backward compatibility if needed, but we will refactor callers
export const uploadToCloudinary = uploadFile;

/**
 * Tạo bản sao của file từ URL (clone từ Cloudinary hoặc từ URL khác)
 * @param {string} fileUrl - URL của file cần sao chép
 * @param {string} folder - Thư mục đích trên Cloudinary
 * @param {string} publicId - ID công khai cho file mới (tùy chọn)
 * @returns {Promise<object>} - Kết quả từ Cloudinary
 */
export const copyFileFromUrlToCloudinary = async (fileUrl, folder, publicId = null) => {
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

const _deleteFromCloudinary = async (fileUrl) => {
    try {
        // Extract public_id from URL
        // Example: https://res.cloudinary.com/demo/image/upload/v1570979139/folder/sample.jpg
        // public_id: folder/sample
        // Note: This is a simplistic extraction and might need adjustment based on exact URL structure
        const parts = fileUrl.split('/');
        const filename = parts.pop();
        const folder = parts.pop(); // Assuming one level of folder
        // If there are multiple folders or versioning, this might need to be more robust.
        // However, we typically use 'cvs' or 'avatars' folder.

        // Better approach: regex
        // Cloudinary URL: .../upload/v<version>/<public_id>.<format>
        // or .../upload/<public_id>.<format>

        const regex = /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/;
        const match = fileUrl.match(regex);
        if (match && match[1]) {
            await cloudinary.uploader.destroy(match[1]);
        }
    } catch (error) {
        console.error('Cloudinary Delete Error:', error);
    }
};

const _deleteFromS3 = async (fileUrl) => {
    try {
        // Extract Key from URL
        // Example: https://bucket.s3.region.amazonaws.com/folder/filename.ext
        const urlObj = new URL(fileUrl);
        const key = urlObj.pathname.substring(1); // Remove leading /

        await s3Client.send(new DeleteObjectCommand({
            Bucket: config.AWS_BUCKET_NAME,
            Key: key,
        }));
    } catch (error) {
        console.error('S3 Delete Error:', error);
    }
};

export const deleteFile = async (fileUrl) => {
    if (!fileUrl) return;

    if (fileUrl.includes('cloudinary.com')) {
        await _deleteFromCloudinary(fileUrl);
    } else {
        // Assume S3 if not Cloudinary (or add more specific check for S3)
        await _deleteFromS3(fileUrl);
    }
};
