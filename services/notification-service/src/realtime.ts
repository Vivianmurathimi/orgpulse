import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server, type Socket } from "socket.io";
import { HttpError } from "./middleware/errorHandler";
import { prisma } from "./lib/prisma";
import { sendWish } from "./lib/wishes";

// The Socket.IO server. It shares a port with Express.
// Each user joins two rooms: user:<id> for personal messages and org:<id> for
// their organisation, so one emit reaches exactly the right people.

let io: Server | undefined;

export interface SocketUser {
  userId: string;
  orgId?: string;
}

type Ack = (response: object) => void;

function readToken(token: unknown): SocketUser | null {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof token !== "string") return null;

  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.userId !== "string") return null;
    return { userId: payload.userId, orgId: payload.orgId };
  } catch {
    return null;
  }
}

// Runs a client's request and always answers, so a bad message can never crash the server
function handle(
  socket: Socket,
  event: string,
  run: (user: SocketUser, data: unknown) => Promise<object>,
) {
  socket.on(event, async (data: unknown, ack?: Ack) => {
    // The client may not have passed a callback, or may have sent one in the wrong place
    const respond: Ack = typeof ack === "function" ? ack : () => {};

    try {
      respond(await run(socket.data.user, data));
    } catch (err) {
      if (err instanceof HttpError) {
        respond({ error: err.message });
      } else {
        console.error(`Socket event ${event} failed:`, err);
        respond({ error: "Something went wrong" });
      }
    }
  });
}

export function startRealtime(server: HttpServer): void {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" },
  });

  // Every connection must show a valid token, or it is refused
  io.use((socket, next) => {
    const user = readToken(socket.handshake.auth.token);
    if (!user) {
      next(new Error("Invalid token"));
      return;
    }
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const { userId, orgId } = socket.data.user as SocketUser;

    socket.join(`user:${userId}`);
    if (orgId) socket.join(`org:${orgId}`);

    handle(socket, "wish:send", async (user, data) => {
      const wish = await sendWish(user, data);
      emitToOrg(wish.orgId, "wish:new", wish);
      return { ok: true, wish };
    });

    handle(socket, "notification:read", async (user, data) => {
      const id = (data as { id?: unknown } | null)?.id;
      if (typeof id !== "string") {
        throw new HttpError(400, "id is required");
      }

      // Checking userId means people can only change their own notifications
      await prisma.notification.updateMany({
        where: { id, userId: user.userId },
        data: { read: true },
      });
      return { ok: true };
    });
  });
}

export function emitToUser(userId: string, event: string, payload: object): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToOrg(orgId: string, event: string, payload: object): void {
  io?.to(`org:${orgId}`).emit(event, payload);
}
