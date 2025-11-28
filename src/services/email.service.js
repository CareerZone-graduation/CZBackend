import nodemailer from 'nodemailer';
import pug from 'pug';
import { htmlToText } from 'html-to-text';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tạo transporter bên ngoài để tránh tạo lại mỗi khi gửi email
// Hoặc tạo trong hàm nếu bạn muốn linh hoạt hơn với cấu hình môi trường
let transporter;

const getTransporter = () => {
    if (!transporter) { // Chỉ tạo transporter một lần
        if (process.env.NODE_ENV === 'production') {
            // TODO: Configure for a real email service like SendGrid, Mailgun, etc.
            // Ví dụ:
            // transporter = nodemailer.createTransport({
            //   service: 'SendGrid',
            //   auth: {
            //     user: config.SENDGRID_USERNAME,
            //     pass: config.SENDGRID_PASSWORD,
            //   },
            // });
            logger.warn('Production email transport is not configured. Falling back to development setup.');
            // Fallback for demonstration; in production, you'd throw an error or use a default.
        }

        if (!transporter) { // Nếu chưa được cấu hình cho production, dùng dev
            transporter = nodemailer.createTransport({
                host: config.EMAIL_HOST,
                port: config.EMAIL_PORT,
                auth: {
                    user: config.EMAIL_USERNAME,
                    pass: config.EMAIL_PASSWORD,
                },
            });
        }
    }
    return transporter;
};

/**
 * Gửi email sử dụng Pug template.
 * @param {object} options - Các tùy chọn email.
 * @param {string} options.to - Địa chỉ email người nhận.
 * @param {string} options.subject - Tiêu đề email.
 * @param {string} options.template - Tên file Pug template (ví dụ: 'welcome', 'passwordReset').
 * @param {object} [options.data={}] - Dữ liệu sẽ truyền vào template Pug.
 * @param {string} [options.from] - Địa chỉ email gửi đi (mặc định là từ config).
 */
export const sendEmail = async (options) => {
    const { to, subject, template, html: preRenderedHtml, data = {}, from = `CareerZone <${config.EMAIL_FROM}>` } = options;

    const currentTransporter = getTransporter(); // Lấy transporter

    try {
        // 1) Render HTML if not provided
        const html = preRenderedHtml || pug.renderFile(path.join(__dirname, `../views/emails/${template}.pug`), data);


        // 2) Define email options
        const mailOptions = {
            from,
            to,
            subject,
            html,
            text: htmlToText(html),
        };

        // 3) Send email
        await currentTransporter.sendMail(mailOptions);
        logger.info(`Email sent successfully to ${to} with subject "${subject}"`);
    } catch (error) {
        logger.error(`Error sending email to ${to}:`, error);
        throw new Error('There was an error sending the email. Please try again later!');
    }
};

// Bạn có thể tạo các hàm tiện ích nhỏ hơn nếu muốn
export const sendWelcomeEmail = async (user, url) => {
    await sendEmail({
        to: user.email,
        subject: 'Chào mừng đến với CareerZone!',
        template: 'welcome',
        data: { firstName: user.email || user.fullName || 'Người dùng', url },
    });
};

export const sendPasswordResetEmail = async (user, url) => {
    await sendEmail({
        to: user.email,
        subject: 'Yêu cầu đặt lại mật khẩu của bạn (hiệu lực trong 10 phút)',
        template: 'passwordReset',
        data: { firstName: user.email || user.fullName || 'Người dùng', url },
    });
};

export const sendVerificationEmail = async (user, url) => {
    await sendEmail({
        to: user.email,
        subject: 'Xác thực địa chỉ email của bạn',
        template: 'verifyEmail',
        data: { firstName: user.email || user.fullName || 'Người dùng', url },
    });
};

export const sendSupportResponseEmail = async (supportRequest, adminResponse) => {
    const statusLabels = {
        'pending': 'Đang chờ xử lý',
        'in-progress': 'Đang xử lý',
        'resolved': 'Đã giải quyết',
        'closed': 'Đã đóng'
    };

    const categoryLabels = {
        'technical-issue': 'Vấn đề kỹ thuật',
        'account-issue': 'Vấn đề tài khoản',
        'payment-issue': 'Vấn đề thanh toán',
        'job-posting-issue': 'Vấn đề đăng tin',
        'application-issue': 'Vấn đề ứng tuyển',
        'general-inquiry': 'Thắc mắc chung'
    };

    const priorityLabels = {
        'low': 'Thấp',
        'medium': 'Trung bình',
        'high': 'Cao',
        'urgent': 'Khẩn cấp'
    };

    await sendEmail({
        to: supportRequest.requester.email,
        subject: `Phản hồi yêu cầu hỗ trợ: ${supportRequest.subject}`,
        template: 'supportResponse',
        data: {
            requesterName: supportRequest.requester.name,
            subject: supportRequest.subject,
            category: categoryLabels[supportRequest.category] || supportRequest.category,
            status: statusLabels[supportRequest.status] || supportRequest.status,
            response: adminResponse.response,
            statusChanged: adminResponse.statusChange && adminResponse.statusChange.from !== adminResponse.statusChange.to,
            newStatus: adminResponse.statusChange ? statusLabels[adminResponse.statusChange.to] : null,
            priorityChanged: adminResponse.priorityChange && adminResponse.priorityChange.from !== adminResponse.priorityChange.to,
            newPriority: adminResponse.priorityChange ? priorityLabels[adminResponse.priorityChange.to] : null
        }
    });
};


/**
 * Send confirmation email when user submits a support request
 * @param {object} supportRequest - The created support request
 */
export const sendSupportRequestConfirmationEmail = async (supportRequest) => {
    const categoryLabels = {
        'technical-issue': 'Vấn đề kỹ thuật',
        'account-issue': 'Vấn đề tài khoản',
        'payment-issue': 'Vấn đề thanh toán',
        'job-posting-issue': 'Vấn đề đăng tin',
        'application-issue': 'Vấn đề ứng tuyển',
        'general-inquiry': 'Thắc mắc chung'
    };

    await sendEmail({
        to: supportRequest.requester.email,
        subject: `Cảm ơn bạn đã liên hệ - CareerZone [#${supportRequest._id.toString().slice(-8)}]`,
        template: 'supportRequestConfirmation',
        data: {
            requesterName: supportRequest.requester.name,
            requestId: supportRequest._id.toString().slice(-8),
            subject: supportRequest.subject,
            category: categoryLabels[supportRequest.category] || supportRequest.category
        }
    });
};
