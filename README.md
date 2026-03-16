# brittle

A personal markdown notes app backed by GitHub, deployable to Cloudflare Pages.

Write notes in the browser. They're saved as `.md` files in a private GitHub repo — version-controlled, agent-readable, and yours.

## Features

- **GitHub-backed storage** — notes live as markdown files in a private repo, committed on every save
- **GitHub OAuth** — single-user auth, only your account can log in
- **[[Wiki-links]]** — link between notes, click to navigate, broken links shown in red
- **Backlinks** — see which notes link to the current one
- **Full-text search** — searches across all notes via GitHub Search API
- **Tags** — `#tag` inline or YAML frontmatter, filterable in the sidebar
- **Folders** — create notes with `folder/note-title` syntax, grouped in the sidebar
- **Graph view** — force-directed canvas graph of all notes and their connections
- **Image paste** — paste an image directly into the editor; uploads to the repo and inserts a markdown link
- **Document import** — upload `.docx`, `.pdf`, `.txt`, or `.md` files; converted to markdown in the browser
- **Cloudflare Pages** — deploys to the edge, no server required

## Stack

- [Next.js 15](https://nextjs.org) (App Router, edge runtime)
- [Auth.js v5](https://authjs.dev) — GitHub OAuth
- [Cloudflare Pages](https://pages.cloudflare.com) via [`@cloudflare/next-on-pages`](https://github.com/cloudflare/next-on-pages)
- [GitHub REST API](https://docs.github.com/en/rest) — notes storage
- [mammoth](https://github.com/mwilliamson/mammoth.js) + [turndown](https://github.com/mixmark-io/turndown) — Word → Markdown
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF text extraction

## Setup

### 1. Create a notes repo

Create a **private** GitHub repo (e.g. `your-username/notes`). Leave it empty.

### 2. GitHub OAuth App

Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**

| Field | Value |
|-------|-------|
| Homepage URL | `http://localhost:3000` (update after deploying) |
| Callback URL | `http://localhost:3000/api/auth/callback/github` |

Copy the **Client ID** and **Client Secret**.

### 3. Fine-grained PAT

Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Fine-grained tokens** → **Generate new token**

- **Repository access**: Only select repositories → pick your notes repo
- **Permissions**: Contents (Read and Write), Metadata (Read-only)

### 4. Local development

```bash
cp .env.local.example .env.local
# fill in all values
npm install
npm run dev
```

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 5. Deploy to Cloudflare Pages

**First time — set secrets:**
```bash
wrangler login

wrangler pages secret put AUTH_GITHUB_ID     --project-name=brittle
wrangler pages secret put AUTH_GITHUB_SECRET --project-name=brittle
wrangler pages secret put AUTH_SECRET        --project-name=brittle
wrangler pages secret put GITHUB_USERNAME    --project-name=brittle
wrangler pages secret put GITHUB_PAT         --project-name=brittle
wrangler pages secret put GITHUB_OWNER       --project-name=brittle
wrangler pages secret put GITHUB_REPO        --project-name=brittle
```

**Deploy:**
```bash
./deploy.sh
# or: ./deploy.sh my-project-name
```

After deploying, add your production URL to the GitHub OAuth App's callback URL:
```
https://brittle.pages.dev/api/auth/callback/github
```

## Note format

Notes are stored as plain markdown files in your `notes/` repo under a `notes/` subfolder.

**Frontmatter tags:**
```markdown
---
tags: work, ideas, personal
---

# My Note

Content here. You can also use #inline-tags.
```

**Wiki-links:**
```markdown
See also [[another-note]] or [[folder/nested-note]].
```

**Folders** — create a note with a `/` in the title, e.g. `work/meeting-notes`.

## Agent access

To give an AI agent read/write access to your notes, create a separate fine-grained PAT scoped to the notes repo and pass it the repo path:

```
owner: your-username
repo: notes
path: notes/        ← all note files live here
```

## License

MIT
