const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'ticket_booking.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to Ticket Booking SQLite DB:', err.message);
  } else {
    console.log('Connected to Ticket Booking database: ticket_booking.db');
  }
});

db.serialize(() => {
  // 1. Movies Table
  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      duration TEXT NOT NULL,
      rating REAL NOT NULL,
      poster_url TEXT NOT NULL,
      backdrop_url TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `);

  // 2. Showtimes Table
  db.run(`
    CREATE TABLE IF NOT EXISTS showtimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movie_id INTEGER NOT NULL,
      screen_name TEXT NOT NULL,
      show_time TEXT NOT NULL,
      ticket_price REAL NOT NULL,
      FOREIGN KEY (movie_id) REFERENCES movies(id)
    )
  `);

  // 3. Seats Table with Tiers (STANDARD, PREMIUM, VIP)
  db.run(`
    CREATE TABLE IF NOT EXISTS seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      showtime_id INTEGER NOT NULL,
      seat_row TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      seat_label TEXT NOT NULL,
      tier TEXT DEFAULT 'STANDARD', -- 'STANDARD', 'PREMIUM', 'VIP'
      price REAL NOT NULL,
      status TEXT DEFAULT 'AVAILABLE', -- 'AVAILABLE' or 'BOOKED'
      FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
      UNIQUE(showtime_id, seat_label)
    )
  `);

  // 4. Bookings Table with Snacks & Cancellation Status
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT UNIQUE NOT NULL,
      showtime_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      seat_labels TEXT NOT NULL,
      snacks_summary TEXT DEFAULT 'None',
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'CONFIRMED', -- 'CONFIRMED' or 'CANCELLED'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (showtime_id) REFERENCES showtimes(id)
    )
  `);

  // 5. Concessions / Snacks Catalog
  db.run(`
    CREATE TABLE IF NOT EXISTS concessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      icon TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `);

  // Seed Concessions
  db.get(`SELECT COUNT(*) as count FROM concessions`, (err, row) => {
    if (!err && row.count === 0) {
      const stmt = db.prepare(`INSERT INTO concessions (name, category, price, icon, description) VALUES (?, ?, ?, ?, ?)`);
      stmt.run('Cinema Combo (Popcorn + Drink)', 'Combos', 8.50, '🍿', 'Large warm buttery popcorn paired with a 32oz fountain soda.');
      stmt.run('Loaded Truffle Nachos', 'Snacks', 7.00, '🧀', 'Crispy tortilla chips served with warm melted cheese and pickled jalapeños.');
      stmt.run('Artisan Candy Bites', 'Sweets', 4.50, '🍬', 'Assorted chocolate-covered almond bites.');
      stmt.run('Iced Fruit Slushie', 'Beverages', 5.00, '🥤', 'Chilled blue raspberry slushie with crushed ice.');
      stmt.finalize();
      console.log('Seeded concessions catalog.');
    }
  });

  // Seed Movies and Showtimes
  db.get(`SELECT COUNT(*) as count FROM movies`, (err, row) => {
    if (!err && row.count === 0) {
      console.log('Seeding movies, showtimes, and tiered seats...');
      const movieStmt = db.prepare(`INSERT INTO movies (title, genre, duration, rating, poster_url, backdrop_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      
      movieStmt.run(
        'Interstellar: Beyond Time',
        'Sci-Fi',
        '2h 49m',
        8.7,
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&auto=format&fit=crop&q=80',
        'When Earth becomes uninhabitable, an expedition journeys through a cosmic wormhole to find humanity a new home.'
      );

      movieStmt.run(
        'Cyberpunk 2099: Neo Tokyo',
        'Action',
        '2h 15m',
        8.4,
        'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
        'In a rain-drenched cyberpunk megalopolis, a rogue operative discovers a memory shard carrying the world’s final secret.'
      );

      movieStmt.run(
        'The Silent Symphony',
        'Drama',
        '1h 58m',
        8.9,
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1200&auto=format&fit=crop&q=80',
        'A virtuoso concert pianist loses hearing only to discover the transcendent resonance of vibrational composition.'
      );

      movieStmt.finalize(() => {
        const showtimeStmt = db.prepare(`INSERT INTO showtimes (movie_id, screen_name, show_time, ticket_price) VALUES (?, ?, ?, ?)`);
        showtimeStmt.run(1, 'IMAX Screen 1', '04:30 PM', 14.00);
        showtimeStmt.run(1, 'IMAX Screen 1', '07:45 PM', 16.00);
        showtimeStmt.run(2, 'Dolby Atmos Screen 2', '06:15 PM', 13.50);
        showtimeStmt.run(3, 'VIP Lounge Screen 3', '08:30 PM', 18.00);
        
        showtimeStmt.finalize(() => {
          // Initialize a 5x8 seat grid (Rows A-E, 1-8 = 40 seats) for each showtime with distinct tiers:
          // Row A-B: STANDARD (base price)
          // Row C-D: PREMIUM (base + $3)
          // Row E: VIP RECLINER (base + $8)
          const seatStmt = db.prepare(`INSERT INTO seats (showtime_id, seat_row, seat_number, seat_label, tier, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
          const rows = [
            { letter: 'A', tier: 'STANDARD', extra: 0 },
            { letter: 'B', tier: 'STANDARD', extra: 0 },
            { letter: 'C', tier: 'PREMIUM', extra: 3.0 },
            { letter: 'D', tier: 'PREMIUM', extra: 3.0 },
            { letter: 'E', tier: 'VIP', extra: 8.0 }
          ];
          
          for (let showtimeId = 1; showtimeId <= 4; showtimeId++) {
            const basePrice = showtimeId === 4 ? 18.0 : 14.0;
            rows.forEach((r) => {
              for (let num = 1; num <= 8; num++) {
                const label = `${r.letter}${num}`;
                // Pre-book 3-4 seats to make it realistic
                const isBooked = (showtimeId === 1 && (label === 'C4' || label === 'C5' || label === 'D4')) ? 'BOOKED' : 'AVAILABLE';
                seatStmt.run(showtimeId, r.letter, num, label, r.tier, basePrice + r.extra, isBooked);
              }
            });
          }
          seatStmt.finalize(() => {
            console.log('Seeded showtimes and 40 tiered seats per screen.');
          });
        });
      });
    }
  });
});

module.exports = db;
