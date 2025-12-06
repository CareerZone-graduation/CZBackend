export const PROVINCE_COORDINATES = {
    // Miền Bắc
    'Hà Nội': [105.8542, 21.0285],
    'Hà Giang': [104.9833, 22.8228],
    'Cao Bằng': [106.2667, 22.6667],
    'Bắc Kạn': [105.8333, 22.1333],
    'Tuyên Quang': [105.2167, 21.8167],
    'Lào Cai': [103.9667, 22.4833],
    'Điện Biên': [103.0167, 21.3833],
    'Lai Châu': [103.4500, 22.4000],
    'Sơn La': [103.9167, 21.3333],
    'Yên Bái': [104.8667, 21.7167],
    'Hòa Bình': [105.3333, 20.8167],
    'Thái Nguyên': [105.8333, 21.5667],
    'Lạng Sơn': [106.7667, 21.8500],
    'Quảng Ninh': [107.2000, 20.9500],
    'Bắc Giang': [106.1667, 21.2667],
    'Phú Thọ': [105.2167, 21.3167],
    'Vĩnh Phúc': [105.5833, 21.3167],
    'Bắc Ninh': [106.0667, 21.1833],
    'Hải Dương': [106.3167, 20.9333],
    'Hải Phòng': [106.6881, 20.8449],
    'Hưng Yên': [106.0500, 20.6500],
    'Thái Bình': [106.3333, 20.4500],
    'Hà Nam': [105.9167, 20.5333],
    'Nam Định': [106.1667, 20.4333],
    'Ninh Bình': [105.9667, 20.2500],

    // Miền Trung
    'Thanh Hóa': [105.7667, 19.8000],
    'Nghệ An': [105.6667, 19.3333],
    'Hà Tĩnh': [105.9000, 18.3333],
    'Quảng Bình': [106.6000, 17.4833],
    'Quảng Trị': [107.1833, 16.8000],
    'Thừa Thiên Huế': [107.6000, 16.4667],
    'Đà Nẵng': [108.2022, 16.0544],
    'Quảng Nam': [108.0000, 15.6667],
    'Quảng Ngãi': [108.8000, 15.1167],
    'Bình Định': [109.2167, 14.1667],
    'Phú Yên': [109.3000, 13.0833],
    'Khánh Hòa': [109.1833, 12.2500],
    'Ninh Thuận': [108.9833, 11.5667],
    'Bình Thuận': [108.1000, 10.9333],
    'Kon Tum': [108.0000, 14.3500],
    'Gia Lai': [108.0000, 13.9833],
    'Đắk Lắk': [108.0333, 12.6667],
    'Đắk Nông': [107.6667, 12.0000],
    'Lâm Đồng': [108.4333, 11.9500],

    // Miền Nam
    'Bình Phước': [106.8833, 11.7500],
    'Tây Ninh': [106.0833, 11.3000],
    'Bình Dương': [106.6667, 11.3000],
    'Đồng Nai': [107.1667, 10.9500],
    'Bà Rịa - Vũng Tàu': [107.1667, 10.5000],
    'Hồ Chí Minh': [106.6297, 10.8231],
    'Long An': [106.4167, 10.5333],
    'Tiền Giang': [106.3333, 10.4167],
    'Bến Tre': [106.3667, 10.2333],
    'Trà Vinh': [106.3333, 9.9333],
    'Vĩnh Long': [106.0000, 10.2500],
    'Đồng Tháp': [105.6333, 10.5000],
    'An Giang': [105.1167, 10.3833],
    'Kiên Giang': [105.0833, 10.0167],
    'Cần Thơ': [105.7469, 10.0452],
    'Hậu Giang': [105.5000, 9.7833],
    'Sóc Trăng': [105.9667, 9.6000],
    'Bạc Liêu': [105.7167, 9.2833],
    'Cà Mau': [105.1500, 9.1833]
};

/**
 * Normalizes province name by removing 'Tỉnh', 'Thành phố' and extra spaces.
 * @param {string} provinceName 
 * @returns {string} Normalized name
 */
const normalizeProvinceName = (provinceName) => {
    if (!provinceName) return '';
    return provinceName
        .replace(/^(Tỉnh|Thành phố)\s+/i, '')
        .trim();
};

/**
 * Gets coordinates for a location based on province name.
 * Uses a hardcoded map of Vietnamese provinces.
 * @param {string} province - Province name
 * @param {string} [district] - District name (optional, currently unused but kept for future extension)
 * @returns {{type: string, coordinates: number[]}} GeoJSON Point object
 */
export const getCoordinatesByLocationName = (province, district) => {
    const normalizedProvince = normalizeProvinceName(province);

    // Try to find exact match or partial match in keys
    let coords = [106.6297, 10.8231]; // Default to TP.HCM if not found

    // Find matching key
    const match = Object.keys(PROVINCE_COORDINATES).find(key =>
        key.toLowerCase() === normalizedProvince.toLowerCase() ||
        normalizedProvince.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(normalizedProvince.toLowerCase())
    );

    if (match) {
        coords = PROVINCE_COORDINATES[match];
    }

    return {
        type: 'Point',
        coordinates: coords
    };
};
