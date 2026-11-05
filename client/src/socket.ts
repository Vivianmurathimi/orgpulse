import { io, type Socket } from "socket.io-client";

// The one connection that skips the gateway: it goes straight to the
// notification service, which checks the token.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4004";

export function connectSocket(token: string): Socket {
  return io(SOCKET_URL, { auth: { token } });
}
