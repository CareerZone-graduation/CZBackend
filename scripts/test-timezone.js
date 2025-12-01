// Script test timezone calculation
const vnOffset = 7 * 60 * 60 * 1000; // UTC+7
const now = new Date();

console.log('=== TIMEZONE DEBUG ===');
console.log('Server now (UTC):', now.toISOString());
console.log('Server now local:', now.toString());

// Lấy thời gian hiện tại theo UTC+7
const vnNow = new Date(now.getTime() + vnOffset);
console.log('\nVN now (calculated):', vnNow.toISOString());
console.log('VN Month:', vnNow.getUTCMonth() + 1); // 1-12
console.log('VN Day:', vnNow.getUTCDate());
console.log('VN Year:', vnNow.getUTCFullYear());

// Tính ngày đầu tháng hiện tại theo UTC+7
const currentPeriodStart = new Date(Date.UTC(
  vnNow.getUTCFullYear(),
  vnNow.getUTCMonth(),
  1, 0, 0, 0, 0
) - vnOffset);

console.log('\n=== PERIOD CALCULATION ===');
console.log('Current period start (UTC):', currentPeriodStart.toISOString());
console.log('This should be: 2025-11-30T17:00:00.000Z for December 2025 VN');

// Tính ngày đầu tháng trước
const previousPeriodStart = new Date(Date.UTC(
  vnNow.getUTCFullYear(),
  vnNow.getUTCMonth() - 1,
  1, 0, 0, 0, 0
) - vnOffset);

console.log('Previous period start (UTC):', previousPeriodStart.toISOString());
console.log('This should be: 2025-10-31T17:00:00.000Z for November 2025 VN');
