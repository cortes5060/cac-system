require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const analistasRoutes = require('./routes/analistas.routes');
const casosRoutes = require('./routes/casos.routes');
const analistaRoutes = require('./routes/analista.routes');
const ticketRoutes = require('./routes/ticket.routes');
const iaRoutes = require('./routes/ia.routes');
const catalogosRoutes = require('./routes/catalogos.routes');
const metricasRoutes    = require('./routes/metricas.routes');
const coordinadorRoutes = require('./routes/coordinador.routes');
const supervisorRoutes  = require('./routes/supervisor.routes');

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
app.use('/api/tickets', ticketRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/metricas',      metricasRoutes);
app.use('/api/coordinador',  coordinadorRoutes);
app.use('/api/supervisor',   supervisorRoutes);

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor con WebSocket en http://localhost:${PORT}`);
});