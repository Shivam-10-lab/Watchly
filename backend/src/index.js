import 'dotenv/config';
import express           from 'express';
import { createServer }  from 'http';
import cors              from 'cors';
import helmet            from 'helmet';
import morgan            from 'morgan';
import cookieParser      from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';

// ── Config imports ─────────────────────────────────────────────────────────
import { connectDB }          from './config/db.js';
import { connectRedis }       from './config/redis.js';
import { connectRabbitMQ }    from './config/rabbitmq.js';
import { configureCloudinary} from './config/cloudinary.js';
import { initSocket }         from './config/socket.js';

// ── Model setup ────────────────────────────────────────────────────────────
import { ensureTimeSeriesCollection } from './models/index.js';

const app        = express();
const httpServer = createServer(app);

// Socket.io needs to attach to the raw HTTP server, not Express.

// ── Trust proxy ────────────────────────────────────────────────────────────

app.set('trust proxy', 1);

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials:    true,
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Cookie','X-API-Key','X-Request-Id'],
}));

app.options('/{*splat}', cors());

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Request ID middleware ──────────────────────────────────────────────────
// Attaches a unique ID to every request.

app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// ── HTTP request logging ───────────────────────────────────────────────────
import { requestLogger } from './middleware/requestLogger.middleware.js';

// ── HTTP request logging ────────────────────────────────────────────────────
// Use our custom logger instead of morgan 
app.use(requestLogger);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success:     true,
    message:     'Watchly API is running',
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV,
    requestId:   req.requestId,
  });
});

// Keep-alive for Render free tier (spins down after 15 min inactivity)
app.get('/ping', (req, res) => res.status(200).send('pong'));

// ── API routes ─────────────────────────────────────────────────────────────
import { generalLimiter } from './middleware/rateLimiter.middleware.js';
import routes             from './routes/index.js';

// Apply general rate limit to all API routes
app.use('/api', generalLimiter);


// Mount all routes under /api/v1 (API versioning)
app.use('/api/v1', routes);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.requestId,
  });
});

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[${req.requestId}] 🔥 Error:`, err.stack);

  if (err.message?.includes('CORS blocked')) {
    return res.status(403).json({
      success: false, message: err.message, requestId: req.requestId,
    });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors:  Object.values(err.errors).map(e => e.message),
      requestId: req.requestId,
    });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      requestId: req.requestId,
    });
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large' });
  }

  res.status(err.status || 500).json({
    success:   false,
    message:   err.message || 'Internal Server Error',
    requestId: req.requestId,
  });
});

// ── Start server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;

    // ── BullBoard (job queue visual dashboard) ──────────────────────────────────
    import { createBullBoard }  from '@bull-board/api';
    import { BullMQAdapter }    from '@bull-board/api/bullMQAdapter';
    import { ExpressAdapter }   from '@bull-board/express';
    import { getCheckQueue, getAnalyticsQueue } from './queues/queues.js';

    const bullBoardAdapter = new ExpressAdapter();
    bullBoardAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [
        new BullMQAdapter(getCheckQueue()),
        new BullMQAdapter(getAnalyticsQueue()),
      ],
      serverAdapter: bullBoardAdapter,
    });

    // Mount BullBoard at /admin/queues
    // In production you'd add authentication middleware before this
    app.use('/admin/queues', bullBoardAdapter.getRouter());
    console.log(`📊 BullBoard: http://localhost:${PORT}/admin/queues`);

const startServer = async () => {
  try {
    
    await connectDB();
    await connectRedis();
    await connectRabbitMQ();
    configureCloudinary();
    // Create the MongoDB time-series collection for check results
    await ensureTimeSeriesCollection();

    // Initialize Socket.io on the HTTP server
    // Must happen AFTER redis is connected (Redis adapter needs it)
    initSocket(httpServer);

    // Start the Redis pub/sub subscriber
    // This bridges the check worker → Redis → WebSocket → browser
    const { startSubscriber } = await import('./pubsub/subscriber.js');
    await startSubscriber();

    // Listen on httpServer (not app) — Socket.io is attached to httpServer
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Watchly API running on http://localhost:${PORT}`);
      console.log(`📋 Health:    http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
      console.log(`📊 BullBoard: http://localhost:${PORT}/admin/queues`);
      console.log(`📦 Env:       ${process.env.NODE_ENV}\n`);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();

export default app;