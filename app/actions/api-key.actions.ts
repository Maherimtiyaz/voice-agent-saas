"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import { requireCurrentContext } from "@/server/auth/current-user";
import {
  createApiKey,
  revokeApiKey,
} from "@/server/services/api-key.service";

const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Enter a name for this key.").max(80),
});

export interface ApiKeyActionState {
  key?: { id: string; name: string; keyPrefix: string };
  token?: string;
  errors?: Record<string, string[]>;
  message?: string;
}

export async function createWorkspaceApiKeyAction(
  _prevState: ApiKeyActionState | undefined,
  formData: FormData,
): Promise<ApiKeyActionState> {
  const validated = createApiKeySchema.safeParse({ name: formData.get("name") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const { user, organizationId } = await requireCurrentContext(["owner", "admin"]);
  const created = await createApiKey(db, {
    organizationId,
    userId: user.id,
    name: validated.data.name,
  });

  revalidatePath("/settings");
  return {
    key: {
      id: created.key.id,
      name: created.key.name,
      keyPrefix: created.key.keyPrefix,
    },
    token: created.token,
  };
}

export async function revokeWorkspaceApiKeyAction(formData: FormData): Promise<void> {
  const apiKeyId = formData.get("apiKeyId");
  if (typeof apiKeyId !== "string" || !z.string().uuid().safeParse(apiKeyId).success) {
    throw new Error("Invalid API key id.");
  }

  const { user, organizationId } = await requireCurrentContext(["owner", "admin"]);
  await revokeApiKey(db, { organizationId, userId: user.id, apiKeyId });

  revalidatePath("/settings");
}
