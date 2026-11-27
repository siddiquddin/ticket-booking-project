const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    genre: { type: String, required: true },
    duration: { type: String, required: true },
    rating: { type: Number, required: true },
    posterUrl: { type: String, required: true },
    backdropUrl: { type: String, required: true },
    description: { type: String, required: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

module.exports = mongoose.model('Movie', movieSchema);
