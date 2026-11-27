const Movie = require('../models/Movie');
const Showtime = require('../models/Showtime');
const Seat = require('../models/Seat');
const Booking = require('../models/Booking');
const Concession = require('../models/Concession');

// 1. Get all movies
async function getMovies(req, res) {
  try {
    const movies = await Movie.find().lean();
    const formatted = movies.map((m) => ({
      id: m._id.toString(),
      _id: m._id,
      title: m.title,
      genre: m.genre,
      duration: m.duration,
      rating: m.rating,
      poster_url: m.posterUrl,
      backdrop_url: m.backdropUrl,
      description: m.description
    }));
    res.json(formatted);
  } catch (err) {
    console.error('getMovies error:', err.message);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
}

// 2. Get showtimes for a movie
async function getShowtimes(req, res) {
  try {
    const { movieId } = req.params;
    const showtimes = await Showtime.find({ movie: movieId }).lean();
    const formatted = showtimes.map((s) => ({
      id: s._id.toString(),
      _id: s._id,
      movie_id: s.movie.toString(),
      screen_name: s.screenName,
      show_time: s.showTime,
      ticket_price: s.ticketPrice
    }));
    res.json(formatted);
  } catch (err) {
    console.error('getShowtimes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch showtimes' });
  }
}

// 3. Get seats for a specific showtime (with tier and price)
async function getSeats(req, res) {
  try {
    const { showtimeId } = req.params;
    const seats = await Seat.find({ showtime: showtimeId })
      .sort({ seatRow: 1, seatNumber: 1 })
      .lean();

    const formatted = seats.map((s) => ({
      id: s._id.toString(),
      _id: s._id,
      showtime_id: s.showtime.toString(),
      seat_row: s.seatRow,
      seat_number: s.seatNumber,
      seat_label: s.seatLabel,
      tier: s.tier,
      price: s.price,
      status: s.status
    }));
    res.json(formatted);
  } catch (err) {
    console.error('getSeats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch seats' });
  }
}

// 4. Get Concessions catalog
async function getConcessions(req, res) {
  try {
    const items = await Concession.find().lean();
    const formatted = items.map((c) => ({
      id: c._id.toString(),
      _id: c._id,
      name: c.name,
      category: c.category,
      price: c.price,
      icon: c.icon,
      description: c.description
    }));
    res.json(formatted);
  } catch (err) {
    console.error('getConcessions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch concessions' });
  }
}

// 5. Atomic Ticket Booking (Double-Booking Prevention with MongoDB!)
async function createBooking(req, res) {
  const { showtimeId, customerName, customerEmail, selectedSeats, selectedSnacks } = req.body;

  if (!showtimeId || !customerName || !customerEmail || !selectedSeats || selectedSeats.length === 0) {
    return res.status(400).json({ error: 'Missing required booking details.' });
  }

  const bookingRef = 'CP-' + Math.floor(10000 + Math.random() * 90000);

  try {
    // Step A: Check if ANY requested seat is already BOOKED
    const takenSeats = await Seat.find({
      showtime: showtimeId,
      seatLabel: { $in: selectedSeats },
      status: 'BOOKED'
    }).lean();

    if (takenSeats.length > 0) {
      const takenLabels = takenSeats.map((s) => s.seatLabel).join(', ');
      return res.status(409).json({
        error: `Double-booking prevented! Seat(s) [${takenLabels}] were just reserved by another customer. Please choose alternative seats.`
      });
    }

    // Step B: Atomic conditional lock - only lock seats that are currently AVAILABLE
    const lockResult = await Seat.updateMany(
      {
        showtime: showtimeId,
        seatLabel: { $in: selectedSeats },
        status: 'AVAILABLE'
      },
      { $set: { status: 'BOOKED' } }
    );

    // If not all requested seats were locked, rollback and abort!
    if (lockResult.modifiedCount !== selectedSeats.length) {
      await Seat.updateMany(
        {
          showtime: showtimeId,
          seatLabel: { $in: selectedSeats },
          status: 'BOOKED'
        },
        { $set: { status: 'AVAILABLE' } }
      );
      return res.status(409).json({
        error: `Double-booking race detected! Another transaction locked one or more of your requested seats. Please select new seats.`
      });
    }

    // Step C: Calculate exact seat pricing from DB
    const seatRecords = await Seat.find({
      showtime: showtimeId,
      seatLabel: { $in: selectedSeats }
    }).lean();

    const seatTotal = seatRecords.reduce((sum, s) => sum + s.price, 0);

    // Step D: Calculate Snacks Total
    let snacksTotal = 0;
    let snacksDesc = 'None';
    if (Array.isArray(selectedSnacks) && selectedSnacks.length > 0) {
      snacksTotal = selectedSnacks.reduce((sum, item) => sum + item.price * item.quantity, 0);
      snacksDesc = selectedSnacks.map((s) => `${s.name} (x${s.quantity})`).join(', ');
    }

    const grandTotal = (seatTotal + snacksTotal).toFixed(2);

    // Step E: Create Booking Record in MongoDB
    const booking = await Booking.create({
      bookingRef,
      showtime: showtimeId,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      seatLabels: selectedSeats,
      snacksSummary: snacksDesc,
      totalAmount: parseFloat(grandTotal),
      status: 'CONFIRMED'
    });

    return res.status(201).json({
      message: 'Tickets reserved successfully!',
      receipt: {
        bookingRef,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        seatLabels: selectedSeats,
        seatRecords: seatRecords.map((s) => ({
          seat_label: s.seatLabel,
          tier: s.tier,
          price: s.price
        })),
        snacksSummary: snacksDesc,
        seatTotal: seatTotal.toFixed(2),
        snacksTotal: snacksTotal.toFixed(2),
        grandTotal,
        createdAt: booking.createdAt.toISOString()
      }
    });
  } catch (err) {
    console.error('createBooking error:', err.message);
    return res.status(500).json({ error: 'Failed to complete booking reservation.' });
  }
}

// 6. Cancel a Booking Facility (Releases seats back to AVAILABLE!)
async function cancelBooking(req, res) {
  const { bookingRef } = req.params;

  try {
    const booking = await Booking.findOne({ bookingRef });
    if (!booking) {
      return res.status(404).json({ error: 'Booking record not found.' });
    }

    if (booking.status === 'CANCELLED') {
      return res.status(400).json({ error: 'This booking is already cancelled.' });
    }

    // Free the seats
    await Seat.updateMany(
      {
        showtime: booking.showtime,
        seatLabel: { $in: booking.seatLabels }
      },
      { $set: { status: 'AVAILABLE' } }
    );

    // Mark booking as CANCELLED
    booking.status = 'CANCELLED';
    await booking.save();

    return res.status(200).json({
      message: `Booking #${bookingRef} successfully cancelled. Seats [${booking.seatLabels.join(', ')}] are now released back to AVAILABLE.`,
      bookingRef
    });
  } catch (err) {
    console.error('cancelBooking error:', err.message);
    return res.status(500).json({ error: 'Failed to cancel booking' });
  }
}

// 7. Simulate Live Concurrency Collision (For Interview Demo)
async function simulateCollision(req, res) {
  const { showtimeId, seatLabel } = req.body;
  if (!showtimeId || !seatLabel) {
    return res.status(400).json({ error: 'showtimeId and seatLabel are required.' });
  }

  try {
    // Pre-book the seat in the background to simulate a competing user booking it 5ms earlier
    await Seat.updateOne(
      { showtime: showtimeId, seatLabel },
      { $set: { status: 'BOOKED' } }
    );

    return res.status(200).json({
      message: `Simulated competing user reserved seat [${seatLabel}]! Now try to book it to verify the 409 conflict guard.`
    });
  } catch (err) {
    console.error('simulateCollision error:', err.message);
    return res.status(500).json({ error: 'Simulation failed' });
  }
}

// 8. Get recent bookings
async function getRecentBookings(req, res) {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate({
        path: 'showtime',
        populate: { path: 'movie' }
      })
      .lean();

    const formatted = bookings.map((b) => ({
      id: b._id.toString(),
      _id: b._id,
      booking_ref: b.bookingRef,
      customer_name: b.customerName,
      customer_email: b.customerEmail,
      seat_labels: Array.isArray(b.seatLabels) ? b.seatLabels.join(', ') : b.seatLabels,
      snacks_summary: b.snacksSummary,
      total_amount: b.totalAmount,
      status: b.status,
      created_at: b.createdAt,
      movie_title: b.showtime?.movie?.title || 'Featured Film',
      screen_name: b.showtime?.screenName || 'Screen 1',
      show_time: b.showtime?.showTime || '07:00 PM'
    }));

    res.json(formatted);
  } catch (err) {
    console.error('getRecentBookings error:', err.message);
    res.status(500).json({ error: 'Failed to load booking history' });
  }
}

module.exports = {
  getMovies,
  getShowtimes,
  getSeats,
  getConcessions,
  createBooking,
  cancelBooking,
  simulateCollision,
  getRecentBookings
};
