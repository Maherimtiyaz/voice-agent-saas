"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  removeAgentKnowledgeFileAction,
  uploadAgentKnowledgeFileAction,
  type KnowledgeFileActionState,
} from "@/app/actions/agent.actions";
import type { AgentKnowledgeFile } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Uploading…" : "Upload document"}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
      disabled={pending}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

function RemoveDocumentForm({
  agentId,
  file,
}: {
  agentId: string;
  file: AgentKnowledgeFile;
}) {
  const [state, formAction] = useActionState<
    KnowledgeFileActionState | undefined,
    FormData
  >(removeAgentKnowledgeFileAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="fileId" value={file.id} />
      <RemoveButton />
      {state?.message && <span className="text-xs text-danger">{state.message}</span>}
      {state?.success && <span className="text-xs text-accent">{state.success}</span>}
    </form>
  );
}

export function AgentKnowledgeBase({
  agentId,
  files,
}: {
  agentId: string;
  files: AgentKnowledgeFile[];
}) {
  const [state, formAction] = useActionState<
    KnowledgeFileActionState | undefined,
    FormData
  >(uploadAgentKnowledgeFileAction, undefined);

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-3">
      <div>
        <h2 className="text-sm font-medium text-foreground">Knowledge base</h2>
        <p className="mt-1 text-xs text-muted">
          Add agent-specific documents (up to 20, 300 KiB each). Sync the agent
          to refresh processing status and attach ready documents for calls.
        </p>
      </div>
      <form action={formAction} className="flex flex-col items-start gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="agentId" value={agentId} />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`knowledgeFile-${agentId}`}>Document</Label>
          <input
            id={`knowledgeFile-${agentId}`}
            name="file"
            type="file"
            accept=".csv,.doc,.docx,.json,.log,.md,.pdf,.tsv,.txt,.xml,.yaml,.yml"
            required
            className="max-w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-black/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
        </div>
        <UploadButton />
      </form>
      {state?.message && <p className="text-sm text-danger">{state.message}</p>}
      {state?.success && <p className="text-sm text-accent">{state.success}</p>}
      {files.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{file.name}</p>
                <p className="text-xs text-muted">
                  {(file.bytes / 1024).toFixed(1)} KiB ·{" "}
                  <span className="capitalize">{file.status}</span>
                </p>
              </div>
              <RemoveDocumentForm agentId={agentId} file={file} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
