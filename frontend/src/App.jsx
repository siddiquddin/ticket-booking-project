import React, { useState, useEffect } from 'react';

export default function App() {
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showtimes, setShowtimes] = useState([]);
  const [selectedShowtime, setSelectedShowtime] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [selectedSnacks, setSelectedSnacks] = useState({}); // { snackId: quantity }
  const [recentBookings, setRecentBookings] = useState([]);
  const [bookingReceipt, setBookingReceipt] = useState(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [genreFilter, setGenreFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorAlert, setErrorAlert] = useState('');
  const [successAlert, setSuccessAlert] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial Load
  useEffect(() => {
    fetch('/api/movies')
      .then((res) => res.json())
      .then((data) => {
        setMovies(data);
        if (data.length > 0) handleSelectMovie(data[0]);
      });

    fetch('/api/concessions')
      .then((res) => res.json())
      .then(setConcessions);

    loadRecentBookings();
  }, []);

  const loadRecentBookings = () => {
    fetch('/api/bookings/recent')
      .then((res) => res.json())
      .then(setRecentBookings);
  };

  // Movie Selection
  const handleSelectMovie = (movie) => {
    setSelectedMovie(movie);
    setSelectedSeats([]);
    setBookingReceipt(null);
    setErrorAlert('');

    fetch(`/api/movies/${movie.id}/showtimes`)
      .then((res) => res.json())
      .then((data) => {
        setShowtimes(data);
        if (data.length > 0) handleSelectShowtime(data[0]);
      });
  };

  // Showtime Selection
  const handleSelectShowtime = (showtime) => {
    setSelectedShowtime(showtime);
    setSelectedSeats([]);
    setBookingReceipt(null);
    setErrorAlert('');

    fetch(`/api/showtimes/${showtime.id}/seats`)
      .then((res) => res.json())
      .then(setSeats);
  };

  // Seat Click Handler
  const handleSeatClick = (seat) => {
    if (seat.status === 'BOOKED') return;

    if (selectedSeats.some((s) => s.seat_label === seat.seat_label)) {
      setSelectedSeats(selectedSeats.filter((s) => s.seat_label !== seat.seat_label));
    } else {
      setSelectedSeats([...selectedSeats, seat]);
    }
  };

  // Snack quantity steppers
  const updateSnackQty = (snackId, delta) => {
    const current = selectedSnacks[snackId] || 0;
    const updated = Math.max(0, current + delta);
    setSelectedSnacks({ ...selectedSnacks, [snackId]: updated });
  };

  // Calculate pricing breakdown
  const calculateSeatTotal = () => {
    return selectedSeats.reduce((sum, s) => sum + s.price, 0);
  };

  const calculateSnacksTotal = () => {
    return concessions.reduce((sum, item) => {
      const qty = selectedSnacks[item.id] || 0;
      return sum + (item.price * qty);
    }, 0);
  };

  const grandTotal = (calculateSeatTotal() + calculateSnacksTotal()).toFixed(2);

  // Submit Booking
  const handleBookTickets = async (e) => {
    e.preventDefault();
    if (selectedSeats.length === 0) {
      setErrorAlert('Please select at least one seat from the cinema hall.');
      return;
    }

    setIsSubmitting(true);
    setErrorAlert('');

    // Prepare snacks payload
    const snackList = concessions
      .filter((c) => (selectedSnacks[c.id] || 0) > 0)
      .map((c) => ({ id: c.id, name: c.name, price: c.price, quantity: selectedSnacks[c.id] }));

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showtimeId: selectedShowtime.id,
          customerName,
          customerEmail,
          selectedSeats: selectedSeats.map((s) => s.seat_label),
          selectedSnacks: snackList
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Booking reservation failed');
      }

      setBookingReceipt(data.receipt);
      setSelectedSeats([]);
      setSelectedSnacks({});
      setSuccessAlert(`Booking #${data.receipt.bookingRef} confirmed successfully!`);
      handleSelectShowtime(selectedShowtime);
      loadRecentBookings();
    } catch (err) {
      setErrorAlert(err.message);
      // Re-sync seat grid if someone else took the seat
      handleSelectShowtime(selectedShowtime);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1-Click Cancel Booking & Seat Release Facility
  const handleCancelBooking = async (bookingRef) => {
    if (!window.confirm(`Are you sure you want to cancel booking #${bookingRef}? Seats will be released immediately.`)) return;

    try {
      const res = await fetch(`/api/bookings/${bookingRef}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel booking');
      setSuccessAlert(data.message);
      if (bookingReceipt && bookingReceipt.bookingRef === bookingRef) {
        setBookingReceipt(null);
      }
      handleSelectShowtime(selectedShowtime);
      loadRecentBookings();
    } catch (err) {
      setErrorAlert(err.message);
    }
  };

  // Double-Booking Race Condition Simulation (For Interview Demo)
  const handleSimulateConflict = async () => {
    if (selectedSeats.length === 0) {
      setErrorAlert('Select a seat first to test the double-booking collision guard!');
      return;
    }

    const testSeat = selectedSeats[0].seat_label;
    try {
      // Background process snatches the seat
      const res = await fetch('/api/bookings/simulate-collision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showtimeId: selectedShowtime.id, seatLabel: testSeat })
      });
      const data = await res.json();

      // Now automatically attempt to book it to demonstrate the 409 guard!
      setErrorAlert(`[SIMULATION]: Competing client took seat ${testSeat}! Submitting your booking now...`);
      setTimeout(() => {
        handleBookTickets({ preventDefault: () => {} });
      }, 600);
    } catch (err) {
      setErrorAlert(err.message);
    }
  };

  return (
    <div className="min-vh-100 d-flex flex-column">
      {/* Top Navbar */}
      <header className="navbar navbar-dark bg-black border-bottom border-secondary border-opacity-25 px-3 px-md-4 py-2 sticky-top">
        <div className="container-fluid d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <div className="bg-danger text-white p-2 rounded-3 d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
              <i className="bi bi-film fs-5"></i>
            </div>
            <div>
              <span className="fw-bold fs-5 text-white tracking-wide d-block leading-none">CinePass Premier</span>
              <span className="text-secondary small" style={{ fontSize: '0.7rem' }}>Boutique Cinema &amp; Event Booking</span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-3">
            <span className="badge bg-success-subtle text-success border border-success-subtle small px-2 py-1 d-none d-md-inline">
              <i className="bi bi-shield-lock-fill me-1"></i> Atomic MongoDB Atlas Guard Active
            </span>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                const el = document.getElementById('recent-bookings-section');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <i className="bi bi-ticket-detailed me-1"></i> My Bookings ({recentBookings.length})
            </button>
          </div>
        </div>
      </header>

      {/* Global Alerts */}
      <div className="container-fluid px-lg-5 mt-3">
        {errorAlert && (
          <div className="alert alert-danger d-flex align-items-center justify-content-between shadow-sm py-2 px-3 small" role="alert">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-triangle-fill fs-5"></i>
              <span className="fw-semibold">{errorAlert}</span>
            </div>
            <button type="button" className="btn-close btn-close-white" onClick={() => setErrorAlert('')}></button>
          </div>
        )}
        {successAlert && (
          <div className="alert alert-success d-flex align-items-center justify-content-between shadow-sm py-2 px-3 small" role="alert">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-check-circle-fill fs-5"></i>
              <span className="fw-semibold">{successAlert}</span>
            </div>
            <button type="button" className="btn-close" onClick={() => setSuccessAlert('')}></button>
          </div>
        )}
      </div>

      {/* Main Body */}
      <main className="container-fluid py-4 px-lg-5 flex-grow-1">
        {/* STEP 1: MOVIE SHOWCASE & GENRE FILTERS */}
        <section className="mb-5">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <h5 className="fw-bold text-white mb-0 text-uppercase tracking-wider small">
                <i className="bi bi-camera-reels me-2 text-danger"></i>1. Now Showing
              </h5>
            </div>

            <div className="d-flex gap-2 flex-wrap">
              <div className="btn-group btn-group-sm">
                {['ALL', 'Sci-Fi', 'Action', 'Drama'].map((genre) => (
                  <button
                    key={genre}
                    className={`btn ${genreFilter === genre ? 'btn-danger' : 'btn-outline-secondary'}`}
                    onClick={() => setGenreFilter(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Search movies..."
                className="form-control form-control-sm bg-black text-white border-secondary"
                style={{ width: 170 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="row g-3">
            {movies
              .filter((m) => {
                const matchGenre = genreFilter === 'ALL' || m.genre.includes(genreFilter);
                const matchSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase());
                return matchGenre && matchSearch;
              })
              .map((m) => {
                const isSelected = selectedMovie?.id === m.id;
                return (
                  <div key={m.id} className="col-12 col-md-4">
                    <div
                      className={`cinema-panel p-3 h-100 movie-card-poster ${isSelected ? 'border-danger shadow-lg' : ''}`}
                      onClick={() => handleSelectMovie(m)}
                    >
                      <div className="d-flex gap-3">
                        <img
                          src={m.poster_url}
                          alt={m.title}
                          className="rounded-3"
                          style={{ width: 90, height: 125, objectFit: 'cover' }}
                        />
                        <div className="d-flex flex-column justify-content-between flex-grow-1">
                          <div>
                            <div className="d-flex justify-content-between align-items-center">
                              <span className="badge bg-secondary mb-1" style={{ fontSize: '0.68rem' }}>{m.genre}</span>
                              <span className="small text-warning fw-bold">⭐ {m.rating}</span>
                            </div>
                            <h6 className="fw-bold text-white mb-1">{m.title}</h6>
                            <p className="text-secondary small mb-1" style={{ fontSize: '0.74rem' }}>{m.duration}</p>
                          </div>
                          <div className="small fw-semibold text-end">
                            {isSelected ? (
                              <span className="text-danger"><i className="bi bi-check-circle-fill me-1"></i>Selected</span>
                            ) : (
                              <span className="text-secondary">Click to choose</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        {/* STEP 2: SHOWTIME SELECTOR */}
        {selectedMovie && (
          <section className="mb-4">
            <h5 className="fw-bold text-white mb-3 text-uppercase tracking-wider small">
              <i className="bi bi-clock-history me-2 text-danger"></i>2. Available Showtimes for {selectedMovie.title}
            </h5>
            <div className="d-flex gap-2 flex-wrap">
              {showtimes.map((st) => (
                <button
                  key={st.id}
                  className={`btn p-3 text-start ${selectedShowtime?.id === st.id ? 'btn-danger' : 'btn-outline-secondary'}`}
                  onClick={() => handleSelectShowtime(st)}
                  style={{ minWidth: 160 }}
                >
                  <div className="fw-bold fs-6">{st.show_time}</div>
                  <div className="small opacity-75">{st.screen_name}</div>
                  <div className="small fw-semibold mt-1">From ${st.ticket_price.toFixed(2)}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* CONFIRMED DIGITAL BOARDING PASS (If booked) */}
        {bookingReceipt && (
          <div className="boarding-pass-ticket p-4 p-md-5 mb-5 mx-auto" style={{ maxWidth: 840 }}>
            <div className="d-flex justify-content-between align-items-start border-bottom border-secondary pb-3 mb-3 flex-wrap gap-2">
              <div>
                <span className="badge bg-success mb-2 px-3 py-1 fw-bold">OFFICIAL BOARDING PASS</span>
                <h3 className="fw-bold text-white mb-0">Booking Ref: #{bookingReceipt.bookingRef}</h3>
                <span className="text-secondary small">Present this digital ticket or barcode at entry gate</span>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-light btn-sm" onClick={() => window.print()}>
                  <i className="bi bi-printer me-1"></i> Print Pass
                </button>
                <button className="btn btn-outline-danger btn-sm" onClick={() => handleCancelBooking(bookingReceipt.bookingRef)}>
                  Cancel Booking
                </button>
              </div>
            </div>

            <div className="row g-4 align-items-center">
              <div className="col-12 col-md-4">
                <span className="text-secondary small text-uppercase">Movie &amp; Screen</span>
                <h5 className="fw-bold text-white mt-1 mb-0">{selectedMovie?.title}</h5>
                <span className="text-info small">{selectedShowtime?.screen_name} &bull; {selectedShowtime?.show_time}</span>
              </div>

              <div className="col-6 col-md-3">
                <span className="text-secondary small text-uppercase">Seats Reserved</span>
                <div className="mt-1 d-flex flex-wrap gap-1">
                  {bookingReceipt.seatLabels.map((lbl) => (
                    <span key={lbl} className="badge bg-primary px-2 py-1">{lbl}</span>
                  ))}
                </div>
              </div>

              <div className="col-6 col-md-3">
                <span className="text-secondary small text-uppercase">Concessions</span>
                <div className="small text-white fw-semibold mt-1">{bookingReceipt.snacksSummary}</div>
              </div>

              <div className="col-12 col-md-2 text-md-end">
                <span className="text-secondary small text-uppercase">Total Paid</span>
                <div className="fs-3 fw-bold text-success tabular-nums">${bookingReceipt.grandTotal}</div>
              </div>
            </div>

            <div className="ticket-perforated-divider"></div>

            <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
              <div className="ticket-barcode-lines flex-grow-1" style={{ maxWidth: 380 }}></div>
              <div className="text-secondary small text-md-end">
                Customer: <strong className="text-white">{bookingReceipt.customerName}</strong> ({bookingReceipt.customerEmail})
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 & 4: TIERED SEAT GRID & CONCESSIONS CHECKOUT */}
        <div className="row g-4">
          {/* Cinema Hall Layout */}
          <div className="col-12 col-lg-8">
            <div className="cinema-panel p-4 text-center">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold text-white mb-0 text-uppercase tracking-wider small">
                  <i className="bi bi-grid-3x3-gap-fill text-danger me-2"></i>3. Choose Seats
                </h5>
                <span className="text-secondary small">
                  Selected: <strong className="text-white tabular-nums">{selectedSeats.length} Seats</strong>
                </span>
              </div>

              {/* Glowing Curved Cinema Screen */}
              <div className="curved-cinema-screen"></div>
              <div className="text-secondary small mb-4 tracking-widest" style={{ fontSize: '0.68rem' }}>
                CINEMA SCREEN THIS WAY
              </div>

              {/* Tier Legend */}
              <div className="d-flex justify-content-center gap-4 mb-4 small flex-wrap">
                <div className="d-flex align-items-center gap-2">
                  <div className="seat-item seat-standard" style={{ width: 20, height: 20 }}></div>
                  <span className="text-secondary">Standard ($14)</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="seat-item seat-premium" style={{ width: 20, height: 20 }}></div>
                  <span className="text-secondary">Premium ($17)</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="seat-item seat-vip" style={{ width: 20, height: 20 }}></div>
                  <span className="text-secondary">VIP Recliner ($22)</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="seat-item seat-selected" style={{ width: 20, height: 20 }}></div>
                  <span className="text-success fw-bold">Selected</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className="seat-item seat-booked" style={{ width: 20, height: 20 }}></div>
                  <span className="text-secondary opacity-50">Taken</span>
                </div>
              </div>

              {/* Matrix of Seats */}
              <div className="d-flex flex-column align-items-center gap-2 mb-4">
                {['A', 'B', 'C', 'D', 'E'].map((rowLetter) => {
                  let rowTierLabel = 'Standard';
                  if (rowLetter === 'C' || rowLetter === 'D') rowTierLabel = 'Premium';
                  if (rowLetter === 'E') rowTierLabel = 'VIP';

                  return (
                    <div key={rowLetter} className="d-flex align-items-center gap-2">
                      <span className="text-secondary fw-bold small" style={{ width: 22 }}>
                        {rowLetter}
                      </span>

                      <div className="d-flex gap-2">
                        {seats
                          .filter((s) => s.seat_row === rowLetter)
                          .map((seat) => {
                            const isSelected = selectedSeats.some((s) => s.seat_label === seat.seat_label);
                            const isBooked = seat.status === 'BOOKED';

                            let tierClass = 'seat-standard';
                            if (seat.tier === 'PREMIUM') tierClass = 'seat-premium';
                            if (seat.tier === 'VIP') tierClass = 'seat-vip';

                            let finalClass = tierClass;
                            if (isBooked) finalClass = 'seat-booked';
                            else if (isSelected) finalClass = 'seat-selected';

                            return (
                              <div
                                key={seat.id}
                                className={`seat-item ${finalClass}`}
                                onClick={() => handleSeatClick(seat)}
                                title={`Seat ${seat.seat_label} • ${seat.tier} ($${seat.price.toFixed(2)})`}
                              >
                                {seat.seat_number}
                              </div>
                            );
                          })}
                      </div>

                      <span className="text-secondary small text-uppercase ms-2 opacity-50" style={{ fontSize: '0.65rem', width: 60, textAlign: 'left' }}>
                        {rowTierLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Snacks & Concessions Facility */}
              <div className="border-top border-secondary border-opacity-25 pt-4 text-start">
                <h6 className="fw-bold text-white mb-3 text-uppercase tracking-wider small">
                  <i className="bi bi-cup-straw text-warning me-2"></i>Cinema Snacks &amp; Combos (Optional)
                </h6>
                <div className="row g-2">
                  {concessions.map((item) => {
                    const qty = selectedSnacks[item.id] || 0;
                    return (
                      <div key={item.id} className="col-12 col-md-6">
                        <div className="snack-card d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fs-3">{item.icon}</span>
                            <div>
                              <div className="fw-semibold text-white small">{item.name}</div>
                              <span className="text-success small fw-bold">${item.price.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary px-2 py-0"
                              onClick={() => updateSnackQty(item.id, -1)}
                            >
                              -
                            </button>
                            <span className="small fw-bold text-white tabular-nums px-1">{qty}</span>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary px-2 py-0"
                              onClick={() => updateSnackQty(item.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Checkout & Concurrency Simulator Panel */}
          <div className="col-12 col-lg-4">
            <div className="cinema-panel p-4 h-100 d-flex flex-column justify-content-between">
              <div>
                <h5 className="fw-bold text-white mb-3 border-bottom border-secondary border-opacity-25 pb-2">
                  Booking Summary
                </h5>

                <div className="mb-3">
                  <span className="text-secondary small">Movie</span>
                  <div className="fw-semibold text-white">{selectedMovie?.title}</div>
                  <span className="text-secondary small">{selectedShowtime?.screen_name} &bull; {selectedShowtime?.show_time}</span>
                </div>

                <div className="mb-3">
                  <span className="text-secondary small">Seats ({selectedSeats.length})</span>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {selectedSeats.length === 0 ? (
                      <span className="text-secondary small fst-italic">No seats chosen yet</span>
                    ) : (
                      selectedSeats.map((s) => (
                        <span key={s.seat_label} className="badge bg-primary px-2 py-1">
                          {s.seat_label} (${s.price})
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {calculateSnacksTotal() > 0 && (
                  <div className="mb-3">
                    <span className="text-secondary small">Snacks Subtotal</span>
                    <div className="text-success small fw-semibold">+${calculateSnacksTotal().toFixed(2)}</div>
                  </div>
                )}

                <div className="d-flex justify-content-between align-items-baseline mb-4 border-top border-secondary border-opacity-25 pt-3">
                  <span className="fs-5 text-white">Grand Total:</span>
                  <span className="fs-3 fw-bold text-success tabular-nums">${grandTotal}</span>
                </div>

                <form onSubmit={handleBookTickets}>
                  <div className="mb-3">
                    <label className="form-label small text-secondary">Customer Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jordan Smith"
                      className="form-control bg-dark text-white border-secondary"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="form-label small text-secondary">Email for E-Ticket</label>
                    <input
                      type="email"
                      required
                      placeholder="jordan@example.com"
                      className="form-control bg-dark text-white border-secondary"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-danger w-100 py-2 fw-bold shadow"
                    disabled={isSubmitting || selectedSeats.length === 0}
                  >
                    {isSubmitting ? 'Reserving Seats...' : `Confirm & Pay ($${grandTotal})`}
                  </button>
                </form>

                {/* Double-Booking Concurrency Tester Button */}
                <div className="mt-4 pt-3 border-top border-secondary border-opacity-25">
                  <button
                    type="button"
                    className="btn btn-outline-warning btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                    onClick={handleSimulateConflict}
                    disabled={selectedSeats.length === 0}
                  >
                    <i className="bi bi-lightning-charge"></i>
                    <span>Simulate Double-Booking Clash</span>
                  </button>
                  <span className="text-secondary small d-block text-center mt-1" style={{ fontSize: '0.7rem' }}>
                    Demonstrates atomic 409 conflict handling live for interviewers
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RECENT BOOKINGS & REFUND / CANCEL FACILITY */}
        <section id="recent-bookings-section" className="mt-5">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="fw-bold text-white mb-0 text-uppercase tracking-wider small">
              <i className="bi bi-clock-history text-danger me-2"></i>Recent System Bookings &amp; Cancellation Facility
            </h5>
            <span className="text-secondary small">Real-time seat state sync</span>
          </div>

          <div className="cinema-panel p-3">
            <div className="table-responsive">
              <table className="table table-dark table-hover mb-0 small align-middle">
                <thead>
                  <tr className="text-secondary">
                    <th>Ref Code</th>
                    <th>Movie &amp; Screen</th>
                    <th>Customer</th>
                    <th>Seats</th>
                    <th>Snacks</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b) => (
                    <tr key={b.booking_ref}>
                      <td className="fw-bold text-danger">#{b.booking_ref}</td>
                      <td>{b.movie_title} &bull; {b.show_time}</td>
                      <td>{b.customer_name}</td>
                      <td>
                        <span className="badge bg-secondary">{b.seat_labels}</span>
                      </td>
                      <td className="text-secondary" style={{ maxWidth: 160 }}>{b.snacks_summary}</td>
                      <td className="text-success fw-bold tabular-nums">${parseFloat(b.total_amount).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${b.status === 'CONFIRMED' ? 'bg-success' : 'bg-danger'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td>
                        {b.status === 'CONFIRMED' && (
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            onClick={() => handleCancelBooking(b.booking_ref)}
                            title="Cancel booking & release seats"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {recentBookings.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center py-4 text-secondary">
                        No bookings made yet today. Pick seats above to test!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="text-center py-3 text-secondary small border-top border-secondary border-opacity-25 bg-black mt-auto">
        CinePass Premier &bull; Full-Stack MERN Cinema Booking Platform with Atomic MongoDB Atlas Concurrency Protection
      </footer>
    </div>
  );
}
