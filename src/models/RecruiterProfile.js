import mongoose from 'mongoose';

const companyInfoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters']
  },
  about: {
    type: String,
    trim: true,
    maxlength: [2000, 'About cannot exceed 2000 characters']
  },
  logo: {
    type: String,
    trim: true,
    default: 'https://i.pinimg.com/736x/ec/d9/c2/ecd9c2e8ed0dbbc96ac472a965e4afda.jpg'
  },
  industry: {
    type: String,
    trim: true,
    maxlength: [100, 'Industry cannot exceed 100 characters'],
    enum: [
      'Công nghệ thông tin',
      'Tài chính',
      'Y tế',
      'Giáo dục',
      'Sản xuất',
      'Bán lẻ',
      'Xây dựng',
      'Du lịch',
      'Nông nghiệp',
      'Truyền thông',
      'Vận tải',
      'Bất động sản',
      'Dịch vụ',
      'Khởi nghiệp',
      'Nhà hàng - Khách sạn',
      'Bảo hiểm',
      'Logistics',
      'Năng lượng',
      'Viễn thông',
      'Dược phẩm',
      'Hóa chất',
      'Ô tô - Xe máy',
      'Thực phẩm - Đồ uống',
      'Thời trang - Mỹ phẩm',
      'Thể thao - Giải trí',
      'Công nghiệp nặng',
      'Công nghiệp điện tử',
      'Công nghiệp cơ khí',
      'Công nghiệp dệt may',
      "Đa lĩnh vực",
      'Khác'
    ]
  },
  taxCode: {
    type: String,
    trim: true,
    maxlength: [50, 'Tax code cannot exceed 50 characters']
  },
  businessRegistrationUrl: {
    type: String,
    trim: true
  },
  size: {
    type: String,
    trim: true,
    maxlength: [50, 'Company size cannot exceed 50 characters']
  },
  website: {
    type: String,
    trim: true,
    match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'Please enter a valid website URL']
  },
  location: {
    province: {
      type: String,
      trim: true,
      maxlength: [100, 'Province/City cannot exceed 100 characters']
    },
    district: {
      type: String,
      trim: true,
      maxlength: [100, 'District cannot exceed 100 characters']
    },
    commune: {
      type: String,
      trim: true,
      maxlength: [100, 'Commune cannot exceed 100 characters']
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function(coords) {
            return coords && coords.length === 2 &&
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Invalid coordinates format'
        }
      }
    }
  },
  address: { // Địa chỉ chi tiết (số nhà, tên đường)
    type: String,
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  contactInfo: {
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[\+]?[\d]{1,15}$/, 'Please enter a valid phone number']
    }
  },
  verified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectReason: {
    type: String,
    trim: true,
  }
}, { _id: true, timestamps: true });


const recruiterProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  fullname: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  company: companyInfoSchema,
}, {
  timestamps: true
});

// Index for better query performance
recruiterProfileSchema.index({ 'company.name': 'text', 'fullname': 'text' });
recruiterProfileSchema.index({ 'company.industry': 1 });
recruiterProfileSchema.index({ 'company.location.coordinates': '2dsphere' });
const RecruiterProfile = mongoose.model('RecruiterProfile', recruiterProfileSchema);

export default RecruiterProfile;
