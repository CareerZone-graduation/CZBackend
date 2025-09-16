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
