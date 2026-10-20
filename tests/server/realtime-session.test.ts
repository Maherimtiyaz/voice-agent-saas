import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import WebSocket, { WebSocketServer } from "ws";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import {
  agents,
  calls,
  callTranscripts,
  organizationMembers,
  organizations,
  phoneNumbers,
  toolExecutions,
  users,
} from "@/db/schema";
import { createMediaStreamToken } from "@/server/integrations/twilio/media-stream-auth";
import {
  RealtimeMediaStreamSession,
  type OpenAISocketFactory,
} from "@/server/media-streams/realtime-session";

type JsonEvent = Record<string, unknown>;

function createMessageCollector(socket: WebSocket) {
  const messages: JsonEvent[] = [];
  const waiters: Array<{
    predicate: (message: JsonEvent) => boolean;
    resolve: (message: JsonEvent) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  socket.on("message", (raw) => {
    let value: unknown;
    try {
      value = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;
    const message = value as JsonEvent;
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        clearTimeout(waiter.timeout);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    }
  });

  return {
    waitFor(predicate: (message: JsonEvent) => boolean): Promise<JsonEvent> {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (index !== -1) waiters.splice(index, 1);
          reject(new Error("Timed out waiting for WebSocket event."));
        }, 4_000);
        waiters.push({ predicate, resolve, reject, timeout });
      });
    },
  };
}

function isType(type: string) {
  return (message: JsonEvent) => message.type === type;
}

let db: TestDatabase;
let twilioServer: WebSocketServer;
let openAiServer: WebSocketServer;
let twilioClient: WebSocket | undefined;
let openAiClients: WebSocket[] = [];

beforeEach(async () => {
  db = await createTestDatabase();
  openAiClients = [];
  vi.stubEnv("MEDIA_STREAMS_SECRET", "test-media-stream-secret-at-least-32");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
});

afterEach(async () => {
  twilioClient?.terminate();
  for (const client of openAiClients) client.terminate();
  await Promise.all(
    [twilioServer, openAiServer]
      .filter((server): server is WebSocketServer => Boolean(server))
      .map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
  );
  vi.unstubAllEnvs();
});

describe("RealtimeMediaStreamSession", () => {
  it("streams Twilio μ-law audio, plays responses, executes tools, and stores transcripts", async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: "Realtime test", slug: `realtime-${crypto.randomUUID()}` })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        email: `${crypto.randomUUID()}@example.com`,
        name: "Realtime user",
        passwordHash: "x",
      })
      .returning();
    await db.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
    });
    const [agent] = await db
      .insert(agents)
      .values({
        organizationId: organization.id,
        name: "Realtime assistant",
        systemPrompt: "Help callers.",
        voiceProvider: "openai_realtime",
      })
      .returning();
    const [phoneNumber] = await db
      .insert(phoneNumbers)
      .values({
        organizationId: organization.id,
        agentId: agent.id,
        twilioNumberSid: `PN${crypto.randomUUID().replace(/-/g, "")}`,
        e164Number: "+14155550101",
      })
      .returning();
    const [call] = await db
      .insert(calls)
      .values({
        organizationId: organization.id,
        agentId: agent.id,
        phoneNumberId: phoneNumber.id,
        twilioCallSid: "CA-realtime-session",
        fromNumber: "+14155550102",
        toNumber: phoneNumber.e164Number,
      })
      .returning();

    openAiServer = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => openAiServer.once("listening", resolve));
    const address = openAiServer.address();
    if (!address || typeof address === "string") {
      throw new Error("OpenAI test server did not bind a TCP port.");
    }
    const openAiUrl = `ws://127.0.0.1:${address.port}`;
    openAiServer.on("connection", (socket) => openAiClients.push(socket));
    const openAiConnection = new Promise<WebSocket>((resolve) =>
      openAiServer.once("connection", resolve),
    );
    const socketFactory: OpenAISocketFactory = () => new WebSocket(openAiUrl);

    twilioServer = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => twilioServer.once("listening", resolve));
    twilioServer.on("connection", (socket) =>
      new RealtimeMediaStreamSession(socket, db, socketFactory).attach(),
    );
    const twilioAddress = twilioServer.address();
    if (!twilioAddress || typeof twilioAddress === "string") {
      throw new Error("Twilio test server did not bind a TCP port.");
    }
    twilioClient = new WebSocket(`ws://127.0.0.1:${twilioAddress.port}`);
    await new Promise<void>((resolve, reject) => {
      twilioClient?.once("open", resolve);
      twilioClient?.once("error", reject);
    });

    const twilioEvents = createMessageCollector(twilioClient);
    const mediaToken = createMediaStreamToken({
      callId: call.id,
      callSid: call.twilioCallSid!,
    });
    twilioClient.send(JSON.stringify({ event: "connected" }));
    twilioClient.send(
      JSON.stringify({
        event: "start",
        streamSid: "MZ-realtime",
        start: {
          callSid: call.twilioCallSid,
          streamSid: "MZ-realtime",
          mediaFormat: {
            encoding: "audio/x-mulaw",
            sampleRate: 8000,
            channels: 1,
          },
          customParameters: { auth: mediaToken },
        },
      }),
    );

    const openAiSocket = await openAiConnection;
    const openAiEvents = createMessageCollector(openAiSocket);
    const sessionUpdate = await openAiEvents.waitFor(isType("session.update"));
    expect(
      (sessionUpdate.session as { audio: { input: { format: { type: string } } } }).audio.input.format
        .type,
    ).toBe("audio/pcmu");
    openAiSocket.send(JSON.stringify({ type: "session.updated" }));
    await openAiEvents.waitFor(isType("response.create"));

    twilioClient.send(
      JSON.stringify({
        event: "media",
        streamSid: "MZ-realtime",
        media: { track: "inbound", payload: "AAECAw==" },
      }),
    );
    const forwardedAudio = await openAiEvents.waitFor(isType("input_audio_buffer.append"));
    expect(forwardedAudio.audio).toBe("AAECAw==");

    openAiSocket.send(JSON.stringify({ type: "response.created" }));
    openAiSocket.send(JSON.stringify({ type: "response.audio.delta", delta: "AQIDBA==" }));
    const playback = await twilioEvents.waitFor((message) => message.event === "media");
    expect(playback.streamSid).toBe("MZ-realtime");
    expect((playback.media as { payload: string }).payload).toBe("AQIDBA==");

    openAiSocket.send(JSON.stringify({ type: "input_audio_buffer.speech_started" }));
    await twilioEvents.waitFor((message) => message.event === "clear");
    await openAiEvents.waitFor(isType("response.cancel"));
    openAiSocket.send(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "I need an appointment.",
      }),
    );
    openAiSocket.send(
      JSON.stringify({
        type: "response.audio_transcript.done",
        transcript: "I can help with that.",
      }),
    );
    openAiSocket.send(
      JSON.stringify({
        type: "response.function_call_arguments.done",
        call_id: "function-call-1",
        name: "not_a_registered_tool",
        arguments: "{}",
      }),
    );
    openAiSocket.send(JSON.stringify({ type: "response.done" }));
    const toolOutput = await openAiEvents.waitFor(isType("conversation.item.create"));
    expect(
      (toolOutput.item as { output: string }).output,
    ).toContain("Unknown function");
    await openAiEvents.waitFor(isType("response.create"));

    const closed = new Promise<void>((resolve) => twilioClient?.once("close", () => resolve()));
    twilioClient.send(JSON.stringify({ event: "stop", streamSid: "MZ-realtime" }));
    await closed;

    const [storedCall] = await db.select().from(calls).where(eq(calls.id, call.id));
    const transcripts = await db
      .select()
      .from(callTranscripts)
      .where(eq(callTranscripts.callId, call.id));
    const executions = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.callId, call.id));
    expect(storedCall.status).toBe("completed");
    expect(storedCall.endedReason).toBe("twilio_media_stream_ended");
    expect(transcripts.map((entry) => [entry.role, entry.content])).toEqual([
      ["user", "I need an appointment."],
      ["assistant", "I can help with that."],
    ]);
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe("failure");
  }, 20_000);
});
