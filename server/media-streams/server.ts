import "server-only";
import { createServer } from "node:http";
import { db } from "@/db";
import { assertMediaStreamAuthConfigured } from "@/server/integrations/twilio/media-stream-auth";
import { RealtimeMediaStreamSession } from "@/server/media-streams/realtime-session";
import WebSocket, { WebSocketServer } from "ws";

const HOST = process.env.MEDIA_STREAMS_HOST || "0.0.0.0";
const PORT = Number(process.env.MEDIA_STREAMS_PORT || "8787");
const MAX_CONNECTIONS = 100;
const MAX_TWILIO_MESSAGE_BYTES = 16 * 1024;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("MEDIA_STREAMS_PORT must be a valid TCP port.");
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to start the Media Streams service.");
}
assertMediaStreamAuthConfigured();

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && requestUrl.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  response.writeHead(404);
  response.end();
});

const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_TWILIO_MESSAGE_BYTES,
});
const activeStreams = new Set<WebSocket>();

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (requestUrl.pathname !== "/media-streams") {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (activeStreams.size >= MAX_CONNECTIONS) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    activeStreams.add(webSocket);
    webSocket.once("close", () => activeStreams.delete(webSocket));
    new RealtimeMediaStreamSession(webSocket, db).attach();
  });
});

server.on("error", (error) => {
  console.error("[media-streams] HTTP server error", error);
});

server.listen(PORT, HOST, () => {
  console.info(`[media-streams] listening on ${HOST}:${PORT}`);
});

function shutDown(signal: string): void {
  console.info(`[media-streams] received ${signal}; closing active streams`);
  for (const stream of activeStreams) {
    stream.close(1001, "Media Streams service is shutting down.");
  }
  webSocketServer.close();
  server.close((error) => {
    if (error) {
      console.error("[media-streams] failed to close HTTP server", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => shutDown("SIGTERM"));
process.once("SIGINT", () => shutDown("SIGINT"));
