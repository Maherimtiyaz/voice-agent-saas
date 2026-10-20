import "server-only";

const SUMMARY_MAX_CHARS = 1200;
const TRANSCRIPT_MAX_CHARS = 30_000;
const SUMMARY_TIMEOUT_MS = 5_000;

export interface HandoffTranscriptLine {
  role: "user" | "assistant" | "system";
  content: string;
}

function transcriptFallback(
  lines: HandoffTranscriptLine[],
  reason: string | undefined,
): string {
  const recentConversation = lines
    .filter((line) => line.role === "user" || line.role === "assistant")
    .slice(-6)
    .map((line) => `${line.role === "user" ? "Caller" : "Assistant"}: ${line.content.trim()}`)
    .join(" ");
  const context = recentConversation || "No transcript was captured before the transfer.";
  const reasonContext = reason?.trim() ? ` Caller requested help with: ${reason.trim()}.` : "";
  return `Transcript context (automatic summary unavailable): ${context}${reasonContext}`.slice(
    0,
    SUMMARY_MAX_CHARS,
  );
}

export async function summarizeCallForHandoff(
  lines: HandoffTranscriptLine[],
  reason?: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[handoff] OPENAI_API_KEY is missing; using transcript context instead");
    return transcriptFallback(lines, reason);
  }

  const transcript = lines
    .map((line) => `${line.role}: ${line.content}`)
    .join("\n")
    .slice(-TRANSCRIPT_MAX_CHARS);
  const userContext = reason?.trim()
    ? `The caller's stated reason for requesting a person was: ${reason.trim()}\n\n`
    : "";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_HANDOFF_SUMMARY_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Write a concise handoff briefing for a human call agent in no more than 90 words. State the caller's goal, key facts and any unresolved question. Do not invent details. Use plain speech suitable to be read aloud privately to the human recipient.",
          },
          {
            role: "user",
            content: `${userContext}Conversation transcript:\n${transcript || "(No transcript captured yet.)"}`,
          },
        ],
        max_tokens: 180,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`OpenAI handoff summary returned HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("choices" in payload) ||
      !Array.isArray(payload.choices)
    ) {
      throw new Error("OpenAI returned an invalid handoff summary response.");
    }
    const first = payload.choices[0];
    if (
      typeof first !== "object" ||
      first === null ||
      !("message" in first) ||
      typeof first.message !== "object" ||
      first.message === null ||
      !("content" in first.message) ||
      typeof first.message.content !== "string" ||
      !first.message.content.trim()
    ) {
      throw new Error("OpenAI returned an empty handoff summary.");
    }
    return first.message.content.trim().slice(0, SUMMARY_MAX_CHARS);
  } catch (error) {
    console.error("[handoff] failed to generate AI summary; using transcript context", error);
    return transcriptFallback(lines, reason);
  }
}
