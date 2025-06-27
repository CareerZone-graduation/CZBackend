const mongoose = require('mongoose');
const { Schema } = mongoose;

const recruiterReviewSchema = new Schema(
  {
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      required: true,
    },
    recruiterId: {
      type: Schema.Types.ObjectId,
      ref: 'RecruiterProfile',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure a candidate can only review a recruiter once
recruiterReviewSchema.index({ candidateId: 1, recruiterId: 1 }, { unique: true });

const RecruiterReview = mongoose.model('RecruiterReview', recruiterReviewSchema);

module.exports = RecruiterReview;
