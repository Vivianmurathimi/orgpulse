import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Socket } from "socket.io-client";
import { api } from "../api";
import { connectSocket } from "../socket";
import type { Notification } from "../types";
import { useAuth } from "./AuthContext";

// The live connection, the unread badge and the toasts.

export interface Toast {
  id: number;
  message: string;
  link?: string;
}

const TOAST_MS = 5000;

interface RealtimeValue {
  socket: Socket | null;
  connected: boolean;
  unread: number;
  refreshUnread: () => Promise<void>;
  toasts: Toast[];
  showToast: (message: string, link?: string) => void;
  dismissToast: (id: number) => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session, org } = useAuth();
  const token = session?.token;
  const orgId = org?.id;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, link?: string) => {
      const id = nextToastId.current++;
      setToasts((items) => [...items, { id, message, link }]);
      setTimeout(() => dismissToast(id), TOAST_MS);
    },
    [dismissToast],
  );

  const refreshUnread = useCallback(async () => {
    try {
      const { count } = await api<{ count: number }>("/api/notifications/unread-count");
      setUnread(count);
    } catch {
      // The badge is not worth an error message. It updates on the next event.
    }
  }, []);

  useEffect(() => {
    if (!token || !orgId) return;

    const live = connectSocket(token);
    setSocket(live);

    live.on("connect", () => {
      setConnected(true);
      // Catch up on anything that arrived while disconnected
      void refreshUnread();
    });
    live.on("disconnect", () => setConnected(false));
    live.on("notification:new", (notification: Notification) => {
      setUnread((count) => count + 1);
      showToast(notification.message, "/notifications");
    });

    return () => {
      live.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, orgId, refreshUnread, showToast]);

  const value = useMemo(
    () => ({ socket, connected, unread, refreshUnread, toasts, showToast, dismissToast }),
    [socket, connected, unread, refreshUnread, toasts, showToast, dismissToast],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside RealtimeProvider");
  return value;
}

// Runs `handler` whenever the server sends `event`, for as long as the page is open
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useRealtime();

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
