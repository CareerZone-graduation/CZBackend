import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

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

// Định nghĩa các search indexes
const searchIndexes = {
  jobs: [
    {
      name: 'vt',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'chunks.embedding',
            numDimensions: 3072,
            similarity: 'cosine'
          },
          { type: 'filter', path: 'status' },
          { type: 'filter', path: 'deadline' },
          { type: 'filter', path: 'category' },
          { type: 'filter', path: 'type' },
          { type: 'filter', path: 'workType' },
          { type: 'filter', path: 'experience' },
          { type: 'filter', path: 'location.province' },
          { type: 'filter', path: 'minSalary' },
          { type: 'filter', path: 'maxSalary' },
          { type: 'filter', path: 'location.district' },
          { type: 'filter', path: 'moderationStatus' }
        ]
      }
    },
    {
      name: 'kw',
      type: 'search',
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            area: {
              type: 'token',
              normalizer: 'lowercase'
            },
            requirements: {
              type: 'string',
              analyzer: 'vi_fold_lc',
              indexOptions: 'offsets',
              store: true,
              norms: 'include'
            },
            maxSalary: {
              type: 'number',
              representation: 'double',
              indexDoubles: true,
              indexIntegers: true
            },
            workType: {
              type: 'token',
              normalizer: 'lowercase'
            },
            description: {
              type: 'string',
              analyzer: 'vi_fold_lc',
              indexOptions: 'offsets',
              store: true,
              norms: 'include'
            },
            location: {
              type: 'document',
              dynamic: false,
              fields: {
                province: { type: 'token' },
                district: { type: 'token' },
                coordinates: {
                  type: 'geo',
                  indexShapes: false
                }
              }
            },
            minSalary: {
              type: 'number',
              representation: 'double',
              indexDoubles: true,
              indexIntegers: true
            },
            title: {
              type: 'string',
              analyzer: 'vi_fold_lc',
              indexOptions: 'offsets',
              store: true,
              norms: 'include'
            },
            category: {
              type: 'token',
              normalizer: 'lowercase'
            },
            type: {
              type: 'token',
              normalizer: 'lowercase'
            },
            deadline: { type: 'date' },
            status: {
              type: 'token',
              normalizer: 'lowercase'
            },
            moderationStatus: {
              type: 'token',
              normalizer: 'lowercase'
            }
          }
        },
        analyzers: [
          {
            name: 'vi_fold_lc',
            tokenizer: { type: 'standard' },
            tokenFilters: [
              { type: 'icuFolding' },
              { type: 'lowercase' }
            ]
          }
        ]
      }
    }
  ],
  users: [
    {
      name: 'default',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 3072,
            similarity: 'cosine'
          },
          { type: 'filter', path: 'role' },
          { type: 'filter', path: 'allowSearch' }
        ]
      }
    }
  ]
};

// Hàm kiểm tra index đã tồn tại
const checkIndexExists = async (collection, indexName) => {
  try {
    const db = mongoose.connection.db;
    const indexes = await db.collection(collection).listSearchIndexes().toArray();
    return indexes.some(idx => idx.name === indexName);
  } catch (error) {
    // Nếu collection chưa có search index nào, sẽ throw error
    return false;
  }
};

// Hàm tạo hoặc update search index
const createOrUpdateIndex = async (collectionName, indexConfig) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    
    const exists = await checkIndexExists(collectionName, indexConfig.name);
    
    if (exists) {
      console.log(`   ⚠️  Index "${indexConfig.name}" đã tồn tại trong collection "${collectionName}"`);
      console.log(`   ℹ️  Để update index, bạn cần xóa index cũ và tạo lại thủ công qua Atlas UI`);
      console.log(`   ℹ️  Hoặc sử dụng Atlas Admin API\n`);
      return { status: 'exists', collection: collectionName, index: indexConfig.name };
    }
    
    // Tạo index mới
    console.log(`   🔨 Đang tạo ${indexConfig.type} index "${indexConfig.name}" cho collection "${collectionName}"...`);
    
    await collection.createSearchIndex({
      name: indexConfig.name,
      type: indexConfig.type,
      definition: indexConfig.definition
    });
    
    console.log(`   ✅ Đã tạo thành công index "${indexConfig.name}"\n`);
    return { status: 'created', collection: collectionName, index: indexConfig.name };
    
  } catch (error) {
    console.error(`   ❌ Lỗi khi tạo index "${indexConfig.name}" cho collection "${collectionName}":`, error.message);
    return { status: 'error', collection: collectionName, index: indexConfig.name, error: error.message };
  }
};

// Hàm liệt kê tất cả search indexes hiện có
const listAllIndexes = async () => {
  console.log('📋 Liệt kê tất cả Search Indexes hiện có:\n');
  
  for (const [collectionName, indexes] of Object.entries(searchIndexes)) {
    try {
      const db = mongoose.connection.db;
      const collection = db.collection(collectionName);
      const existingIndexes = await collection.listSearchIndexes().toArray();
      
      if (existingIndexes.length > 0) {
        console.log(`   Collection: ${collectionName}`);
        existingIndexes.forEach(idx => {
          console.log(`      - ${idx.name} (${idx.type || 'search'}): ${idx.status || 'ACTIVE'}`);
        });
        console.log('');
      } else {
        console.log(`   Collection: ${collectionName} - Chưa có search index nào\n`);
      }
    } catch (error) {
      console.log(`   Collection: ${collectionName} - Không thể truy vấn (${error.message})\n`);
    }
  }
};

// Main function
const main = async () => {
  await connectDB();
  
  console.log('🚀 BẮT ĐẦU TẠO/CẬP NHẬT SEARCH INDEXES\n');
  console.log('='.repeat(80) + '\n');
  
  // Liệt kê indexes hiện có
  await listAllIndexes();
  
  console.log('='.repeat(80));
  console.log('🔨 BẮT ĐẦU TẠO INDEXES MỚI\n');
  
  const results = [];
  
  // Tạo indexes cho từng collection
  for (const [collectionName, indexes] of Object.entries(searchIndexes)) {
    console.log(`📦 Collection: ${collectionName}\n`);
    
    for (const indexConfig of indexes) {
      const result = await createOrUpdateIndex(collectionName, indexConfig);
      results.push(result);
    }
  }
  
  // In tổng kết
  console.log('='.repeat(80));
  console.log('📊 TỔNG KẾT\n');
  
  const created = results.filter(r => r.status === 'created').length;
  const exists = results.filter(r => r.status === 'exists').length;
  const errors = results.filter(r => r.status === 'error').length;
  
  console.log(`   ✅ Đã tạo mới: ${created} indexes`);
  console.log(`   ⚠️  Đã tồn tại: ${exists} indexes`);
  console.log(`   ❌ Lỗi: ${errors} indexes\n`);
  
  if (errors > 0) {
    console.log('Chi tiết lỗi:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${r.collection}.${r.index}: ${r.error}`);
    });
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('\n⚠️  LƯU Ý QUAN TRỌNG:');
  console.log('   - Search indexes cần thời gian để build (có thể mất vài phút đến vài giờ)');
  console.log('   - Kiểm tra trạng thái indexes tại MongoDB Atlas UI > Search');
  console.log('   - Indexes chỉ hoạt động khi status = "ACTIVE"');
  console.log('   - Để update index đã tồn tại, cần xóa và tạo lại qua Atlas UI hoặc Admin API\n');
  
  await mongoose.connection.close();
  console.log('✅ Đã đóng kết nối MongoDB');
  process.exit(0);
};

main();
