const mongoose = require('mongoose');

const showtimeSchema = new mongoose.Schema(
  {
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    screenName: { type: String, required: true },
    showTime: { type: String, required: true },
    ticketPrice: { type: Number, required: true }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

module.exports = mongoose.model('Showtime', showtimeSchema);
