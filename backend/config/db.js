const mongoose = require('mongoose');
const Movie = require('../models/Movie');
const Showtime = require('../models/Showtime');
const Seat = require('../models/Seat');
const Concession = require('../models/Concession');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ticket_booking';

async function connectDB() {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`Connected to MongoDB Atlas: ${conn.connection.host}/${conn.connection.name}`);
    await seedInitialData();
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
}

async function seedInitialData() {
  try {
    // 1. Seed Concessions
    const concessionCount = await Concession.countDocuments();
    if (concessionCount === 0) {
      await Concession.create([
        {
          name: 'Cinema Combo (Popcorn + Drink)',
          category: 'Combos',
          price: 8.50,
          icon: '🍿',
          description: 'Large warm buttery popcorn paired with a 32oz fountain soda.'
        },
        {
          name: 'Loaded Truffle Nachos',
          category: 'Snacks',
          price: 7.00,
          icon: '🧀',
          description: 'Crispy tortilla chips served with warm melted cheese and pickled jalapeños.'
        },
        {
          name: 'Artisan Candy Bites',
          category: 'Sweets',
          price: 4.50,
          icon: '🍬',
          description: 'Assorted chocolate-covered almond bites.'
        },
        {
          name: 'Iced Fruit Slushie',
          category: 'Beverages',
          price: 5.00,
          icon: '🥤',
          description: 'Chilled blue raspberry slushie with crushed ice.'
        }
      ]);
      console.log('Seeded concessions catalog in MongoDB.');
    }

    // 2. Seed Movies, Showtimes & Tiered Seats
    const movieCount = await Movie.countDocuments();
    if (movieCount === 0) {
      console.log('Seeding movies, showtimes, and 40 tiered seats...');

      const movie1 = await Movie.create({
        title: 'Interstellar: Beyond Time',
        genre: 'Sci-Fi',
        duration: '2h 49m',
        rating: 8.7,
        posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
        backdropUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&auto=format&fit=crop&q=80',
        description: 'When Earth becomes uninhabitable, an expedition journeys through a cosmic wormhole to find humanity a new home.'
      });

      const movie2 = await Movie.create({
        title: 'Cyberpunk 2099: Neo Tokyo',
        genre: 'Action',
        duration: '2h 15m',
        rating: 8.4,
        posterUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
        backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
        description: 'In a rain-drenched cyberpunk megalopolis, a rogue operative discovers a memory shard carrying the world’s final secret.'
      });

      const movie3 = await Movie.create({
        title: 'The Silent Symphony',
        genre: 'Drama',
        duration: '1h 58m',
        rating: 8.9,
        posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
        backdropUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1200&auto=format&fit=crop&q=80',
        description: 'A virtuoso concert pianist loses hearing only to discover the transcendent resonance of vibrational composition.'
      });

      const showtimes = await Showtime.create([
        { movie: movie1._id, screenName: 'IMAX Screen 1', showTime: '04:30 PM', ticketPrice: 14.00 },
        { movie: movie1._id, screenName: 'IMAX Screen 1', showTime: '07:45 PM', ticketPrice: 16.00 },
        { movie: movie2._id, screenName: 'Dolby Atmos Screen 2', showTime: '06:15 PM', ticketPrice: 13.50 },
        { movie: movie3._id, screenName: 'VIP Lounge Screen 3', showTime: '08:30 PM', ticketPrice: 18.00 }
      ]);

      const rows = [
        { letter: 'A', tier: 'STANDARD', extra: 0 },
        { letter: 'B', tier: 'STANDARD', extra: 0 },
        { letter: 'C', tier: 'PREMIUM', extra: 3.0 },
        { letter: 'D', tier: 'PREMIUM', extra: 3.0 },
        { letter: 'E', tier: 'VIP', extra: 8.0 }
      ];

      const allSeats = [];
      for (let i = 0; i < showtimes.length; i++) {
        const st = showtimes[i];
        const basePrice = st.ticketPrice;

        rows.forEach((r) => {
          for (let num = 1; num <= 8; num++) {
            const label = `${r.letter}${num}`;
            const isBooked = (i === 0 && (label === 'C4' || label === 'C5' || label === 'D4'));
            allSeats.push({
              showtime: st._id,
              seatRow: r.letter,
              seatNumber: num,
              seatLabel: label,
              tier: r.tier,
              price: basePrice + r.extra,
              status: isBooked ? 'BOOKED' : 'AVAILABLE'
            });
          }
        });
      }

      await Seat.insertMany(allSeats);
      console.log(`Seeded ${showtimes.length} showtimes and ${allSeats.length} tiered seats into MongoDB.`);
    }
  } catch (err) {
    console.error('Error during data seed:', err.message);
  }
}

module.exports = connectDB;
