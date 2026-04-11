/** Documentation URLs for in-app links. */

const REPO_DOCS_TREE =
  "https://github.com/bintangtimurlangit/clipengine/tree/main/docs";

/**
 * Public documentation website. Set `NEXT_PUBLIC_DOCS_URL` when the site is live; until then the
 * app falls back to the repository docs folder on GitHub.
 */
export const DOCS_SITE_URL =
  process.env.NEXT_PUBLIC_DOCS_URL?.trim() || REPO_DOCS_TREE;

export const DOCS_PIPELINE_URL =
  "https://github.com/bintangtimurlangit/clipengine/blob/main/docs/pipeline.md";

export const DOCS_BIND_MOUNTS_URL =
  "https://github.com/bintangtimurlangit/clipengine/blob/main/docs/bind-mounts.md";
