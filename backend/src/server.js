const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const analistasRoutes = require('./routes/analistas.routes');
const casosRoutes = require('./routes/casos.routes');
const analistaRoutes = require('./routes/analista.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended:
  true }));

app.use('/api/analistas', analistasRoutes);
app.use('/api/casos', casosRoutes);
app.use('/api/analista', analistaRoutes);

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
});

server.listen(3000, () => {
  console.log("Servidor con WebSocket en http://localhost:3000");
});