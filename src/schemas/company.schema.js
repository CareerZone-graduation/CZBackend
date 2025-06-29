import { z } from 'zod';

const industryEnum = z.enum([
    'Công nghệ thông tin', 'Tài chính', 'Y tế', 'Giáo dục', 'Sản xuất',
    'Bán lẻ', 'Xây dựng', 'Du lịch', 'Nông nghiệp', 'Truyền thông',
    'Vận tải', 'Bất động sản', 'Dịch vụ', 'Khởi nghiệp', 'Nhà hàng - Khách sạn',
    'Bảo hiểm', 'Logistics', 'Năng lượng', 'Viễn thông', 'Dược phẩm',
    'Hóa chất', 'Ô tô - Xe máy', 'Thực phẩm - Đồ uống', 'Thời trang - Mỹ phẩm',
    'Thể thao - Giải trí', 'Công nghiệp nặng', 'Công nghiệp điện tử', 'Công nghiệp cơ khí',
    'Công nghiệp dệt may', "Đa lĩnh vực", 'Khác'
]);

const addressSchema = z.object({
    street: z.string().max(200, 'Street cannot exceed 200 characters').trim().optional(),
    city: z.string().max(100, 'City cannot exceed 100 characters').trim().optional(),
    country: z.string().max(100, 'Country cannot exceed 100 characters').trim().optional(),
}).optional();

const contactInfoSchema = z.object({
    email: z.string().email('Please enter a valid email').trim().toLowerCase().optional(),
    phone: z.string().regex(/^[\+]?[\d]{1,15}$/, 'Please enter a valid phone number').trim().optional(),
}).optional();
/**
 * Update company request validation schema
 * All fields are optional
 */
export const updateCompanySchema = z.object({
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
  address: addressSchema,
  contactInfo: contactInfoSchema,
});


/**
 * Create company request validation schema
 */
export const createCompanySchema = z.object({
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
  address: addressSchema,
  contactInfo: contactInfoSchema,
});
