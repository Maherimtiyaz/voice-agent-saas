import * as z from "zod";

/**
 * Every Vapi server message is `{ message: { type, ... } }`. We only
 * strictly validate the fields Phase 1 actually reads, and use
 * `.passthrough()` everywhere else — Vapi documents that payloads can
 * gain fields over time, and validation should not break just because
 * an unrecognized one shows up (see Twilio's own equivalent guidance
 * about evolving webhook parameters — the same caution applies here).
 */
const callRefSchema = z.object({ id: z.string() }).passthrough();

export const vapiEnvelopeSchema = z.object({
  message: z.object({ type: z.string() }).passthrough(),
});

export const vapiStatusUpdateSchema = z.object({
  message: z
    .object({
      type: z.literal("status-update"),
      status: z.enum(["queued", "ringing", "in-progress", "forwarding", "ended"]),
      call: callRefSchema,
      timestamp: z.number().optional(),
    })
    .passthrough(),
});

export const vapiTranscriptSchema = z.object({
  message: z
    .object({
      type: z.literal("transcript"),
      role: z.enum(["user", "assistant"]),
      transcript: z.string(),
      transcriptType: z.enum(["partial", "final"]),
      call: callRefSchema,
    })
    .passthrough(),
});

export const vapiEndOfCallReportSchema = z.object({
  message: z
    .object({
      type: z.literal("end-of-call-report"),
      call: z
        .object({
          id: z.string(),
          status: z.string().optional(),
          endedReason: z.string().optional(),
        })
        .passthrough(),
      transcript: z.string().optional(),
      summary: z.string().optional(),
      durationSeconds: z.number().optional(),
      timestamp: z.number().optional(),
      analysis: z.object({ summary: z.string().optional() }).passthrough().optional(),
    })
    .passthrough(),
});

export const vapiToolCallsSchema = z.object({
  message: z
    .object({
      type: z.literal("tool-calls"),
      call: callRefSchema,
      toolCallList: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          parameters: z.unknown().optional(),
          arguments: z.unknown().optional(),
        }),
      ),
    })
    .passthrough(),
});

export type VapiEnvelope = z.infer<typeof vapiEnvelopeSchema>;
