import mongoose from 'mongoose';

const searchHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  query: {
    type: String,
    default: '',
    trim: true,
    maxlength: [200, 'Search query cannot exceed 200 characters']
  },
  searchCount: {
    type: Number,
    default: 1,
    min: [1, 'Search count must be at least 1']
  },
  lastSearchedAt: {
    type: Date,
    required: [true, 'Last searched timestamp is required'],
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
searchHistorySchema.index({ userId: 1, lastSearchedAt: -1 }); // Query user history sorted by time
searchHistorySchema.index({ userId: 1, query: 'text' }); // Text search for autocomplete
searchHistorySchema.index({ lastSearchedAt: 1 }); // For expiration worker

// Compound unique index for deduplication (only userId and query)
searchHistorySchema.index(
  { 
    userId: 1, 
    query: 1
  },
  { unique: true, sparse: true }
);

const SearchHistory = mongoose.model('SearchHistory', searchHistorySchema);

export { SearchHistory };
export default SearchHistory;
