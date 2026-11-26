const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = 4006;

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'Ticket Booking API', time: new Date() });
});

app.listen(PORT, () => {
  console.log(`Ticket Booking backend running on http://localhost:${PORT}`);
});
