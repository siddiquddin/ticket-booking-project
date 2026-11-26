const express = require('express');
const {
  getMovies,
  getShowtimes,
  getSeats,
  getConcessions,
  createBooking,
  cancelBooking,
  simulateCollision,
  getRecentBookings
} = require('../controllers/ticketController');

const router = express.Router();

router.get('/movies', getMovies);
router.get('/movies/:movieId/showtimes', getShowtimes);
router.get('/showtimes/:showtimeId/seats', getSeats);
router.get('/concessions', getConcessions);
router.post('/bookings', createBooking);
router.delete('/bookings/:bookingRef', cancelBooking);
router.post('/bookings/simulate-collision', simulateCollision);
router.get('/bookings/recent', getRecentBookings);

module.exports = router;
