// Import express
const express = require('express');
const app = express();
const PORT = 3000;

// Import Intern model
const Intern = require('./db');

// Middleware to parse JSON request bodies
app.use(express.json());

// Create a new intern
app.post('/api/interns', async (req, res) => {
  try {
    const intern = new Intern(req.body);
    await intern.save();
    res.status(201).json(intern);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all interns
app.get('/api/interns', async (req, res) => {
  try {
    const interns = await Intern.find();
    res.json(interns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Attendance endpoint
app.post('/api/interns/:id/attendance', async (req, res) => {
  const { id } = req.params;
  const { type } = req.body; // 'in' or 'out'

  if (!['in', 'out'].includes(type)) {
    return res.status(400).json({ error: 'Invalid attendance type' });
  }

  try {
    const intern = await Intern.findById(id);
    if (!intern) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Filter attendance for today
    const todayAttendance = intern.attendance.filter(record => {
      const recordDate = new Date(record.timestamp);
      return recordDate >= startOfDay && recordDate < new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    });

    if (type === 'in') {
      // Check if already checked in today
      const alreadyCheckedIn = todayAttendance.some(record => record.type === 'in');
      if (alreadyCheckedIn) {
        return res.status(400).json({ error: 'Already checked in today' });
      }

      // Record check-in
      intern.attendance.push({ type: 'in', timestamp: now });
      intern.points += 10;
      await intern.save();
      return res.json({ message: 'Check-in successful', points: intern.points });
    } else if (type === 'out') {
      // Check if already checked out today
      const alreadyCheckedOut = todayAttendance.some(record => record.type === 'out');
      if (alreadyCheckedOut) {
        return res.status(400).json({ error: 'Already checked out today' });
      }

      // Find the last check-in for today to compare time
      const lastCheckIn = todayAttendance.filter(r => r.type === 'in').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

      if (!lastCheckIn) {
         return res.status(400).json({ error: 'Must check in first today' });
      }

      const timeDiff = now.getTime() - new Date(lastCheckIn.timestamp).getTime();
      const oneHour = 60 * 60 * 1000; 

      if (timeDiff < oneHour) {
        const remainingMinutes = Math.ceil((oneHour - timeDiff) / (60 * 1000));
        return res.status(400).json({ error: `Must wait at least 1 hour between check-in and check-out. Try again in ${remainingMinutes} minutes.` });
      }

      // Record check-out
      intern.attendance.push({ type: 'out', timestamp: now });
      intern.points += 10;
      await intern.save();
      return res.json({ message: 'Check-out successful', points: intern.points });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
