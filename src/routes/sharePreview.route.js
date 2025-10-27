import express from 'express';
import probe from 'probe-image-size';
import { getJobById } from '../services/job.service.js';

const router = express.Router();

/**
 * Hàm kiểm tra kích thước ảnh
 * @param {string} url - URL của ảnh
 * @param {number} minWidth - Chiều rộng tối thiểu
 * @param {number} minHeight - Chiều cao tối thiểu
 * @returns {Promise<boolean>} - True nếu ảnh đủ lớn, false nếu không hoặc có lỗi
 */
async function isImageLargeEnough(url, minWidth = 200, minHeight = 200) {
  if (!url) return false;
  try {
    // Sử dụng probe để lấy kích thước mà không cần tải toàn bộ ảnh
    const dimensions = await probe(url, { timeout: 3000 }); // Timeout 3 giây
    console.log(`Image dimensions for ${url}:`, dimensions);
    return dimensions.width >= minWidth && dimensions.height >= minHeight;
  } catch (error) {
    console.error(`Error probing image size for ${url}:`, error.message);
    // Nếu có lỗi (URL không hợp lệ, timeout, ảnh hỏng), coi như ảnh không đủ lớn
    return false;
  }
}

/**
 * @route   GET /api/share-preview/jobs/:id
 * @desc    Generate HTML preview for Facebook sharing
 * @access  Public
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await getJobById(id);

    if (!job) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="vi">
          <head>
            <meta charset="UTF-8">
            <title>Không tìm thấy công việc</title>
          </head>
          <body>
            <h1>Công việc không tồn tại</h1>
            <script>
              setTimeout(() => {
                window.location.href = '${process.env.FRONTEND_URL || 'http://localhost:5173'}';
              }, 3000);
            </script>
          </body>
        </html>
      `);
    }

    // Get company logo - prioritize company logo, fallback to default
    // Facebook requires minimum 200x200px image
    const rawCompanyLogo = job.company?.logo || job.companyId?.logo;
    console.log('Raw Company Logo:', rawCompanyLogo);
    
    // Default fallback image (should be a valid, accessible image URL)
    const defaultLogo = 'https://placehold.co/1200x630?text=CareerZone';
    
    const companyLogo = rawCompanyLogo || defaultLogo;
    
    // Ensure logo URL is absolute for Facebook crawler
    let absoluteLogoUrl;
    if (companyLogo.startsWith('http')) {
      // Already absolute URL (from cloud storage like Cloudinary)
      absoluteLogoUrl = companyLogo;
    } else if (companyLogo.startsWith('/')) {
      // Relative URL from root
      absoluteLogoUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}${companyLogo}`;
    } else {
      // Relative path without leading slash
      absoluteLogoUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/${companyLogo}`;
    }
    
    // *** KIỂM TRA KÍCH THƯỚC ẢNH ***
    console.log('Checking image size for:', absoluteLogoUrl);
    // Kiểm tra xem logo công ty có đủ lớn không (tối thiểu 200x200 cho Facebook)
    const isLogoLargeEnough = await isImageLargeEnough(absoluteLogoUrl, 500, 500);
    
    // Quyết định URL cuối cùng cho og:image
    const ogImageUrl =  defaultLogo;
    console.log(`Using image for OG: ${ogImageUrl} (Logo large enough: ${isLogoLargeEnough})`);
    // *** KẾT THÚC KIỂM TRA ***
    
    console.log('Company Logo Debug:', {
      companyName: job.company?.name || job.companyId?.name,
      rawLogo: rawCompanyLogo,
      absoluteLogoUrl,
      ogImageUrl,
      isLogoLargeEnough,
      frontendUrl: process.env.FRONTEND_URL
    });

    // Actual job URL on frontend
    const actualJobUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/jobs/${id}`;

    // Clean and truncate description
    const description = (job.description || 'Tìm kiếm cơ hội nghề nghiệp tại CareerZone')
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .substring(0, 200); // Limit to 200 chars

    const title = `${job.title} - ${job.company?.name || job.companyId?.name || 'CareerZone'}`;

    // Get salary information
    const formatSalary = (min, max) => {
      if (!min && !max) return 'Thỏa thuận';
      if (min && max) return `${min.toLocaleString()} - ${max.toLocaleString()} VNĐ`;
      if (min) return `Từ ${min.toLocaleString()} VNĐ`;
      return `Đến ${max.toLocaleString()} VNĐ`;
    };

    const salary = formatSalary(job.minSalary, job.maxSalary);
    const location = [job.address, job.location?.district, job.location?.province]
      .filter(p => p && p !== 'OTHER')
      .join(', ') || 'Chưa cập nhật';

    // Generate HTML with Open Graph tags
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary Meta Tags -->
  <title>${title}</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${actualJobUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${job.company?.name || 'Company Logo'}">
  <meta property="og:site_name" content="CareerZone">
  
  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="${actualJobUrl}">
  <meta property="twitter:title" content="${title}">
  <meta property="twitter:description" content="${description}">
  <meta property="twitter:image" content="${ogImageUrl}">
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #333;
    }
    
    .container {
      max-width: 600px;
      width: 100%;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      animation: slideUp 0.5s ease-out;
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      text-align: center;
      color: white;
    }
    
    .logo-container {
      width: 100px;
      height: 100px;
      margin: 0 auto 20px;
      background: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }
    
    .logo-container img {
      width: 80%;
      height: 80%;
      object-fit: contain;
    }
    
    .logo-container .logo-placeholder {
      font-size: 2.5rem;
      font-weight: bold;
      color: #667eea;
    }
    
    .header h1 {
      font-size: 1.5rem;
      margin-bottom: 10px;
      line-height: 1.3;
    }
    
    .header .company {
      font-size: 1.1rem;
      opacity: 0.95;
      font-weight: 500;
    }
    
    .content {
      padding: 30px;
    }
    
    .info-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .info-row:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    
    .info-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 15px;
      flex-shrink: 0;
    }
    
    .info-icon svg {
      width: 20px;
      height: 20px;
      color: white;
    }
    
    .info-content {
      flex: 1;
    }
    
    .info-label {
      font-size: 0.85rem;
      color: #6b7280;
      margin-bottom: 5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .info-value {
      font-size: 1.05rem;
      color: #1f2937;
      font-weight: 600;
      line-height: 1.4;
    }
    
    .description {
      background: #f9fafb;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 25px;
      line-height: 1.6;
      color: #4b5563;
    }
    
    .cta-button {
      display: block;
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1.1rem;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
    }
    
    .cta-button:active {
      transform: translateY(0);
    }
    
    .footer {
      text-align: center;
      padding: 20px;
      color: #6b7280;
      font-size: 0.9rem;
    }
    
    .badge {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 5px;
    }
    
    @media (max-width: 640px) {
      .container {
        border-radius: 15px;
      }
      
      .header h1 {
        font-size: 1.25rem;
      }
      
      .content {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-container">
        ${absoluteLogoUrl ? 
          `<img src="${absoluteLogoUrl}" alt="${job.company?.name || 'Company'}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
           <div class="logo-placeholder" style="display: none;">${(job.company?.name || 'C').charAt(0)}</div>` :
          `<div class="logo-placeholder">${(job.company?.name || 'C').charAt(0)}</div>`
        }
      </div>
      <h1>${job.title}</h1>
      <div class="company">${job.company?.name || job.companyId?.name || 'CareerZone'}</div>
    </div>
    
    <div class="content">
      <div class="description">
        ${description}
      </div>
      
      <div class="info-row">
        <div class="info-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <div class="info-content">
          <div class="info-label">Địa điểm</div>
          <div class="info-value">${location}</div>
        </div>
      </div>
      
      <div class="info-row">
        <div class="info-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="info-content">
          <div class="info-label">Mức lương</div>
          <div class="info-value">${salary}</div>
        </div>
      </div>
      
      ${job.employmentType ? `
      <div class="info-row">
        <div class="info-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
        </div>
        <div class="info-content">
          <div class="info-label">Hình thức</div>
          <div class="info-value">
            ${job.employmentType === 'FULL_TIME' ? 'Toàn thời gian' : 
              job.employmentType === 'PART_TIME' ? 'Bán thời gian' : 
              job.employmentType === 'INTERNSHIP' ? 'Thực tập' : 
              job.employmentType}
          </div>
        </div>
      </div>
      ` : ''}
      
      <a href="${actualJobUrl}" class="cta-button">
        🚀 Xem chi tiết & Ứng tuyển ngay
      </a>
    </div>
    
    <div class="footer">
      <p>💼 Powered by <strong>CareerZone</strong></p>
    </div>
  </div>
</body>
</html>
    `.trim();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache 1 hour
    res.send(html);

  } catch (error) {
    console.error('Share preview error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>Lỗi</title>
        </head>
        <body>
          <h1>Đã có lỗi xảy ra</h1>
          <p>Vui lòng thử lại sau.</p>
          <script>
            setTimeout(() => {
              window.location.href = '${process.env.FRONTEND_URL || 'http://localhost:5173'}';
            }, 3000);
          </script>
        </body>
      </html>
    `);
  }
});

export default router;
