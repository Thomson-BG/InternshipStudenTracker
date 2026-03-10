// Import mongoose for MongoDB connection
const mongoose = require('mongoose');

// MongoDB connection URI - using local database for development
const dbURI = 'mongodb://localhost:27017/bulldog-garage-interns';

// Connect to MongoDB
mongoose.connect(dbURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Handle connection errors
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

// Define an intern schema
const internSchema = new mongoose.Schema({
  name: String,
  email: String,
  position: String,
  startDate: Date,
  endDate: Date,
  department: String,
  points: { type: Number, default: 0 },
  attendance: [{
    type: { type: String, enum: ['in', 'out'], required: true },
    timestamp: { type: Date, default: Date.now }
  }]
});

// Create Intern model
const Intern = mongoose.model('Intern', internSchema);

// Export Intern model
module.exports = Intern;
