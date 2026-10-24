import { db } from "@/db";
import {
  isAdminAuthConfigured,
  verifyAdminCredentials,
} from "@/server/admin/auth";
import { listDemoRequests } from "@/server/services/demo-request.service";

/**
 * The landing-page lead inbox.
 *
 * These leads are global (not workspace-scoped), so this route uses
 * HTTP Basic auth rather than the workspace membership model the rest
 * of the app uses. It is a Route Handler (not a page) because Basic
 * auth needs a real 401 response with a `WWW-Authenticate` challenge
 * — a React page cannot return one.
 *
 * The route returns 404 when admin credentials are not configured, so
 * a deployment without them has no lead inbox rather than an open
 * one.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAdminAuthConfigured()) {
    return new Response("Not found.", { status: 404 });
  }

  const credentials = verifyAdminCredentials(request.headers.get("authorization"));
  if (credentials !== true) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Voice Agent Platform"',
      },
    });
  }

  const demoRequests = await listDemoRequests(db, { limit: 200 });

  return new Response(renderDemoRequests(demoRequests), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDemoRequests(
  requests: Awaited<ReturnType<typeof listDemoRequests>>,
): string {
  const body =
    requests.length === 0
      ? `<p class="empty">No requests yet. Leads submitted through the landing page form will appear here.</p>`
      : requests
          .map(
            (request) => `
        <article class="lead">
          <header>
            <div>
              <h2>${escapeHtml(request.name)}</h2>
              <p class="contact">
                <a href="mailto:${escapeHtml(request.email)}">${escapeHtml(request.email)}</a>
                ${request.company ? ` · ${escapeHtml(request.company)}` : ""}
                ${request.phone ? ` · ${escapeHtml(request.phone)}` : ""}
              </p>
            </div>
            <div class="meta">
              <span class="status">${escapeHtml(request.status)}</span>
              <span>${request.createdAt.toISOString().slice(0, 10)}</span>
            </div>
          </header>
          ${
            request.callVolume
              ? `<p><strong>Call volume:</strong> ${escapeHtml(request.callVolume.replace(/_/g, " "))}</p>`
              : ""
          }
          ${request.useCase ? `<p><strong>Use case:</strong> ${escapeHtml(request.useCase)}</p>` : ""}
          ${request.message ? `<p><strong>Message:</strong> ${escapeHtml(request.message)}</p>` : ""}
        </article>`,
          )
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Demo requests</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1rem;
    background: #faf9f7; color: #191b1f;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.5;
  }
  main { max-width: 52rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; }
  h1 { font-size: 1.35rem; margin: 0; }
  .sub { color: #6b6f76; font-size: 0.9rem; margin: 0.25rem 0 0; }
  .lead {
    background: #fff; border: 1px solid #e6e4e0; border-radius: 0.5rem;
    padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;
  }
  .lead header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .lead h2 { font-size: 1rem; margin: 0; }
  .contact { margin: 0.15rem 0 0; color: #6b6f76; font-size: 0.875rem; }
  .contact a { color: #0f766e; }
  .meta { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; color: #6b6f76; }
  .status { background: rgba(0,0,0,0.06); border-radius: 999px; padding: 0.15rem 0.6rem; }
  .lead p { margin: 0; font-size: 0.9rem; color: #6b6f76; }
  .empty { color: #6b6f76; font-size: 0.9rem; }
</style>
</head>
<body>
  <main>
    <div>
      <h1>Demo requests</h1>
      <p class="sub">${requests.length} lead${requests.length === 1 ? "" : "s"} from the public landing page, newest first.</p>
    </div>
    ${body}
  </main>
</body>
</html>`;
}
