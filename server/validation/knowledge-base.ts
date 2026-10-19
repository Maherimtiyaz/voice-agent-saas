export const MAX_KNOWLEDGE_FILE_BYTES = 300 * 1024;
export const MAX_KNOWLEDGE_FILES_PER_AGENT = 20;

const ALLOWED_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "json",
  "log",
  "md",
  "pdf",
  "tsv",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

export function validateKnowledgeFile(file: { name: string; size: number }): string | null {
  const safeName = file.name.split(/[\\/]/).pop() ?? "";
  const extension = safeName.split(".").pop()?.toLowerCase();

  if (!safeName || safeName.length > 160 || !extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return "Choose a supported document (PDF, DOCX, TXT, CSV, Markdown, or structured text).";
  }
  if (file.size <= 0 || file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return "Each document must be between 1 byte and 300 KiB.";
  }
  return null;
}
