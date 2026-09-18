import type { Metadata } from "next";
import { db } from "@/db";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentContext } from "@/server/auth/current-user";
import { listAgents } from "@/server/services/agent.service";
import { listPhoneNumbers } from "@/server/services/phone-number.service";
import { CreatePhoneNumberForm } from "./create-phone-number-form";
import { AssignAgentSelect } from "./assign-agent-select";

export const metadata: Metadata = {
  title: "Phone Numbers",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-accent/10 text-accent",
  inactive: "bg-black/[0.06] text-muted",
};

export default async function PhoneNumbersPage() {
  const { user, organizationId } = await requireCurrentContext();
  const [phoneNumbers, agents] = await Promise.all([
    listPhoneNumbers(db, { organizationId, userId: user.id }),
    listAgents(db, { organizationId, userId: user.id }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Phone Numbers</h1>
        <p className="text-sm text-muted">
          Register a Twilio number you own and assign it to an agent. See the
          README for the manual Twilio/Vapi setup this requires.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Register a phone number</CardTitle>
          <CardDescription>
            You&apos;ll need the Twilio number SID and, once you&apos;ve
            imported the number into Vapi, its Vapi phone number ID.
          </CardDescription>
        </CardHeader>
        <CreatePhoneNumberForm agents={agents} />
      </Card>

      {phoneNumbers.length === 0 ? (
        <Card className="items-center text-center">
          <CardHeader>
            <CardTitle>No phone numbers yet</CardTitle>
            <CardDescription>Register one above to get started.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {phoneNumbers.map((phoneNumber) => (
            <div
              key={phoneNumber.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{phoneNumber.e164Number}</p>
                <p className="font-mono text-xs text-muted">{phoneNumber.twilioNumberSid}</p>
                {!phoneNumber.vapiPhoneNumberId && (
                  <p className="mt-1 text-xs text-danger">Not yet imported into Vapi</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    STATUS_STYLES[phoneNumber.status] ?? STATUS_STYLES.active
                  }`}
                >
                  {phoneNumber.status}
                </span>
                <AssignAgentSelect
                  phoneNumberId={phoneNumber.id}
                  agents={agents}
                  currentAgentId={phoneNumber.agentId}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
