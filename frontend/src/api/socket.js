import { io } from 'socket.io-client';

const socket = io(
  import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000',
  {
    withCredentials: true,
    autoConnect:     false,
    // autoConnect: false — we connect manually after the user logs in
    // so the socket carries the right workspace context
    reconnection:       true,
    reconnectionDelay:  1000,
    reconnectionAttempts: 10,
  }
);

export default socket;