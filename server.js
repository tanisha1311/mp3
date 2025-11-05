require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Mongo connect
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on('connected', () => console.log('Connected to MongoDB Atlas'));
mongoose.connection.on('error', (e) => console.error('Mongo error:', e.message));

// Middleware
app.use(bodyParser.json());

// Simple test route (add this here)
app.get('/api', (req, res) => {
  res.json({ message: "API running smoothly" });
});

// Routes (single router with everything)
const apiRoutes = require('./routes/index');
app.use('/api', apiRoutes);

// Start
app.listen(port, () => console.log(`Server running on port ${port}`));
