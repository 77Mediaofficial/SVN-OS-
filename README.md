# SVN OS — Creator Dashboard

A centralized web application for digital creators to manage content, brand deals, scheduling, and finances in one place.

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (ES modules)
- **Backend & Auth:** Supabase (PostgreSQL + Auth)
- **Deployment:** Vercel

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL in `sql/schema.sql` in your Supabase SQL Editor
3. Update `js/supabase.js` with your project URL and anon key

### 2. Local Development

Serve the project with any static file server:

```bash
npx serve .
```

### 3. Deploy to Vercel

Connect this repository to Vercel. The `vercel.json` handles SPA routing automatically.

## Project Structure

```
├── index.html          # App shell with navigation
├── vercel.json         # Vercel deployment config
├── css/main.css        # Design system and global styles
├── js/
│   ├── supabase.js     # Supabase client singleton
│   ├── router.js       # SPA router (History API)
│   ├── auth.js         # Authentication and session handling
│   └── modules/        # Per-view logic
├── pages/              # HTML partials loaded by router
└── sql/schema.sql      # Database schema for Supabase
```
