const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema(
  {
    showtime: { type: mongoose.Schema.Types.ObjectId, ref: 'Showtime', required: true, index: true },
    seatRow: { type: String, required: true },
    seatNumber: { type: Number, required: true },
    seatLabel: { type: String, required: true },
    tier: { type: String, enum: ['STANDARD', 'PREMIUM', 'VIP'], default: 'STANDARD' },
    price: { type: Number, required: true },
    status: { type: String, enum: ['AVAILABLE', 'BOOKED'], default: 'AVAILABLE' }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound index to ensure uniqueness per showtime
seatSchema.index({ showtime: 1, seatLabel: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
