# generate-content-ideas

Edge function that calls Claude to brainstorm 5 new content ideas based on
the user's recent projects.

## Deploy

```bash
# 1. Set the Anthropic key once (only the project owner needs to do this)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... \
  --project-ref vtvniushkftodhlvdkom

# 2. Deploy the function
supabase functions deploy generate-content-ideas \
  --project-ref vtvniushkftodhlvdkom
```

The function expects a Supabase JWT in the `Authorization` header. The
client uses `db.functions.invoke('generate-content-ideas', { body: { niche?, platform? } })`
which forwards the user's session automatically.

## Returns

```json
{
  "ideas": [
    { "title": "...", "description": "...", "platform": "youtube" }
  ]
}
```

If `ANTHROPIC_API_KEY` is not set, the function returns HTTP 503 with a
clear error message — the UI surfaces it as a toast and disables the
"Generate ideas" button gracefully.
