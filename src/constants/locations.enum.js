import tree from '../data/oldtree.json' with { type: 'json' };

/**
 * Dữ liệu gốc có cấu trúc phân cấp của các đơn vị hành chính Việt Nam.
 * Được import trực tiếp từ file JSON.
 * Sử dụng cho các validation phức tạp cần ngữ cảnh (ví dụ: quan hệ cha-con).
 * @type {Array<object>}
 */
export const locationTree = tree;

/**
 * Mảng chỉ chứa tên của các tỉnh/thành phố.
 * Hữu ích cho việc điền vào các dropdown hoặc validation enum cơ bản.
 * @type {Array<string>}
 */
export const provinceNames = tree.map((province) => province.name);

/**
 * Một cấu trúc Map để tra cứu nhanh các quận/huyện và phường/xã theo tên tỉnh/thành.
 * Key: Tên Tỉnh/Thành (string)
 * Value: Một object chứa mảng các quận/huyện. Mỗi quận/huyện là một object có tên và mảng các phường/xã.
 * Ví dụ: 'Hà Nội' -> { districts: [{ name: 'Ba Đình', communes: ['Phúc Xá', 'Trúc Bạch', ...] }] }
 * @type {Map<string, { districts: Array<{name: string, communes: Array<string>}> }>}
 */
export const locationMap = new Map(tree.map(province => [
  province.name,
  {
    districts: province.districts
  }
]));
