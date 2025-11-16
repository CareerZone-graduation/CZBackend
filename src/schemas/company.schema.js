import { z } from 'zod';
import { provinceNames, locationMap } from '../constants/locations.enum.js'; // Import dữ liệu địa điểm



const industryEnum = z.enum([
  'Công nghệ thông tin', 'Tài chính', 'Y tế', 'Giáo dục', 'Sản xuất',
  'Bán lẻ', 'Xây dựng', 'Du lịch', 'Nông nghiệp', 'Truyền thông',
  'Vận tải', 'Bất động sản', 'Dịch vụ', 'Khởi nghiệp', 'Nhà hàng - Khách sạn',
  'Bảo hiểm', 'Logistics', 'Năng lượng', 'Viễn thông', 'Dược phẩm',
  'Hóa chất', 'Ô tô - Xe máy', 'Thực phẩm - Đồ uống', 'Thời trang - Mỹ phẩm',
  'Thể thao - Giải trí', 'Công nghiệp nặng', 'Công nghiệp điện tử', 'Công nghiệp cơ khí',
  'Công nghiệp dệt may', "Đa lĩnh vực", 'Khác'
]);


const locationSchema = z.object({
  province: z.enum(provinceNames, { required_error: 'Tỉnh/Thành phố là bắt buộc' }),
  district: z.string({ required_error: 'Quận/Huyện là bắt buộc' }),
  commune: z.string({ required_error: 'Phường/Xã là bắt buộc' }),
  coordinates: z.object({
    type: z.literal('Point').default('Point'),
    coordinates: z.array(z.number()).length(2, 'Coordinates phải có đúng 2 số [longitude, latitude]')
      .refine(coords => coords[0] >= -180 && coords[0] <= 180, 'Longitude phải trong khoảng -180 đến 180')
      .refine(coords => coords[1] >= -90 && coords[1] <= 90, 'Latitude phải trong khoảng -90 đến 90')
  }).optional()
});



const contactInfoSchema = z.object({
  email: z.string().email('Please enter a valid email').trim().toLowerCase().optional(),
  phone: z.string().regex(/^[\+]?[\d]{1,15}$/, 'Please enter a valid phone number').trim().optional(),
}).optional();


// Cập nhật create và update schema
const baseCompanySchema = z.object({
  name: z.string({ required_error: 'Tên công ty là bắt buộc' })
    .min(2, 'Tên công ty phải có ít nhất 2 ký tự')
    .max(200, 'Tên công ty không được vượt quá 200 ký tự')
    .trim(),
  about: z.string({ required_error: 'Giới thiệu công ty là bắt buộc' })
    .min(20, 'Giới thiệu công ty phải có ít nhất 20 ký tự')
    .max(2000, 'Giới thiệu không được vượt quá 2000 ký tự')
    .trim(),
  industry: industryEnum.optional(),
  taxCode: z.string()
    .max(50, 'Mã số thuế không được vượt quá 50 ký tự')
    .trim()
    .optional(),
  size: z.string()
    .max(50, 'Quy mô công ty không được vượt quá 50 ký tự')
    .trim()
    .optional(),
  website: z.string()
    .url('URL trang web không hợp lệ')
    .trim()
    .optional(),

  // THÊM CÁC TRƯỜNG MỚI
  location: locationSchema,
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200),

  // XÓA BỎ TRƯỜNG CŨ
  // address: addressSchema, 

  contactInfo: contactInfoSchema,
}).refine(data => {
  const provinceData = locationMap.get(data.location.province);
  if (!provinceData) return false;
  return provinceData.districts.some(d => d.name === data.location.district);
}, {
  message: 'Quận/Huyện không thuộc Tỉnh/Thành phố đã chọn.',
  path: ['location', 'district'],
})
  .refine(data => {
    const provinceData = locationMap.get(data.location.province);
    const districtData = provinceData.districts.find(d => d.name === data.location.district);
    if (!districtData || !districtData.communes) return false;
    return districtData.communes.includes(data.location.commune);
  }, {
    message: 'Phường/Xã không thuộc Quận/Huyện đã chọn.',
    path: ['location', 'commune'],
  });

export const createCompanySchema = baseCompanySchema;

export const updateCompanySchema = z.object({
  name: z.string({ required_error: 'Tên công ty là bắt buộc' })
    .min(2, 'Tên công ty phải có ít nhất 2 ký tự')
    .max(200, 'Tên công ty không được vượt quá 200 ký tự')
    .trim()
    .optional(),
  about: z.string({ required_error: 'Giới thiệu công ty là bắt buộc' })
    .min(20, 'Giới thiệu công ty phải có ít nhất 20 ký tự')
    .max(2000, 'Giới thiệu không được vượt quá 2000 ký tự')
    .trim()
    .optional(),
  industry: industryEnum.optional(),
  taxCode: z.string()
    .max(50, 'Mã số thuế không được vượt quá 50 ký tự')
    .trim()
    .optional(),
  size: z.string()
    .max(50, 'Quy mô công ty không được vượt quá 50 ký tự')
    .trim()
    .optional(),
  website: z.string()
    .url('URL trang web không hợp lệ')
    .trim()
    .optional(),

  // Location và address optional cho update
  location: locationSchema.optional(),
  address: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(200).optional(),

  contactInfo: contactInfoSchema,
}).refine(data => {
  if (!data.location) return true;
  const provinceData = locationMap.get(data.location.province);
  if (!provinceData) return false;
  if (data.location.district && !provinceData.districts.some(d => d.name === data.location.district)) {
    return false;
  }
  if (data.location.district && data.location.commune) {
    const districtData = provinceData.districts.find(d => d.name === data.location.district);
    if (!districtData || !districtData.communes.includes(data.location.commune)) {
      return false;
    }
  }
  return true;
}, {
  message: 'Địa chỉ không hợp lệ.',
  path: ['location'],
});

/**
 * Company jobs query parameters validation schema
 * @typedef {Object} CompanyJobsQuery
 * @property {number} page - Page number (default 1, min 1)
 * @property {number} limit - Items per page (default 10, min 1, max 50)
 * @property {string} province - Province filter (optional)
 * @property {string} sortBy - Sort field and order (optional)
 */
export const companyJobsQuerySchema = z.object({
  page: z.preprocess(
    (val) => {
      const sanitized = String(val || '1').trim();
      const parsed = parseInt(sanitized, 10);
      return isNaN(parsed) ? 1 : parsed;
    },
    z.number()
      .int('Số trang phải là số nguyên hợp lệ')
      .min(1, 'Số trang phải lớn hơn hoặc bằng 1')
      .default(1)
  ),
  limit: z.preprocess(
    (val) => {
      const sanitized = String(val || '10').trim();
      const parsed = parseInt(sanitized, 10);
      return isNaN(parsed) ? 10 : parsed;
    },
    z.number()
      .int('Số lượng kết quả phải là số nguyên hợp lệ')
      .min(1, 'Số lượng kết quả phải lớn hơn hoặc bằng 1')
      .max(50, 'Số lượng kết quả không được vượt quá 50')
      .default(10)
  ),
  province: z.preprocess(
    (val) => {
      if (!val || typeof val !== 'string') return undefined;
      return val.trim();
    },
    z.enum(provinceNames, {
      errorMap: () => {
        return {
          message: `Tỉnh/Thành phố không hợp lệ. Các giá trị cho phép: ${provinceNames.join(', ')}`
        };
      }
    }).optional()
  ),
  sortBy: z.preprocess(
    (val) => {
      if (!val || typeof val !== 'string') return undefined;
      return val.trim();
    },
    z.string()
      .regex(/^(createdAt|deadline|minSalary|maxSalary):(asc|desc)$/, {
        message: 'Tham số sắp xếp phải theo định dạng "trường:thứ_tự". ' +
          'Các trường hợp lệ: createdAt, deadline, minSalary, maxSalary. ' +
          'Thứ tự: asc (tăng dần) hoặc desc (giảm dần). ' +
          'Ví dụ: createdAt:desc'
      })
      .optional()
  ),
  search: z.preprocess(
    (val) => {
      if (!val || typeof val !== 'string') return undefined;
      return val.trim();
    },
    z.string()
      .min(1, 'Từ khóa tìm kiếm phải có ít nhất 1 ký tự')
      .max(200, 'Từ khóa tìm kiếm không được vượt quá 200 ký tự')
      .optional()
  ),
  excludeId: z.preprocess(
    (val) => {
      if (!val || typeof val !== 'string') return undefined;
      return val.trim();
    },
    z.string()
      .regex(/^[0-9a-fA-F]{24}$/, 'ID công việc không hợp lệ')
      .optional()
  )
}).strict({
  message: 'Chỉ chấp nhận các tham số truy vấn hợp lệ: page, limit, province, sortBy, search, excludeId'
});
