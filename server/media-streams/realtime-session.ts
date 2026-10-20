import WebSocket, { type RawData } from "ws";
import type { Database } from "@/db";
import {
  appendTranscript,
  finishRealtimeMediaStreamCall,
  getRealtimeMediaStreamCall,
  markRealtimeMediaStreamCallStarted,
} from "@/server/services/call.service";
import { executeTool } from "@/server/tools/executor";
import {
  buildRealtimeSessionUpdate,
  parseTwilioStartMessage,
} from "@/server/media-streams/realtime-protocol";
import { verifyMediaStreamToken } from "@/server/integrations/twilio/media-stream-auth";

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime";
const MAX_BUFFERED_AUDIO_FRAMES = 100;
const OPENAI_CONNECT_TIMEOUT_MS = 10_000;

export type OpenAISocketFactory = (
  url: URL,
  headers: Record<string, string>,
) => WebSocket;

type MediaStreamCall = NonNullable<
  Awaited<ReturnType<typeof getRealtimeMediaStreamCall>>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(socket: WebSocket, message: Record<string, unknown>): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

export class RealtimeMediaStreamSession {
  private streamSid: string | null = null;
  private call: MediaStreamCall | null = null;
  private openAiSocket: WebSocket | null = null;
  private started = false;
  private finalized = false;
  private stopReceived = false;
  private expectedDisconnect = false;
  private sessionReady = false;
  private responseActive = false;
  private readonly queuedAudio: string[] = [];
  private transcriptQueue: Promise<void> = Promise.resolve();
  private pendingToolCalls: Promise<void>[] = [];
  private openTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly twilioSocket: WebSocket,
    private readonly db: Database,
    private readonly openAiSocketFactory: OpenAISocketFactory = (url, headers) =>
      new WebSocket(url, { headers, maxPayload: 1024 * 1024 }),
  ) {}

  attach(): void {
    this.twilioSocket.on("message", (raw, isBinary) => {
      if (isBinary) {
        this.rejectStream("Twilio sent an unexpected binary message.");
        return;
      }
      void this.handleTwilioMessage(raw).catch((error: unknown) => {
        console.error("[media-streams] failed to process Twilio message", error);
        void this.finish("failed", "media_stream_processing_error");
      });
    });

    this.twilioSocket.on("close", () => {
      void this.finish(
        this.stopReceived || this.expectedDisconnect ? "completed" : "failed",
        this.stopReceived
          ? "twilio_media_stream_ended"
          : this.expectedDisconnect
            ? "call_transferred"
            : "media_stream_disconnected",
      );
    });

    this.twilioSocket.on("error", (error) => {
      console.error("[media-streams] Twilio WebSocket error", error);
      void this.finish("failed", "twilio_media_stream_error");
    });
  }

  private async handleTwilioMessage(raw: RawData): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      this.rejectStream("Twilio sent invalid JSON.");
      return;
    }
    if (!isRecord(message) || typeof message.event !== "string") {
      this.rejectStream("Twilio sent an invalid event.");
      return;
    }

    if (message.event === "connected") return;
    if (message.event === "start") {
      await this.handleStart(message);
      return;
    }
    if (message.event === "media") {
      this.handleMedia(message);
      return;
    }
    if (message.event === "stop") {
      this.stopReceived = true;
      await this.finish("completed", "twilio_media_stream_ended");
      return;
    }
  }

  private async handleStart(value: Record<string, unknown>): Promise<void> {
    if (this.started) {
      this.rejectStream("Twilio sent more than one start event.");
      return;
    }
    const start = parseTwilioStartMessage(value);
    const auth = start?.start.customParameters.auth;
    const claims = auth ? verifyMediaStreamToken(auth) : null;
    if (!start || !claims || claims.callSid !== start.start.callSid) {
      this.rejectStream("Twilio stream authentication failed.");
      return;
    }

    this.started = true;
    const call = await getRealtimeMediaStreamCall(this.db, {
      callId: claims.callId,
      callSid: claims.callSid,
    });
    if (!call) {
      console.warn("[media-streams] authenticated stream did not match an OpenAI Realtime call");
      this.rejectStream("Call is not configured for this stream.");
      return;
    }
    const startedCall = await markRealtimeMediaStreamCallStarted(this.db, call.call.id);
    if (!startedCall) {
      this.rejectStream("Call is already active or has ended.");
      return;
    }

    this.call = call;
    this.streamSid = start.start.streamSid;
    this.connectToOpenAI();
  }

  private connectToOpenAI(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !this.call) {
      console.error("[media-streams] OPENAI_API_KEY is missing or call context is unavailable");
      void this.finish("failed", "openai_configuration_error");
      return;
    }

    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
    const url = new URL(OPENAI_REALTIME_URL);
    url.searchParams.set("model", model);
    const socket = this.openAiSocketFactory(url, {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      });
    this.openAiSocket = socket;

    this.openTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        console.error("[media-streams] OpenAI Realtime connection timed out");
        void this.finish("failed", "openai_connection_timeout");
      }
    }, OPENAI_CONNECT_TIMEOUT_MS);

    socket.on("open", () => {
      if (this.openTimeout) clearTimeout(this.openTimeout);
      const call = this.call;
      if (!call) {
        void this.finish("failed", "call_context_missing");
        return;
      }
      sendJson(socket, buildRealtimeSessionUpdate(call.agent));
    });
    socket.on("message", (raw, isBinary) => {
      if (isBinary) {
        console.error("[media-streams] OpenAI returned an unexpected binary message");
        void this.finish("failed", "openai_protocol_error");
        return;
      }
      void this.handleOpenAIMessage(raw).catch((error: unknown) => {
        console.error("[media-streams] failed to process OpenAI event", error);
        void this.finish("failed", "openai_processing_error");
      });
    });
    socket.on("error", (error) => {
      console.error("[media-streams] OpenAI Realtime WebSocket error", error);
      void this.finish("failed", "openai_connection_error");
    });
    socket.on("close", () => {
      if (!this.finalized && !this.stopReceived && !this.expectedDisconnect) {
        void this.finish("failed", "openai_connection_closed");
      }
    });
  }

  private handleMedia(value: Record<string, unknown>): void {
    if (
      !this.started ||
      typeof value.streamSid !== "string" ||
      value.streamSid !== this.streamSid ||
      !isRecord(value.media) ||
      value.media.track !== "inbound" ||
      typeof value.media.payload !== "string"
    ) {
      return;
    }

    if (!this.openAiSocket || this.openAiSocket.readyState !== WebSocket.OPEN || !this.sessionReady) {
      if (this.queuedAudio.length >= MAX_BUFFERED_AUDIO_FRAMES) {
        console.error("[media-streams] OpenAI startup exceeded the inbound audio buffer");
        void this.finish("failed", "openai_startup_overrun");
        return;
      }
      this.queuedAudio.push(value.media.payload);
      return;
    }
    sendJson(this.openAiSocket, {
      type: "input_audio_buffer.append",
      audio: value.media.payload,
    });
  }

  private async handleOpenAIMessage(raw: RawData): Promise<void> {
    let event: unknown;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      throw new Error("OpenAI Realtime returned invalid JSON.");
    }
    if (!isRecord(event) || typeof event.type !== "string") {
      throw new Error("OpenAI Realtime returned an invalid event.");
    }

    switch (event.type) {
      case "session.updated":
        if (!this.sessionReady) {
          const socket = this.openAiSocket;
          if (!socket) return;
          this.sessionReady = true;
          this.flushQueuedAudio();
          sendJson(socket, { type: "response.create" });
        }
        break;
      case "response.audio.delta":
        if (typeof event.delta === "string" && this.streamSid) {
          sendJson(this.twilioSocket, {
            event: "media",
            streamSid: this.streamSid,
            media: { payload: event.delta },
          });
        }
        break;
      case "response.created":
        this.responseActive = true;
        break;
      case "input_audio_buffer.speech_started":
        sendJson(this.twilioSocket, { event: "clear", streamSid: this.streamSid });
        if (this.responseActive && this.openAiSocket) {
          sendJson(this.openAiSocket, { type: "response.cancel" });
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof event.transcript === "string") {
          this.queueTranscript("user", event.transcript);
        }
        break;
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
        if (typeof event.transcript === "string") {
          this.queueTranscript("assistant", event.transcript);
        }
        break;
      case "response.function_call_arguments.done":
        this.queueToolCall(event);
        break;
      case "response.done":
        this.responseActive = false;
        await this.flushToolCalls();
        break;
      case "error": {
        const error = isRecord(event.error) ? event.error : {};
        console.error("[media-streams] OpenAI Realtime returned an error", {
          code: error.code,
          type: error.type,
        });
        void this.finish("failed", "openai_realtime_error");
        break;
      }
    }
  }

  private flushQueuedAudio(): void {
    const socket = this.openAiSocket;
    if (!socket) return;
    for (const audio of this.queuedAudio.splice(0)) {
      sendJson(socket, { type: "input_audio_buffer.append", audio });
    }
  }

  private queueTranscript(role: "user" | "assistant", content: string): void {
    const call = this.call;
    if (!call || !content.trim()) return;
    this.transcriptQueue = this.transcriptQueue
      .then(() => appendTranscript(this.db, { callId: call.call.id, role, content }))
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error(`[media-streams] failed to save ${role} transcript`, error);
      });
  }

  private queueToolCall(event: Record<string, unknown>): void {
    const call = this.call;
    const functionName = event.name;
    const functionCallId = event.call_id;
    const rawArguments = event.arguments;
    if (
      !call ||
      typeof functionName !== "string" ||
      typeof functionCallId !== "string" ||
      typeof rawArguments !== "string"
    ) {
      console.error("[media-streams] OpenAI returned an incomplete function call");
      return;
    }

    const execution = (async () => {
      let rawInput: unknown;
      try {
        rawInput = JSON.parse(rawArguments);
      } catch {
        this.sendToolOutput(functionCallId, { error: "Invalid function arguments." });
        return;
      }

      const result = await executeTool(this.db, {
        toolName: functionName,
        rawInput,
        context: {
          organizationId: call.call.organizationId,
          agentId: call.call.agentId,
          callId: call.call.id,
        },
      });
      if (result.success && result.outcome === "transferred_to_human") {
        this.expectedDisconnect = true;
      }

      const output =
        result.success
          ? result.data
          : result.error.startsWith('Unknown tool "')
            ? `Unknown function: ${functionName}`
            : { error: result.error };

      this.sendToolOutput(functionCallId, output);
    })();
    this.pendingToolCalls.push(execution);
  }

  private sendToolOutput(callId: string, output: unknown): void {
    if (!this.openAiSocket) return;
    sendJson(this.openAiSocket, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    });
  }

  private async flushToolCalls(): Promise<void> {
    if (this.pendingToolCalls.length === 0) return;
    const socket = this.openAiSocket;
    if (!socket) return;
    const executions = this.pendingToolCalls.splice(0);
    await Promise.all(executions);
    if (!this.expectedDisconnect) {
      sendJson(socket, { type: "response.create" });
    }
  }

  private rejectStream(reason: string): void {
    console.warn(`[media-streams] rejected stream: ${reason}`);
    if (this.twilioSocket.readyState === WebSocket.OPEN) {
      this.twilioSocket.close(1008, "Stream is not authorized.");
    }
  }

  private async finish(
    status: "completed" | "failed",
    reason: string,
  ): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    if (this.openTimeout) clearTimeout(this.openTimeout);
    await this.transcriptQueue;

    if (this.call) {
      try {
        await finishRealtimeMediaStreamCall(this.db, {
          callId: this.call.call.id,
          status,
          reason,
        });
      } catch (error) {
        console.error("[media-streams] failed to finalize call state", error);
      }
    }

    if (this.openAiSocket && this.openAiSocket.readyState < WebSocket.CLOSING) {
      this.openAiSocket.close();
    }
    if (this.twilioSocket.readyState < WebSocket.CLOSING) {
      this.twilioSocket.close(status === "completed" ? 1000 : 1011);
    }
  }
}
