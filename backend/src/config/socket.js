import { Server }         from 'socket.io';
import { createAdapter }  from '@socket.io/redis-adapter';
import { getPubClient, getSubClient } from './redis.js';

let io = null;

// ── Initialize Socket.io ──────────────────────────────────────────────────────
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
    // How long to wait before giving up on a connection attempt
    connectTimeout: 10000,
    // Ping interval to detect dead connections
    pingTimeout:  5000,
    pingInterval: 10000,
  });

  // ── Redis adapter ─────────────────────────────────────────────────────────
  // This is the line that makes WebSockets work at scale.
  // Without this, if User A is on Server Instance 1 and the
  // check worker publishes an event to Server Instance 2,
  // User A never gets it. With this adapter, all server instances
  // share events through Redis — every instance broadcasts to its own clients.
  const pubClient = getPubClient();
  const subClient = getSubClient();
  io.adapter(createAdapter(pubClient, subClient));

  // ── Connection handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`🔌 WebSocket connected: ${socket.id}`);

    // Client sends this event right after connecting to tell us
    // which workspace dashboard they're viewing
    socket.on('join:workspace', (workspaceId) => {
      if (!workspaceId) return;

      // Leave any previous workspace rooms first
      // (user switched workspaces in the same tab)
      const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
      rooms.forEach(r => socket.leave(r));

      // Join the new workspace room
      socket.join(`workspace:${workspaceId}`);

      // Confirm to the client
      socket.emit('joined:workspace', { workspaceId });
      console.log(`  └─ Socket ${socket.id} joined workspace:${workspaceId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 WebSocket disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (err) => {
      console.error(`WebSocket error on ${socket.id}:`, err.message);
    });
  });

  console.log('✅ Socket.io initialized');
  return io;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Broadcast an event to every browser tab currently viewing a workspace
export const broadcastToWorkspace = (workspaceId, event, data) => {
  if (!io) {
    console.warn('Socket.io not initialized — cannot broadcast');
    return;
  }
  io.to(`workspace:${workspaceId}`).emit(event, data);
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};