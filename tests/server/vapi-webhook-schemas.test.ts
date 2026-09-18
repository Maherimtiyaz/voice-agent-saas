import { describe, expect, it } from "vitest";
import {
  vapiEndOfCallReportSchema,
  vapiEnvelopeSchema,
  vapiStatusUpdateSchema,
  vapiTranscriptSchema,
} from "@/server/integrations/vapi/webhook-schemas";

describe("Vapi webhook payload validation", () => {
  it("accepts a well-formed envelope", () => {
    const result = vapiEnvelopeSchema.safeParse({ message: { type: "status-update" } });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with no message field", () => {
    const result = vapiEnvelopeSchema.safeParse({ notMessage: true });
    expect(result.success).toBe(false);
  });

  it("rejects a payload that isn't an object at all", () => {
    expect(vapiEnvelopeSchema.safeParse("just a string").success).toBe(false);
    expect(vapiEnvelopeSchema.safeParse(null).success).toBe(false);
  });

  it("parses a valid status-update message and ignores unknown extra fields", () => {
    const result = vapiStatusUpdateSchema.safeParse({
      message: {
        type: "status-update",
        status: "in-progress",
        call: { id: "call-1" },
        somethingVapiAddsLater: "should not break parsing",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a status-update with an unrecognized status value", () => {
    const result = vapiStatusUpdateSchema.safeParse({
      message: { type: "status-update", status: "not-a-real-status", call: { id: "call-1" } },
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid transcript message", () => {
    const result = vapiTranscriptSchema.safeParse({
      message: {
        type: "transcript",
        role: "user",
        transcript: "I need help with my order",
        transcriptType: "final",
        call: { id: "call-1" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a transcript message missing required fields", () => {
    const result = vapiTranscriptSchema.safeParse({
      message: { type: "transcript", call: { id: "call-1" } },
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid end-of-call-report", () => {
    const result = vapiEndOfCallReportSchema.safeParse({
      message: {
        type: "end-of-call-report",
        call: { id: "call-1", endedReason: "customer-ended-call" },
        durationSeconds: 42,
        summary: "Customer asked about order status.",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end-of-call-report missing the call object", () => {
    const result = vapiEndOfCallReportSchema.safeParse({
      message: { type: "end-of-call-report" },
    });
    expect(result.success).toBe(false);
  });
});
