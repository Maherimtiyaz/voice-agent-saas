"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireCurrentContext } from "@/server/auth/current-user";
import { AppError } from "@/server/errors";
import {
  assignAgentToPhoneNumber,
  createPhoneNumber,
} from "@/server/services/phone-number.service";
import { assignAgentSchema, createPhoneNumberSchema } from "@/server/validation/phone-number";

export interface PhoneNumberFormState {
  success?: boolean;
  errors?: Record<string, string[]>;
  message?: string;
}

export async function createPhoneNumberAction(
  _prevState: PhoneNumberFormState | undefined,
  formData: FormData,
): Promise<PhoneNumberFormState> {
  const validated = createPhoneNumberSchema.safeParse({
    twilioNumberSid: formData.get("twilioNumberSid"),
    e164Number: formData.get("e164Number"),
    vapiPhoneNumberId: formData.get("vapiPhoneNumberId"),
    agentId: formData.get("agentId"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext();

  try {
    await createPhoneNumber(db, { organizationId, userId: user.id, input: validated.data });
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message };
    }
    throw error;
  }

  revalidatePath("/phone-numbers");
  return { success: true };
}

export async function assignAgentToPhoneNumberAction(formData: FormData): Promise<void> {
  const validated = assignAgentSchema.safeParse({
    phoneNumberId: formData.get("phoneNumberId"),
    agentId: formData.get("agentId"),
  });
  if (!validated.success) return;

  const { user, organizationId } = await requireCurrentContext();

  await assignAgentToPhoneNumber(db, {
    organizationId,
    userId: user.id,
    phoneNumberId: validated.data.phoneNumberId,
    agentId: validated.data.agentId,
  });

  revalidatePath("/phone-numbers");
}
