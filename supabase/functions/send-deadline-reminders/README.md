# send-deadline-reminders

Daily digest email that lists every brand deal whose deadline falls within
the next 3 days. One email per creator. Skips users with no upcoming deals.

## Why an external cron

Supabase edge functions don't have a built-in scheduler in every plan. The
function is gated by a shared `CRON_SECRET` so any external scheduler can
trigger it safely — Vercel Cron, GitHub Actions, cron-job.org, or Supabase
scheduled functions if available on your plan.

## Setup

```bash
# 1. Set secrets
supabase secrets set CRON_SECRET=$(openssl rand -hex 32) --project-ref vtvniushkftodhlvdkom
supabase secrets set RESEND_API_KEY=re_... --project-ref vtvniushkftodhlvdkom
supabase secrets set REMINDER_FROM_EMAIL="SVN OS <reminders@yourdomain.com>" --project-ref vtvniushkftodhlvdkom
supabase secrets set APP_HOST=svn-os.vercel.app --project-ref vtvniushkftodhlvdkom

# 2. Deploy
supabase functions deploy send-deadline-reminders \
  --project-ref vtvniushkftodhlvdkom \
  --no-verify-jwt

# 3. Schedule a daily call (example: GitHub Actions, every day at 14:00 UTC)
```

`.github/workflows/deadline-reminders.yml`:

```yaml
name: SVN OS — daily deadline reminders
on:
  schedule:
    - cron: '0 14 * * *'
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger reminders
        run: |
          curl -sS -X POST \
            "https://vtvniushkftodhlvdkom.supabase.co/functions/v1/send-deadline-reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Domain setup for Resend

Resend requires a verified sending domain. Once you've added DNS records
in Resend, set `REMINDER_FROM_EMAIL` to a mailbox at that domain.

## Response

```json
{ "sent": 3, "failures": [], "total_users": 3 }
```
