const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }  // তোমার Mini App URL দাও পরে
});

app.use(cors());
app.use(express.json());

let waitingUsers = [];  // waiting queue
let pairs = {};         // active pairs: { socket.id: partner.id }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // নতুন ইউজার join → waiting-এ রাখো
  socket.on('joinChat', (userData) => {  // userData = { id, name from Telegram }
    socket.user = userData;

    if (waitingUsers.length > 0) {
      const partner = waitingUsers.shift();
      pairs[socket.id] = partner.id;
      pairs[partner.id] = socket.id;

      io.to(socket.id).emit('matched', { partner: partner.user });
      io.to(partner.id).emit('matched', { partner: socket.user });

      socket.emit('message', { from: 'system', text: 'ম্যাচ হয়েছে! চ্যাট শুরু করো 😊' });
      io.to(partner.id).emit('message', { from: 'system', text: 'ম্যাচ হয়েছে! চ্যাট শুরু করো 😊' });
    } else {
      waitingUsers.push({ id: socket.id, user: userData });
      socket.emit('message', { from: 'system', text: 'পার্টনার খুঁজছি... অপেক্ষা করুন' });
    }
  });

  // মেসেজ পাঠানো
  socket.on('sendMessage', (msg) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('message', { from: socket.user.name || 'Stranger', text: msg });
    }
  });

  // Next / Skip
  socket.on('next', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('message', { from: 'system', text: 'পার্টনার চলে গেছে। নতুন খুঁজছি...' });
      delete pairs[partnerId];
      delete pairs[socket.id];
      io.to(partnerId).emit('unmatched');
    }
    // আবার waiting-এ যোগ করো
    socket.emit('message', { from: 'system', text: 'নতুন পার্টনার খুঁজছি...' });
    waitingUsers.push({ id: socket.id, user: socket.user });
  });

  socket.on('disconnect', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('message', { from: 'system', text: 'পার্টনার চলে গেছে 😔' });
      delete pairs[partnerId];
    }
    // waiting থেকে রিমুভ
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));