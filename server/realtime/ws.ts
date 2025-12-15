import type { Server } from "http";
import { WebSocketServer } from "ws";
import { publish, subscribe, type RealtimeEvent } from "./bus";

type ClientState = {
  investigationId: string | null;
  unsubscribe?: () => void;
};

export function setupWebsocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (socket) => {
    const state: ClientState = { investigationId: null };

    socket.send(JSON.stringify({ type: "hello", payload: { protocol: "kimi-osint-ws-v1" } }));

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg?.type === "subscribe" && typeof msg.investigationId === "string") {
          if (state.unsubscribe) state.unsubscribe();
          state.investigationId = msg.investigationId;
          state.unsubscribe = subscribe(msg.investigationId, (event: RealtimeEvent) => {
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
          });
          socket.send(JSON.stringify({ type: "subscribed", payload: { investigationId: msg.investigationId } }));
        }
      } catch {
        // ignore
      }
    });

    socket.on("close", () => {
      if (state.unsubscribe) state.unsubscribe();
    });
  });

  return {
    broadcast(investigationId: string, event: RealtimeEvent) {
      publish(investigationId, event);
    },
  };
}
