const db = require('../config/db');

// 1. Get all movies
function getMovies(req, res) {
  db.all('SELECT * FROM movies', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch movies' });
    res.json(rows);
  });
}

// 2. Get showtimes for a movie
function getShowtimes(req, res) {
  const movieId = req.params.movieId;
  db.all('SELECT * FROM showtimes WHERE movie_id = ?', [movieId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch showtimes' });
    res.json(rows);
  });
}

// 3. Get seats for a specific showtime (with tier and price)
function getSeats(req, res) {
  const showtimeId = req.params.showtimeId;
  db.all(
    'SELECT id, seat_row, seat_number, seat_label, tier, price, status FROM seats WHERE showtime_id = ? ORDER BY seat_row, seat_number',
    [showtimeId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch seats' });
      res.json(rows);
    }
  );
}

// 4. Get Concessions catalog
function getConcessions(req, res) {
  db.all('SELECT * FROM concessions', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch concessions' });
    res.json(rows);
  });
}

// 5. Atomic Ticket Booking (Double-Booking Prevention!)
function createBooking(req, res) {
  const { showtimeId, customerName, customerEmail, selectedSeats, selectedSnacks } = req.body;

  if (!showtimeId || !customerName || !customerEmail || !selectedSeats || selectedSeats.length === 0) {
    return res.status(400).json({ error: 'Missing required booking details.' });
  }

  const bookingRef = 'CP-' + Math.floor(10000 + Math.random() * 90000);
  const placeholders = selectedSeats.map(() => '?').join(',');

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Step A: Check if ANY requested seat is already BOOKED
    const checkSql = `
      SELECT seat_label, tier, price FROM seats 
      WHERE showtime_id = ? AND seat_label IN (${placeholders}) AND status = 'BOOKED'
    `;

    db.all(checkSql, [showtimeId, ...selectedSeats], (checkErr, takenSeats) => {
      if (checkErr) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Database verification failed.' });
      }

      // If already booked -> ABORT & PREVENT DOUBLE BOOKING
      if (takenSeats.length > 0) {
        db.run('ROLLBACK');
        const takenLabels = takenSeats.map((s) => s.seat_label).join(', ');
        return res.status(409).json({
          error: `Double-booking prevented! Seat(s) [${takenLabels}] were just reserved by another customer. Please choose alternative seats.`
        });
      }

      // Step B: Calculate exact tiered ticket total from DB
      const priceSql = `
        SELECT seat_label, tier, price FROM seats 
        WHERE showtime_id = ? AND seat_label IN (${placeholders})
      `;

      db.all(priceSql, [showtimeId, ...selectedSeats], (priceErr, seatRecords) => {
        if (priceErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to calculate seat pricing.' });
        }

        const seatTotal = (seatRecords || []).reduce((sum, s) => sum + s.price, 0);

        // Step C: Calculate Snacks Total
        let snacksTotal = 0;
        let snacksDesc = 'None';
        if (Array.isArray(selectedSnacks) && selectedSnacks.length > 0) {
          snacksTotal = selectedSnacks.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          snacksDesc = selectedSnacks.map((s) => `${s.name} (x${s.quantity})`).join(', ');
        }

        const grandTotal = (seatTotal + snacksTotal).toFixed(2);
        const seatLabelsStr = selectedSeats.join(', ');

        // Step D: Reserve the seats (status = 'BOOKED')
        const updateSql = `
          UPDATE seats SET status = 'BOOKED' 
          WHERE showtime_id = ? AND seat_label IN (${placeholders})
        `;

        db.run(updateSql, [showtimeId, ...selectedSeats], function (updateErr) {
          if (updateErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to lock seats.' });
          }

          // Step E: Create Booking Record
          const insertBookingSql = `
            INSERT INTO bookings (booking_ref, showtime_id, customer_name, customer_email, seat_labels, snacks_summary, total_amount, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')
          `;

          db.run(
            insertBookingSql,
            [bookingRef, showtimeId, customerName.trim(), customerEmail.trim(), seatLabelsStr, snacksDesc, grandTotal],
            function (bookingErr) {
              if (bookingErr) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to generate booking pass.' });
              }

              db.run('COMMIT');

              return res.status(201).json({
                message: 'Tickets reserved successfully!',
                receipt: {
                  bookingRef,
                  customerName: customerName.trim(),
                  customerEmail: customerEmail.trim(),
                  seatLabels: selectedSeats,
                  seatRecords: seatRecords || [],
                  snacksSummary: snacksDesc,
                  seatTotal: seatTotal.toFixed(2),
                  snacksTotal: snacksTotal.toFixed(2),
                  grandTotal,
                  createdAt: new Date().toISOString()
                }
              });
            }
          );
        });
      });
    });
  });
}

// 6. Cancel a Booking Facility (Releases seats back to AVAILABLE!)
function cancelBooking(req, res) {
  const bookingRef = req.params.bookingRef;

  db.get('SELECT * FROM bookings WHERE booking_ref = ?', [bookingRef], (err, booking) => {
    if (err || !booking) {
      return res.status(404).json({ error: 'Booking record not found.' });
    }

    if (booking.status === 'CANCELLED') {
      return res.status(400).json({ error: 'This booking is already cancelled.' });
    }

    const seatsToFree = booking.seat_labels.split(',').map((s) => s.trim());
    const placeholders = seatsToFree.map(() => '?').join(',');

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Free the seats
      const releaseSql = `
        UPDATE seats SET status = 'AVAILABLE'
        WHERE showtime_id = ? AND seat_label IN (${placeholders})
      `;

      db.run(releaseSql, [booking.showtime_id, ...seatsToFree], (releaseErr) => {
        if (releaseErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Failed to release seats.' });
        }

        // Mark booking as CANCELLED
        db.run('UPDATE bookings SET status = "CANCELLED" WHERE booking_ref = ?', [bookingRef], (updateErr) => {
          if (updateErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Failed to update booking status.' });
          }

          db.run('COMMIT');
          return res.status(200).json({
            message: `Booking #${bookingRef} successfully cancelled. Seats [${booking.seat_labels}] are now released back to AVAILABLE.`,
            bookingRef
          });
        });
      });
    });
  });
}

// 7. Simulate Live Concurrency Collision (For Interview Demo)
function simulateCollision(req, res) {
  const { showtimeId, seatLabel } = req.body;
  if (!showtimeId || !seatLabel) {
    return res.status(400).json({ error: 'showtimeId and seatLabel are required.' });
  }

  // Pre-book the seat in the background to simulate a competing user booking it 5ms earlier
  db.run(
    'UPDATE seats SET status = "BOOKED" WHERE showtime_id = ? AND seat_label = ?',
    [showtimeId, seatLabel],
    function (err) {
      if (err) return res.status(500).json({ error: 'Simulation failed' });
      return res.status(200).json({
        message: `Simulated competing user reserved seat [${seatLabel}]! Now try to book it to verify the 409 conflict guard.`
      });
    }
  );
}

// 8. Get recent bookings
function getRecentBookings(req, res) {
  const query = `
    SELECT b.booking_ref, b.customer_name, b.customer_email, b.seat_labels, b.snacks_summary,
           b.total_amount, b.status, b.created_at,
           m.title as movie_title, s.screen_name, s.show_time
    FROM bookings b
    JOIN showtimes s ON b.showtime_id = s.id
    JOIN movies m ON s.movie_id = m.id
    ORDER BY b.id DESC LIMIT 8
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to load booking history' });
    res.json(rows);
  });
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
