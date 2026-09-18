import { registerTool } from "@/server/tools/registry";
import { getCustomerTool } from "@/server/tools/definitions/get-customer";
import { createCustomerTool } from "@/server/tools/definitions/create-customer";
import { checkAvailabilityTool } from "@/server/tools/definitions/check-availability";
import { bookAppointmentTool } from "@/server/tools/definitions/book-appointment";
import { createJobTool } from "@/server/tools/definitions/create-job";
import { sendSmsTool } from "@/server/tools/definitions/send-sms";
import { transferCallTool } from "@/server/tools/definitions/transfer-call";

let registered = false;

/**
 * Idempotent on purpose — both the Vapi events webhook (to execute a
 * tool call) and the assistant-sync action (to build the Vapi `tools`
 * array) import this, and either could run first within the same
 * process. This is the complete, fixed list of tools an agent can use;
 * adding a new one means adding a file here, not a runtime/dashboard
 * configuration option.
 */
export function ensureToolsRegistered(): void {
  if (registered) return;
  registerTool(getCustomerTool);
  registerTool(createCustomerTool);
  registerTool(checkAvailabilityTool);
  registerTool(bookAppointmentTool);
  registerTool(createJobTool);
  registerTool(sendSmsTool);
  registerTool(transferCallTool);
  registered = true;
}
