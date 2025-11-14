import mongoose from 'mongoose';
// !! QUAN TRỌNG: Hãy đảm bảo đường dẫn đến model của bạn là chính xác
import  CandidateProfile from '../src/models/CandidateProfile.js';
import Job from '../src/models/Job.js';

/**
 * Script này sẽ tìm tất cả các document trong collection RecruiterProfile
 * nơi mà trường `userId` đang là kiểu `string` và chuyển đổi nó thành `ObjectId`.
 * * Nó sử dụng `updateOne` để tránh kích hoạt validation trên toàn bộ document,
 * giúp ngăn chặn các lỗi không liên quan và đảm bảo việc cập nhật thành công.
 */
async function fixUserIdType() {
  try {
    // Kết nối đến MongoDB
    await mongoose.connect('mongodb://localhost:27017/careerzone');
    console.log('✅ Đã kết nối thành công đến MongoDB.');

    console.log('\n🔍 Bắt đầu tìm kiếm các profile có userId là kiểu string...');

    // Sử dụng .lean() để tăng hiệu năng, vì chúng ta không cần toàn bộ Mongoose document object
    const profilesToUpdate = await Job.find({ 
      recruiterProfileId: { $type: "string" } 
    }).lean();

    if (profilesToUpdate.length === 0) {
      console.log('🎉 Không tìm thấy profile nào cần sửa. Dữ liệu của bạn đã chuẩn!');
      return;
    }

    console.log(`ℹ️ Tìm thấy ${profilesToUpdate.length} profile cần được cập nhật.`);

    let successCount = 0;
    let errorCount = 0;

    // Lặp qua từng profile để xử lý
    for (const profile of profilesToUpdate) {
      // Kiểm tra xem chuỗi userId có phải là một ObjectId hợp lệ hay không
      if (mongoose.Types.ObjectId.isValid(profile.recruiterProfileId)) {
        try {
          // Sử dụng updateOne để chỉ cập nhật trường userId
          // Thao tác này sẽ không chạy validation của toàn bộ schema
          await Job.updateOne(
            { _id: profile._id }, 
            { $set: { recruiterProfileId: new mongoose.Types.ObjectId(profile.recruiterProfileId) } }
          );
          console.log(`✔️ Đã chuyển đổi thành công cho profile: ${profile._id}`);
          successCount++;
        } catch (e) {
          console.error(`❌ Lỗi khi cập nhật profile ${profile._id}:`, e);
          errorCount++;
        }
      } else {
        // Cảnh báo nếu chuỗi không thể chuyển đổi được
        console.warn(`⚠️ CẢNH BÁO: recruiterProfileId "${profile.recruiterProfileId}" của profile ${profile._id} không phải là một ObjectId hợp lệ. Bỏ qua.`);
        errorCount++;
      }
    }

    // In ra kết quả cuối cùng
    console.log('\n----- KẾT QUẢ -----');
    console.log(`👍 Thành công: ${successCount}`);
    console.log(`👎 Thất bại/Bỏ qua: ${errorCount}`);
    console.log('--------------------');

  } catch (error) {
    console.error('💥 Đã xảy ra lỗi nghiêm trọng trong quá trình chạy script:', error);
  } finally {
    // Đảm bảo luôn ngắt kết nối
    await mongoose.disconnect();
    console.log('\n🔌 Đã ngắt kết nối khỏi MongoDB. Script đã hoàn tất.');
  }
}

// Chạy hàm chính
fixUserIdType();
