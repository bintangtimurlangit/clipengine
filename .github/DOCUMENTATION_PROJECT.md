# Documentation site — GitHub Project

Use a [GitHub Project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) to track work on the public documentation website until it ships. The web app reads **`NEXT_PUBLIC_DOCS_URL`** (see `apps/web/src/lib/dashboard-content.ts`); set that when the site has a stable URL.

## Create and link the project (GitHub CLI)

Requires the `project` scope: `gh auth refresh -s project` if `gh auth status` does not list it.

From your machine (replace the title if you prefer):

```bash
gh project create --owner "@me" --title "Clipengine documentation site"
```

Note the project **number** from the command output or:

```bash
gh project list --owner "@me" --limit 5
```

Link the project to this repository (run from the `clipengine` repo root; replace `NUMBER`):

```bash
gh project link NUMBER --owner "@me" --repo clipengine
```

Open the board in the browser:

```bash
gh project view NUMBER --owner "@me" --web
```

## Seed draft items (optional)

Create backlog drafts you can later convert to issues (replace `NUMBER`):

```bash
gh project item-create NUMBER --owner "@me" \
  --title "Choose stack (e.g. VitePress, Docusaurus, Nextra) and repo" \
  --body "Decide static site generator, hosting (GitHub Pages / Cloudflare / Vercel), and custom domain."

gh project item-create NUMBER --owner "@me" \
  --title "Migrate content from docs/*.md" \
  --body "Structure sections: pipeline, Docker, configuration, bind mounts, architecture. Preserve deep links where possible."

gh project item-create NUMBER --owner "@me" \
  --title "Set NEXT_PUBLIC_DOCS_URL in web deployment" \
  --body "Point production and staging builds at the live docs URL once DNS is ready."

gh project item-create NUMBER --owner "@me" \
  --title "Search and 404 strategy" \
  --body "Add Algolia or built-in search; friendly 404 and redirect from old GitHub blob links if needed."
```

## Manual checklist (if you skip the CLI)

- [ ] Create project **Clipengine documentation site** under your user or org.
- [ ] Link it to the **clipengine** repository.
- [ ] Add columns or use **Board** layout: *Backlog* → *In progress* → *Done* (or your usual workflow).
- [ ] Add the draft items above (or your own) and assign milestones as needed.
- [ ] When the docs URL is live, configure **`NEXT_PUBLIC_DOCS_URL`** for `apps/web` and redeploy.
