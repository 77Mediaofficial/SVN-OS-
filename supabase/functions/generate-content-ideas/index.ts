import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "claude-sonnet-4-6";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({
      error:
        "AI ideas are not configured. Set the ANTHROPIC_API_KEY secret on the generate-content-ideas function.",
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Not authenticated" }, 401);
  }

  let body: { niche?: string; platform?: string } = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  // Pull recent projects to give Claude useful context.
  const { data: recent } = await supabase
    .from("content_projects")
    .select("title, description, platform, status, tags")
    .order("updated_at", { ascending: false })
    .limit(30);

  const recentSummary = (recent || []).map((p) => ({
    title: p.title,
    description: (p.description || "").slice(0, 200),
    platform: p.platform,
    status: p.status,
    tags: p.tags || [],
  }));

  const niche = (body.niche || "").slice(0, 200);
  const platformHint = (body.platform || "").slice(0, 40);

  const systemPrompt =
    `You are a senior content strategist helping an independent digital creator brainstorm new content ideas. The creator manages their pipeline in SVN OS, a dashboard that tracks ideas through scripting, production, ready, and posted stages.

You will receive context about the creator's recent and in-progress content. Generate FIVE distinct new content ideas that:
- Build on themes that are clearly working but introduce a fresh angle (don't repeat existing titles).
- Span a variety of formats and platforms relative to what the creator already uses.
- Are specific enough to act on immediately — a real title, not a category.
- Include a brief one-sentence hook in the description.

Return ONLY valid JSON in this exact shape, no preamble, no markdown fences:
{
  "ideas": [
    { "title": "...", "description": "...", "platform": "youtube|tiktok|instagram|twitter|linkedin|podcast|blog|other" }
  ]
}`;

  const userMessage = JSON.stringify({
    niche: niche || null,
    platform_preference: platformHint || null,
    recent_content: recentSummary,
  });

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch (err) {
    return json({ error: `Anthropic request failed: ${String(err)}` }, 502);
  }

  if (!resp.ok) {
    const text = await resp.text();
    return json({
      error: `Anthropic API error (${resp.status})`,
      detail: text.slice(0, 500),
    }, 502);
  }

  const data = await resp.json();
  const text = (data.content || [])
    .map((b: { type: string; text?: string }) => b.text || "")
    .join("")
    .trim();

  let parsed: {
    ideas?: Array<{ title: string; description: string; platform?: string }>;
  } = {};
  try {
    // Be lenient — strip code fences if the model added them.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return json(
      { error: "Could not parse model response", raw: text.slice(0, 500) },
      502,
    );
  }

  const ideas = Array.isArray(parsed.ideas)
    ? parsed.ideas
      .filter((i) => i && typeof i.title === "string")
      .slice(0, 5)
    : [];

  return json({ ideas });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
