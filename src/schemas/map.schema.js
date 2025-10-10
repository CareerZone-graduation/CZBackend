import { z } from 'zod';

export const getMapClustersSchema = z.object({
  // Tọa độ là bắt buộc và phải là số
  sw_lat: z.string().transform(val => parseFloat(val)).refine(val => !isNaN(val), { message: "sw_lat must be a number" }),
  sw_lng: z.string().transform(val => parseFloat(val)).refine(val => !isNaN(val), { message: "sw_lng must be a number" }),
  ne_lat: z.string().transform(val => parseFloat(val)).refine(val => !isNaN(val), { message: "ne_lat must be a number" }),
  ne_lng: z.string().transform(val => parseFloat(val)).refine(val => !isNaN(val), { message: "ne_lng must be a number" }),

  // Zoom là bắt buộc và là số nguyên
  zoom: z.string().transform(val => parseInt(val, 10)).refine(val => !isNaN(val), { message: "zoom must be an integer" }),

  // Các bộ lọc khác là tùy chọn
  query: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  minSalary: z.string().optional(),
  maxSalary: z.string().optional(),
});