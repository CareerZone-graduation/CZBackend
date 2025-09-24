// tạo script để xóa field "fieldToDelete" trong tất cả các document của collection "yourCollection"
// sử dụng mongoose để kết nối và thực hiện thao tác xóa field
import mongoose from 'mongoose';
import Job from '../src/models/Job.js'; // thay YourModel bằng model của bạn
import dotenv from 'dotenv';
dotenv.config();

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/careerzone2'; // thay yourDatabase bằng tên database của bạn

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Kết nối đến MongoDB thành công');
    try {
      const result = await Job.updateMany(
        {},
        { $unset: { chunks: "" } } // thay fieldToDelete bằng tên field bạn muốn xóa
        );
        console.log(`Đã xóa field trong ${result.nModified} document`);
    } catch (error) {
      console.error('Lỗi khi xóa field:', error);
    }
    mongoose.disconnect();
    })
    .catch(err => {
        console.error('Kết nối đến MongoDB thất bại:', err);
    });
// Chạy script bằng lệnh: node scripts/DELETEfield.js
// Đảm bảo rằng bạn đã cài đặt mongoose và có file .env với biến MONGO_URI nếu cần thiết
// Lưu ý: Hãy chắc chắn rằng bạn đã sao lưu dữ liệu trước khi chạy script này để tránh mất mát dữ liệu không mong muốn.
// Ngoài ra, hãy thay thế 'YourModel' và 'fieldToDelete' bằng tên model và field thực tế của bạn.