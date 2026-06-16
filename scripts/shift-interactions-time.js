import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.DB_URI || 'mongodb://localhost:27018/careerzone?directConnection=true';

// ==========================================
// CẤU HÌNH SCRIPT
// ==========================================

// SHIFT_DAYS_LIMIT: Số ngày tối đa trong quá khứ để dịch chuyển ngẫu nhiên (từ Now - 30 ngày đến Now).
const SHIFT_DAYS_LIMIT = 30;

// DRY_RUN: Chạy thử nghiệm để kiểm tra.
// - true: Chỉ tìm kiếm, tính toán và hiển thị mẫu 5 bản ghi trước/sau khi biến đổi mà KHÔNG thay đổi DB.
// - false: Thực hiện ghi đè dữ liệu trực tiếp vào database.
// Khuyến nghị: Luôn để true để kiểm tra dữ liệu trước, khi chắc chắn thì sửa thành false để chạy thực tế.
const DRY_RUN = false;

// BATCH_SIZE: Kích thước lô xử lý bulkWrite
const BATCH_SIZE = 1000;

const shiftTime = async () => {
  let connection;
  try {
    console.log('================================================================');
    console.log('    SCRIPT BIẾN ĐỔI THỜI GIAN FIELD "createdAt" TRONG DB');
    console.log('================================================================');
    console.log(`[*] Cấu hình biến đổi : Ngẫu nhiên trong ${SHIFT_DAYS_LIMIT} ngày quá khứ`);
    console.log(`[*] Chế độ hoạt động   : ${DRY_RUN ? 'DRY RUN (Chạy thử - KHÔNG LƯU DB)' : 'RUNNING (Chạy thật - SẼ UPDATE DB!)'}`);
    console.log(`[*] MongoDB URI        : ${MONGODB_URI}`);
    console.log('----------------------------------------------------------------');

    console.log('Connecting to MongoDB...');
    connection = await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully!');

    const db = mongoose.connection.db;
    const collectionName = 'interactions';
    const collection = db.collection(collectionName);

    // 1. Kiểm tra số lượng bản ghi trong collection
    const totalDocs = await collection.countDocuments();
    console.log(`[i] Tổng số bản ghi trong collection "${collectionName}": ${totalDocs}`);

    if (totalDocs === 0) {
      console.log('[!] Không có dữ liệu trong collection. Hủy thực thi script.');
      process.exit(0);
    }

    // 2. Demo sự thay đổi trên 5 bản ghi có sẵn
    console.log('\n[DEMO] THAY ĐỔI MẪU TRÊN 5 BẢN GHI ĐẦU TIÊN (Sinh ngày ngẫu nhiên trong 30 ngày qua):');
    const sampleDocs = await collection.find({ createdAt: { $exists: true } }).limit(5).toArray();

    if (sampleDocs.length === 0) {
      console.log('[!] Không tìm thấy bản ghi nào chứa trường "createdAt".');
    } else {
      const now = new Date();
      sampleDocs.forEach((doc, idx) => {
        const oldDate = doc.createdAt;
        if (oldDate instanceof Date) {
          const randomMs = Math.random() * SHIFT_DAYS_LIMIT * 24 * 60 * 60 * 1000;
          const newDate = new Date(now.getTime() - randomMs);
          console.log(`  Bản ghi #${idx + 1} (ID: ${doc._id})`);
          console.log(`    - Trước biến đổi: ${oldDate.toISOString()} (${oldDate.toLocaleString('vi-VN')})`);
          console.log(`    - Sau biến đổi  : ${newDate.toISOString()} (${newDate.toLocaleString('vi-VN')})`);
        } else {
          console.log(`  Bản ghi #${idx + 1} (ID: ${doc._id}) - Trường "createdAt" không phải kiểu Date hợp lệ. Giá trị:`, oldDate);
        }
      });
    }

    // Nếu chỉ là Dry Run thì thoát ở đây
    if (DRY_RUN) {
      console.log('\n[Dry Run] Hủy ghi dữ liệu. Không có bất kỳ thay đổi nào được áp dụng lên database.');
      console.log('[Tip] Để chạy thực tế, hãy mở file script và đổi hằng số "DRY_RUN = false" rồi chạy lại.');
      process.exit(0);
    }

    console.log('\n[*] Bắt đầu cập nhật dữ liệu thật...');
    const startTime = Date.now();

    const cursor = collection.find({ createdAt: { $exists: true, $type: 'date' } });
    let bulkOps = [];
    let processedCount = 0;
    let updatedCount = 0;
    const now = new Date();

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const randomMs = Math.random() * SHIFT_DAYS_LIMIT * 24 * 60 * 60 * 1000;
      const newDate = new Date(now.getTime() - randomMs);

      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { createdAt: newDate } }
        }
      });

      processedCount++;

      // Thực thi bulk write theo lô để tránh tràn bộ nhớ
      if (bulkOps.length >= BATCH_SIZE) {
        const bulkResult = await collection.bulkWrite(bulkOps);
        updatedCount += bulkResult.modifiedCount;
        console.log(`    -> Đã duyệt ${processedCount}/${totalDocs} bản ghi. Số bản ghi đã cập nhật: ${updatedCount}`);
        bulkOps = [];
      }
    }

    // Xử lý các bản ghi còn lại của lô cuối
    if (bulkOps.length > 0) {
      const bulkResult = await collection.bulkWrite(bulkOps);
      updatedCount += bulkResult.modifiedCount;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('[+] Cập nhật hoàn tất!');
    console.log(`    - Tổng số bản ghi đã duyệt: ${processedCount}`);
    console.log(`    - Tổng số bản ghi đã update: ${updatedCount}`);
    console.log(`    - Thời gian thực thi      : ${duration} giây`);

    console.log('\n[SUCCESS] Script executed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n[ERROR] Migration failed:', error);
    process.exit(1);
  }
};

shiftTime();
