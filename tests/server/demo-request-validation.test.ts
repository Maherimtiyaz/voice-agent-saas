import { describe, expect, it } from "vitest";
import { demoRequestSchema } from "@/server/validation/demo-request";
import { emailSchema } from "@/server/validation/email";

describe("email schema", () => {
  it("trims and lower-cases before checking the format", () => {
    const result = emailSchema().safeParse("  Jordan@Example.COM  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("jordan@example.com");
    }
  });

  it("still rejects something that is not an email", () => {
    expect(emailSchema().safeParse("not-an-email").success).toBe(false);
    expect(emailSchema().safeParse("").success).toBe(false);
    expect(emailSchema().safeParse("@example.com").success).toBe(false);
  });
});

describe("demo request validation", () => {
  it("accepts a minimal valid submission", () => {
    const result = demoRequestSchema.safeParse({
      name: "Jordan Reyes",
      email: "jordan@example.com",
      company: "",
      phone: "",
      useCase: "",
      callVolume: "",
      message: "",
      website: "",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = demoRequestSchema.safeParse({
      name: "",
      email: "jordan@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = demoRequestSchema.safeParse({
      name: "Jordan Reyes",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes the email to lower case", () => {
    const result = demoRequestSchema.safeParse({
      name: "Jordan Reyes",
      email: "  Jordan@Example.COM  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jordan@example.com");
    }
  });

  it("rejects an over-long field so one submission cannot be a data blob", () => {
    const result = demoRequestSchema.safeParse({
      name: "Jordan Reyes",
      email: "jordan@example.com",
      message: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a filled honeypot field", () => {
    const result = demoRequestSchema.safeParse({
      name: "Jordan Reyes",
      email: "jordan@example.com",
      website: "https://spam.example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty honeypot field", () => {
    const result = demoRequestSchema.safeParse({
      name: "Jordan Reyes",
      email: "jordan@example.com",
      website: "",
    });
    expect(result.success).toBe(true);
  });
});
