import mongoose from 'mongoose';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES, ALL_TRANSACTION_TYPES, ALL_TRANSACTION_CATEGORIES } from '../constants/index.js';

const creditTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  type: {
    type: String,
    enum: {
      values: ALL_TRANSACTION_TYPES,
      message: '{VALUE} is not a valid transaction type'
    },
    required: [true, 'Transaction type is required']
  },
  category: {
    type: String,
    enum: {
      values: ALL_TRANSACTION_CATEGORIES,
      message: '{VALUE} is not a valid transaction category'
    },
    required: [true, 'Transaction category is required']
  },
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    validate: {
      validator: function(value) {
        // Deposits should be positive, usage should be negative
        if (this.type === TRANSACTION_TYPES.DEPOSIT) {
          return value > 0;
        } else if (this.type === TRANSACTION_TYPES.USAGE) {
          return value < 0;
        }
        return true;
      },
      message: 'Amount sign must match transaction type (positive for deposits, negative for usage)'
    }
  },
  balanceAfter: {
    type: Number,
    required: [true, 'Balance after transaction is required'],
    min: [0, 'Balance cannot be negative']
  },
  description: {
    type: String,
    required: [true, 'Transaction description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  referenceModel: {
    type: String,
    default: null,
    enum: {
      values: [null, 'CoinRecharge', 'Job', 'CV', 'Application', 'RecruiterProfile'],
      message: '{VALUE} is not a valid reference model'
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes for query optimization
// Primary query pattern: get user's transactions sorted by date
creditTransactionSchema.index({ userId: 1, createdAt: -1 });

// Filter by type and date
creditTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Filter by category and date
creditTransactionSchema.index({ userId: 1, category: 1, createdAt: -1 });

// Lookup by reference
creditTransactionSchema.index({ referenceId: 1, referenceModel: 1 });

// Virtual for formatted amount display
creditTransactionSchema.virtual('formattedAmount').get(function() {
  return this.amount > 0 ? `+${this.amount}` : `${this.amount}`;
});

// Ensure virtuals are included in JSON output
creditTransactionSchema.set('toJSON', { virtuals: true });
creditTransactionSchema.set('toObject', { virtuals: true });

export default mongoose.model('CreditTransaction', creditTransactionSchema);
