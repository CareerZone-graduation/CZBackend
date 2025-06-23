import mongoose from 'mongoose';


const coinRechargeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required']
  },
  coinAmount: {
    type: Number,
    required: [true, 'Coin amount is required'],
    min: [1, 'Coin amount must be at least 1']
  },
  amountPaid: {
    type: Number,
    required: [true, 'Amount paid is required'],
    min: [0, 'Amount paid cannot be negative']
  },
  paymentMethod: {
    type: String,
    enum: {
      values: ['VNPAY', 'MOMO', 'BANK_CARD', 'PAYPAL'],
      message: '{VALUE} is not a valid payment method'
    },
    required: [true, 'Payment method is required']
  },
  transactionCode: {
    type: String,
    required: [true, 'Transaction code is required'],
    unique: true,
    trim: true
  },
  status: {
    type: String,
    enum: {
      values: ['PENDING', 'SUCCESS', 'FAILED'],
      message: '{VALUE} is not a valid transaction status'
    },
    default: 'PENDING'
  }
}, {
  timestamps: true
});


// Create indexes for better query performance
coinRechargeSchema.index({ userId: 1, createdAt: -1 });
coinRechargeSchema.index({ transactionCode: 1 }, { unique: true });
coinRechargeSchema.index({ status: 1 });
coinRechargeSchema.index({ paymentMethod: 1 });

export default mongoose.model('CoinRecharge', coinRechargeSchema);
