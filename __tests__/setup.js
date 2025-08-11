import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import dotenv from 'dotenv';

// Tải file .env.test
dotenv.config({ path: '.env.test' });

let mongoServer;

// Chạy trước tất cả các test
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

// Chạy sau tất cả các test
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Chạy sau mỗi test
afterEach(async () => {
  // Xóa tất cả dữ liệu trong các collection để đảm bảo các test độc lập với nhau
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});
