import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [1, 'Username must be at least 1 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [1, 'Password must be at least 1 characters long'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  role: {
    type: String,
    enum: ['candidate', 'recruiter', 'admin'],
    default: 'candidate',
    required: [true, 'User role is required']
  },
  active: {
    type: Boolean,
    default: true
  },
  coinBalance: {
    type: Number,
    default: 0,
    min: [0, 'Coin balance cannot be negative']
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ role: 1 });
/**
 * Hash password before saving
 */
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};


userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

const User = mongoose.model('User', userSchema);

export { User };
export default User;



// {
//   "type": "object",
//   "properties": {
//     "username": {
//       "type": "string"
//     },
//     "password": {
//       "type": "string"
//     },
//     "email": {
//       "type": "string"
//     },
//     "role": {
//       "type": "string",
//       "enum": [
//         "candidate",
//         "recruiter"
//       ]
//     },
//     "active": {
//       "type": "boolean"
//     },
//     "coinBalance": {
//       "type": "number"
//     },
//     "createAt": {
//       "type": "string"
//     },
//     "updateAt": {
//       "type": "string"
//     }
//   },
//   "required": [
//     "username",
//     "password",
//     "email",
//     "role"
//   ]
// }