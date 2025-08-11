export default {
  testEnvironment: 'node',
  // Nơi Jest sẽ tìm các file test
  testMatch: ['**/__tests__/**/*.test.js'],
  // File setup sẽ chạy trước tất cả các test
  setupFilesAfterEnv: ['./__tests__/setup.js'],
  // Tắt cache để tránh các vấn đề liên quan đến module ES
  cache: false,
  // Xử lý ES Modules
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  // Tăng thời gian chờ mặc định cho các test (hữu ích khi có kết nối DB)
  testTimeout: 20000,
};
