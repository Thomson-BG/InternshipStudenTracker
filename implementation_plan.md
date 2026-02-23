# Implementation Plan: Points System & Attendance Tracking

## 1. Database Schema Update (`server/db.js`)
We will modify the `Intern` schema to include:
- `points`: A number field to track total points (starts at 0).
- `attendance`: An array to store check-in/out history. Each record will have:
    - `type`: Either 'in' or 'out'.
    - `timestamp`: The date and time of the event.

```javascript
const internSchema = new mongoose.Schema({
  // ... existing fields
  points: { type: Number, default: 0 },
  attendance: [{
    type: { type: String, enum: ['in', 'out'], required: true },
    timestamp: { type: Date, default: Date.now }
  }]
});
```

## 2. Server-Side Logic (`server/index.js`)
We will create a new API endpoint `POST /api/interns/:id/attendance` to handle check-ins and check-outs.

**Logic for Check-In:**
1.  Check if the intern has already checked in *today*.
2.  If yes, return an error.
3.  If no, record the check-in, add 10 points, and save.

**Logic for Check-Out:**
1.  Check if the intern has already checked out *today*.
2.  If yes, return an error.
3.  Find the last check-in time.
4.  Ensure at least **1 hour** has passed since the last check-in.
5.  If less than 1 hour, return an error.
6.  If all checks pass, record the check-out, add 10 points, and save.

## 3. Client-Side Update (`client/index.html`)
We will update the user interface to:
1.  Display the current `points` for each intern.
2.  Add "Check In" and "Check Out" buttons to each intern's card.
3.  Connect these buttons to the new API endpoint.
4.  Show success/error messages (e.g., "Check-in successful", "Must wait 1 hour").

## 4. Verification
We will verify the changes by:
- Creating a test intern.
- Attempting to check in (should succeed, +10 points).
- Attempting to check in again immediately (should fail).
- Attempting to check out immediately (should fail - <1 hour).
- (Simulating a time jump or waiting) Attempting to check out after 1 hour (should succeed, +10 points).
