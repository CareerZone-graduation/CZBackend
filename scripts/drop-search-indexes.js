import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Tạo interface để nhận input từ user
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Kết nối MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URI);
    console.log('✅ MongoDB connected successfully\n');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Danh sách indexes có thể xóa
const indexesToDrop = {
  jobs: ['vt', 'kw'],
  users: ['default']
};

// Hàm liệt kê tất cả search indexes
const listAllIndexes = async () => {
  console.log('📋 Liệt kê tất cả Search Indexes hiện có:\n');
  
  const allIndexes = {};
  
  for (const collectionName of Object.keys(indexesToDrop)) {
    try {
      const db = mongoose.connection.db;
      const collection = db.collection(collectionName);
      const existingIndexes = await collection.listSearchIndexes().toArray();
      
      allIndexes[collectionName] = existingIndexes;
      
      if (existingIndexes.length > 0) {
        console.log(`   Collection: ${collectionName}`);
        existingIndexes.forEach((idx, i) => {
          console.log(`      ${i + 1}. ${idx.name} (${idx.type || 'search'}): ${idx.status || 'ACTIVE'}`);
        });
        console.log('');
      } else {
        console.log(`   Collection: ${collectionName} - Chưa có search index nào\n`);
      }
    } catch (error) {
      console.log(`   Collection: ${collectionName} - Không thể truy vấn (${error.message})\n`);
      allIndexes[collectionName] = [];
    }
  }
  
  return allIndexes;
};

// Hàm xóa một index
const dropIndex = async (collectionName, indexName) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    
    console.log(`   🗑️  Đang xóa index "${indexName}" từ collection "${collectionName}"...`);
    
    await collection.dropSearchIndex(indexName);
    
    console.log(`   ✅ Đã xóa thành công index "${indexName}"\n`);
    return { status: 'deleted', collection: collectionName, index: indexName };
    
  } catch (error) {
    console.error(`   ❌ Lỗi khi xóa index "${indexName}":`, error.message);
    return { status: 'error', collection: collectionName, index: indexName, error: error.message };
  }
};

// Hàm xóa tất cả indexes
const dropAllIndexes = async (allIndexes) => {
  const results = [];
  
  for (const [collectionName, indexes] of Object.entries(allIndexes)) {
    if (indexes.length === 0) continue;
    
    console.log(`📦 Collection: ${collectionName}\n`);
    
    for (const idx of indexes) {
      const result = await dropIndex(collectionName, idx.name);
      results.push(result);
    }
  }
  
  return results;
};

// Hàm xóa indexes theo lựa chọn
const dropSelectedIndexes = async () => {
  console.log('📝 Chọn indexes cần xóa:\n');
  console.log('   1. Xóa TẤT CẢ indexes');
  console.log('   2. Xóa indexes của collection JOBS');
  console.log('   3. Xóa indexes của collection USERS');
  console.log('   4. Xóa index cụ thể\n');
  
  const choice = await question('Nhập lựa chọn (1-4): ');
  
  const db = mongoose.connection.db;
  const results = [];
  
  switch (choice) {
    case '1': {
      // Xóa tất cả
      const allIndexes = await listAllIndexes();
      return await dropAllIndexes(allIndexes);
    }
    
    case '2': {
      // Xóa jobs indexes
      console.log('\n📦 Collection: jobs\n');
      const jobsIndexes = await db.collection('jobs').listSearchIndexes().toArray();
      for (const idx of jobsIndexes) {
        const result = await dropIndex('jobs', idx.name);
        results.push(result);
      }
      return results;
    }
    
    case '3': {
      // Xóa users indexes
      console.log('\n📦 Collection: users\n');
      const usersIndexes = await db.collection('users').listSearchIndexes().toArray();
      for (const idx of usersIndexes) {
        const result = await dropIndex('users', idx.name);
        results.push(result);
      }
      return results;
    }
    
    case '4': {
      // Xóa index cụ thể
      const collection = await question('Nhập tên collection (jobs/users): ');
      const indexName = await question('Nhập tên index: ');
      const result = await dropIndex(collection, indexName);
      return [result];
    }
    
    default:
      console.log('❌ Lựa chọn không hợp lệ');
      return [];
  }
};

// In tổng kết
const printResults = (results) => {
  console.log('='.repeat(80));
  console.log('📊 TỔNG KẾT\n');
  
  const deleted = results.filter(r => r.status === 'deleted').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  console.log(`   ✅ Đã xóa: ${deleted} indexes`);
  console.log(`   ❌ Lỗi: ${errors} indexes\n`);
  
  if (errors > 0) {
    console.log('Chi tiết lỗi:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${r.collection}.${r.index}: ${r.error}`);
    });
    console.log('');
  }
  
  console.log('='.repeat(80));
};

// Main function
const main = async () => {
  await connectDB();
  
  console.log('🗑️  XÓA SEARCH INDEXES\n');
  console.log('='.repeat(80) + '\n');
  
  // Liệt kê indexes hiện có
  const allIndexes = await listAllIndexes();
  
  // Kiểm tra có index nào không
  const totalIndexes = Object.values(allIndexes).reduce((sum, indexes) => sum + indexes.length, 0);
  
  if (totalIndexes === 0) {
    console.log('✅ Không có search index nào để xóa.\n');
    rl.close();
    await mongoose.connection.close();
    process.exit(0);
    return;
  }
  
  console.log('='.repeat(80) + '\n');
  
  // Hỏi xác nhận
  const confirm = await question('⚠️  Bạn có chắc chắn muốn XÓA search indexes? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('\n❌ Đã hủy thao tác xóa.');
    rl.close();
    await mongoose.connection.close();
    process.exit(0);
    return;
  }
  
  console.log('');
  
  // Xóa indexes
  const results = await dropSelectedIndexes();
  
  if (results.length > 0) {
    printResults(results);
    console.log('\n⚠️  LƯU Ý:');
    console.log('   - Indexes đã bị xóa vĩnh viễn');
    console.log('   - Để tạo lại, chạy: node scripts/create-search-indexes.js\n');
  }
  
  rl.close();
  await mongoose.connection.close();
  console.log('✅ Đã đóng kết nối MongoDB');
  process.exit(0);
};

main();
