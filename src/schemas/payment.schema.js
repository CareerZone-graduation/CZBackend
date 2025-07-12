import { z } from 'zod';

export const createOrderSchema = z.object({
    coins: z.number().int().positive('Số xu phải là số nguyên dương.'),
    paymentMethod: z.enum(['ZALOPAY', 'VNPAY', 'MOMO'], {
        message: 'Phương thức thanh toán không hợp lệ.'
    }),
});
