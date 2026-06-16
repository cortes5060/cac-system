require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const analistasRoutes = require('./routes/analistas.routes');
const casosRoutes = require('./routes/casos.routes');
const analistaRoutes = require('./routes/analista.routes');
const ticketRoutes = require('./routes/ticket.routes');
const iaRoutes = require('./routes/ia.routes');
const catalogosRoutes = require('./routes/catalogos.routes');
const metricasRoutes    = require('./routes/metricas.routes');
const coordinadorRoutes = require('./routes/coordinador.routes');
const supervisorRoutes  = require('./routes/supervisor.routes');
const importRoutes      = require('./routes/import.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intenta en un momento' }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use('/api', limiter);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/analistas', analistasRoutes);
app.use('/api/casos', casosRoutes);
app.use('/api/analista', analistaRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/metricas',      metricasRoutes);
app.use('/api/coordinador',  coordinadorRoutes);
app.use('/api/supervisor',   supervisorRoutes);
app.use('/api/importar',    importRoutes);

app.set("io", io);

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor con WebSocket en http://localhost:${PORT}`);
});