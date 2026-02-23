// Import Mongoose and Intern model
const mongoose = require('mongoose');
const Intern = require('../../server/db');

// Sample intern data
const sampleInterns = [
  {
    name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    position: 'Software Engineer Intern',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-09-30'),
    department: 'Engineering'
  },
  {
    name: 'Marcus Williams',
    email: 'marcus.williams@example.com',
    position: 'Marketing Intern',
    startDate: new Date('2025-05-15'),
    endDate: new Date('2025-08-15'),
    department: 'Marketing'
  },
  {
    name: 'Lila Chen',
    email: 'lila.chen@example.com',
    position: 'Sales Intern',
    startDate: new Date('2025-06-10'),
    endDate: new Date('2025-09-10'),
    department: 'Sales'
  },
  {
    name: 'Ethan Moore',
    email: 'ethan.moore@example.com',
    position: 'HR Intern',
    startDate: new Date('2025-07-01'),
    endDate: new Date('2025-09-30'),
    department: 'HR'
  },
  {
    name: 'Sophia Garcia',
    email: 'sophia.garcia@example.com',
    position: 'Software Engineering Intern',
    startDate: new Date('2025-06-15'),
    endDate: new Date('2025-09-15'),
    department: 'Engineering'
  }
];

// MongoDB connection URI
const dbURI = 'mongodb://localhost:27017/bulldog-garage-interns';

// Connect to MongoDB
mongoose.connect(dbURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Clear existing interns
Intern.deleteMany({})
  .then(() => {
    console.log('Cleared existing interns');
    // Insert sample interns
    return Intern.create(sampleInterns);
  })
  .then(() => {
    console.log(`Inserted ${sampleInterns.length} interns`);
    return mongoose.connection.close();
  })
  .then(() => {
    console.log('Database seeding completed successfully.');
  })
  .catch(error => {
    console.error('Error seeding database:', error);
    mongoose.connection.close();
  });
