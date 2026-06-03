/**
 * SVN OS — send-deadline-reminders
 *
 * Sends a daily digest email to each creator listing brand deals whose
 * deadlines fall within the next 3 days.
 *
 * Invoked by an external cron (Vercel Cron, GitHub Actions, cron-job.org,
 * Supabase scheduled functions, etc.) once per day. The caller must
 * include the shared CRON_SECRET as a bearer token — there is no JWT
 * verification because the request is server-to-server.
 *
 * Required secrets (set via `supabase secrets set`):
 *   - SUPABASE_URL           (auto-provisioned)
 *   - SUPABASE_SERVICE_ROLE_KEY  (auto-provisioned; required to read
 *     across users and look up email addresses in auth.users)
 *   - RESEND_API_KEY         (https://resend.com — used to send email)
 *   - REMINDER_FROM_EMAIL    e.g. "SVN OS <reminders@yourdomain.com>"
 *   - CRON_SECRET            a long random string the caller sends as
 *     Authorization: Bearer <secret>
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WINDOW_DAYS = 3;

interface Deal {
  id: string;
  user_id: string;
  brand_name: string;
  status: string;
  value: number | null;
  deadline: string;
  deliverables: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return json({ error: "CRON_SECRET not configured" }, 503);
  }
  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REMINDER_FROM_EMAIL");
  if (!supabaseUrl || !serviceKey || !resendKey || !fromEmail) {
    return json({
      error:
        "Missing one of: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REMINDER_FROM_EMAIL",
    }, 503);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Find deals with deadlines in [today, today+WINDOW_DAYS] that aren't
  // already completed or lost.
  const today = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + WINDOW_DAYS);

  const { data: deals, error: dealsErr } = await admin
    .from("brand_deals")
    .select("id, user_id, brand_name, status, value, deadline, deliverables")
    .gte("deadline", isoDate(today))
    .lte("deadline", isoDate(horizon))
    .in("status", ["lead", "negotiating", "signed", "in_progress"]);

  if (dealsErr) {
    return json({ error: `Failed to fetch deals: ${dealsErr.message}` }, 500);
  }

  if (!deals || deals.length === 0) {
    return json({ sent: 0, message: "No deals approaching deadline" });
  }

  // Group by user.
  const byUser = new Map<string, Deal[]>();
  for (const d of deals as Deal[]) {
    const list = byUser.get(d.user_id) || [];
    list.push(d);
    byUser.set(d.user_id, list);
  }

  // Resolve user emails via the admin API.
  const emails: Array<{ userId: string; email: string; name: string; deals: Deal[] }> = [];
  for (const [userId, userDeals] of byUser.entries()) {
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
    if (userErr || !userData?.user?.email) continue;
    const email = userData.user.email;
    const name = (userData.user.user_metadata?.full_name as string) ||
      email.split("@")[0];
    emails.push({ userId, email, name, deals: userDeals });
  }

  let sent = 0;
  const failures: Array<{ email: string; error: string }> = [];

  for (const recipient of emails) {
    const html = buildDigestHtml(recipient.name, recipient.deals);
    const subject = `${recipient.deals.length} deadline${recipient.deals.length !== 1 ? "s" : ""} this week`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipient.email,
        subject,
        html,
      }),
    });

    if (resp.ok) {
      sent++;
    } else {
      const text = await resp.text();
      failures.push({ email: recipient.email, error: text.slice(0, 200) });
    }
  }

  return json({ sent, failures, total_users: emails.length });
});

function buildDigestHtml(name: string, deals: Deal[]): string {
  const rows = deals
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .map((d) => {
      const daysOut = daysBetween(new Date(), new Date(d.deadline + "T00:00:00"));
      const urgency = daysOut <= 0 ? "today" : daysOut === 1 ? "tomorrow" : `${daysOut} days`;
      const value = d.value ? `$${Number(d.value).toLocaleString("en-US")}` : "—";
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #222;color:#f0f0f0;">${escapeHtml(d.brand_name)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #222;color:#888;">${urgency}</td>
          <td style="padding:12px 16px;border-bottom:1px solid #222;color:#f0f0f0;text-align:right;font-variant-numeric:tabular-nums;">${value}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html><body style="background:#0a0a0a;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;color:#f0f0f0;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #222;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 28px 16px;">
      <div style="font-size:12px;color:#666;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">SVN OS</div>
      <h1 style="margin:0;font-size:22px;font-weight:300;color:#fff;">Heads up, ${escapeHtml(name)}</h1>
      <p style="margin:8px 0 0;color:#888;font-size:14px;">You have ${deals.length} brand deal${deals.length !== 1 ? "s" : ""} approaching a deadline.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${rows}
    </table>
    <div style="padding:20px 28px;border-top:1px solid #222;text-align:center;">
      <a href="https://${Deno.env.get("APP_HOST") || "your-app.vercel.app"}/deals" style="display:inline-block;padding:10px 20px;background:#fff;color:#0a0a0a;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">Open Deals & Ledger</a>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#444;margin-top:20px;">Sent by SVN OS deadline reminders. Reply to manage preferences.</p>
</body></html>`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
