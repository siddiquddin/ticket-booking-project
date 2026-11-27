require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 4006;

app.use(cors());
app.use(express.json());

// Initialize MongoDB Atlas connection & auto-seed
connectDB();

app.use('/api', apiRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Ticket Booking API (MERN Stack)',
    database: 'MongoDB Atlas',
    time: new Date()
  });
});

app.listen(PORT, () => {
  console.log(`Ticket Booking backend running on http://localhost:${PORT}`);
});
