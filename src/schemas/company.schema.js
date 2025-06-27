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
    phone: z.string().regex(/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number').trim().optional(),
}).optional();


/**
 * Update company request validation schema
 * All fields are optional
 */
export const updateCompanySchema = z.object({
  name: z.string()
    .max(200, 'Company name cannot exceed 200 characters')
    .trim()
    .optional(),
  about: z.string()
    .max(2000, 'About cannot exceed 2000 characters')
    .trim()
    .optional(),
  industry: industryEnum.optional(),
  taxCode: z.string()
    .max(50, 'Tax code cannot exceed 50 characters')
    .trim()
    .optional(),
  businessRegistrationUrl: z.string().url().trim().optional(),
  size: z.string()
    .max(50, 'Company size cannot exceed 50 characters')
    .trim()
    .optional(),
  website: z.string()
    .url('Please enter a valid website URL')
    .trim()
    .optional(),
  address: addressSchema,
  contactInfo: contactInfoSchema,
});
