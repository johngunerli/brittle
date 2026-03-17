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
cp .env.local.example .env
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

## Export notes to your blog

If your blog repo has a `data/posts.js` file shaped like:

```js
const posts = {
	'my-slug': { title, date, meta, tags, body: `<p>...</p>` },
};
```

You can export a note directly into that file from the editor via the **Export** button.

### Required env vars

Add these to `.env.local` (and Cloudflare Pages secrets/vars):

- `BLOG_GITHUB_OWNER` (e.g. `johngunerli`)
- `BLOG_GITHUB_REPO` (e.g. `johngunerli.com`)
- `BLOG_POSTS_PATH` (defaults to `data/posts.js`)

### Set the vars on Cloudflare Pages (production)

Your deployed site runs on Cloudflare’s edge, so it **won’t** see your local `.env.local` values.
You need to set the vars on your Pages project.

#### Option A: Cloudflare Dashboard (fastest)

Cloudflare → **Pages** → your project → **Settings** → **Environment variables**.

Add (at least in the **Production** environment):

- `BLOG_GITHUB_OWNER` = `johngunerli`
- `BLOG_GITHUB_REPO` = `johngunerli.com`
- `BLOG_POSTS_PATH` = `data/posts.js`

Then redeploy.

#### Option B: Wrangler CLI

1) Make sure you’re logged in:

```bash
npx wrangler login
```

1) Set the values.

Cloudflare Pages has both **secrets** (encrypted) and **plain vars**.
These `BLOG_*` values aren’t sensitive, so plain vars are fine — but using secrets is also OK.

If you want secrets:

```bash
npx wrangler pages secret put BLOG_GITHUB_OWNER --project-name=brittle
npx wrangler pages secret put BLOG_GITHUB_REPO  --project-name=brittle
npx wrangler pages secret put BLOG_POSTS_PATH   --project-name=brittle
```

If you prefer plain (non-secret) vars, set them in the Dashboard instead (Wrangler’s support for non-secret Pages vars has changed over time).

1) Redeploy:

```bash
./deploy.sh brittle
```

### GitHub token permissions

Your `GITHUB_PAT` must have **Contents: Read/Write** on **both**:

- your notes repo
- your blog repo

If export still fails after setting the vars:

- Confirm `GITHUB_PAT` is set in Cloudflare Pages (it’s required for both reading notes and writing to the blog repo).
- Confirm the PAT has access to **both** repos (fine-grained tokens are repo-scoped).
- Confirm `BLOG_POSTS_PATH` points to the right file (default is `data/posts.js`).

## License

MIT
