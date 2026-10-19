import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { agentKnowledgeFiles, organizationMembers, organizations, users } from "@/db/schema";
import {
  addAgentKnowledgeFile,
  createAgent,
  getAgentKnowledgeFile,
  listAgentKnowledgeFiles,
  removeAgentKnowledgeFile,
  setAgentKnowledgeFileStatus,
} from "@/server/services/agent.service";
import { NotFoundError } from "@/server/errors";
import { validateKnowledgeFile } from "@/server/validation/knowledge-base";

let db: TestDatabase;

async function createAgentForOrganization(name: string) {
  const [organization] = await db
    .insert(organizations)
    .values({ name, slug: `${name.toLowerCase()}-${crypto.randomUUID()}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      name: "Knowledge Base User",
      passwordHash: "x",
    })
    .returning();
  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: user.id,
    role: "member",
  });
  const agent = await createAgent(db, {
    organizationId: organization.id,
    userId: user.id,
    input: { name: "Support Agent" },
  });
  return { organization, user, agent };
}

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("agent knowledge base service", () => {
  it("stores documents scoped to an agent and refreshes processing status", async () => {
    const { organization, user, agent } = await createAgentForOrganization("Acme");
    const [file] = await db
      .insert(agentKnowledgeFiles)
      .values({
        organizationId: organization.id,
        agentId: agent.id,
        vapiFileId: "vapi-file-1",
        name: "company-faq.pdf",
        bytes: 1024,
      })
      .returning();

    expect(await listAgentKnowledgeFiles(db, {
      organizationId: organization.id,
      userId: user.id,
      agentId: agent.id,
    })).toEqual([file]);

    await setAgentKnowledgeFileStatus(db, {
      organizationId: organization.id,
      userId: user.id,
      agentId: agent.id,
      fileId: file.id,
      status: "done",
    });
    expect((await getAgentKnowledgeFile(db, {
      organizationId: organization.id,
      userId: user.id,
      agentId: agent.id,
      fileId: file.id,
    })).status).toBe("done");
  });

  it("does not expose another organization's knowledge documents", async () => {
    const { organization: ownerOrg, user: owner, agent } =
      await createAgentForOrganization("Owner");
    const { organization: otherOrg, user: other } =
      await createAgentForOrganization("Other");
    const [file] = await db
      .insert(agentKnowledgeFiles)
      .values({
        organizationId: ownerOrg.id,
        agentId: agent.id,
        vapiFileId: "vapi-private-file",
        name: "private.pdf",
        bytes: 100,
      })
      .returning();

    await expect(listAgentKnowledgeFiles(db, {
      organizationId: otherOrg.id,
      userId: other.id,
      agentId: agent.id,
    })).rejects.toBeInstanceOf(NotFoundError);

    await expect(getAgentKnowledgeFile(db, {
      organizationId: otherOrg.id,
      userId: other.id,
      agentId: agent.id,
      fileId: file.id,
    })).rejects.toBeInstanceOf(NotFoundError);
    expect(owner.id).not.toBe(other.id);
  });

  it("adds and removes a knowledge file using the tenant-scoped service", async () => {
    const { organization, user, agent } = await createAgentForOrganization("Acme");
    const file = await addAgentKnowledgeFile(db, {
      organizationId: organization.id,
      userId: user.id,
      agentId: agent.id,
      vapiFileId: "vapi-file-2",
      name: "handbook.txt",
      bytes: 2048,
      status: "processing",
    });

    await removeAgentKnowledgeFile(db, {
      organizationId: organization.id,
      userId: user.id,
      agentId: agent.id,
      fileId: file.id,
    });
    expect(await listAgentKnowledgeFiles(db, {
      organizationId: organization.id,
      userId: user.id,
      agentId: agent.id,
    })).toEqual([]);
  });
});

describe("knowledge file validation", () => {
  it("accepts a supported document within the size limit", () => {
    expect(validateKnowledgeFile({ name: "faq.pdf", size: 2 * 1024 })).toBeNull();
  });

  it("rejects unsupported extensions, empty files, and files over 300 KiB", () => {
    expect(validateKnowledgeFile({ name: "voice.mp3", size: 1024 })).toContain("supported");
    expect(validateKnowledgeFile({ name: "faq.txt", size: 0 })).toContain("1 byte");
    expect(validateKnowledgeFile({ name: "faq.txt", size: 300 * 1024 + 1 })).toContain("300 KiB");
  });
});
