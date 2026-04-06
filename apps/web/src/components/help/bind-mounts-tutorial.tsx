import Link from "next/link";

import { DOCS_BIND_MOUNTS_URL } from "@/lib/dashboard-content";

/**
 * In-app tutorial: Docker bind mount + Settings allowlist.
 * Mirrors docs/bind-mounts.md.
 */
export function BindMountsTutorial() {
  return (
    <section id="bind-mounts" className="scroll-mt-8 space-y-6">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Bind mounts &amp; local folders
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Two steps: (1) mount a host folder into the API container with Docker, (2) register the{" "}
          <strong>container path</strong> under Settings → Storage → Local path.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
        <p className="font-medium text-foreground">What does what</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            <strong className="text-foreground">Compose / Docker</strong> — defines host → container
            paths (e.g. <code className="font-mono text-xs">E:/Star Wars:/mnt/star-wars</code>).
          </li>
          <li>
            <strong className="text-foreground">Settings → Local path</strong> — allowlists paths
            inside SQLite for import + “Local bind” output. Does not change Docker.
          </li>
        </ul>
      </div>

      <div className="space-y-3 text-sm">
        <h3 className="font-medium text-foreground">1. Add a bind mount</h3>
        <p className="text-muted-foreground">
          Add a <code className="font-mono text-xs">volumes</code> line under{" "}
          <code className="font-mono text-xs">services.api</code>. Prefer{" "}
          <code className="font-mono text-xs">docker-compose.override.yml</code> (merged with{" "}
          <code className="font-mono text-xs">docker-compose.yml</code> for production) or the same pattern
          when using <code className="font-mono text-xs">docker-compose.dev.yml</code> for development.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs">
          {`# docker-compose.override.yml
services:
  api:
    volumes:
      - E:/Star Wars:/mnt/star-wars:rw`}
        </pre>
        <p className="text-muted-foreground">
          Then recreate <strong>api</strong>: production{" "}
          <code className="font-mono text-xs">docker compose up -d --force-recreate api</code> —
          development{" "}
          <code className="font-mono text-xs">
            docker compose -f docker-compose.dev.yml up -d --force-recreate api
          </code>
        </p>
      </div>

      <div className="space-y-3 text-sm">
        <h3 className="font-medium text-foreground">2. Register in Settings</h3>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>
            Open <Link href="/settings">Settings</Link> → <strong>Storage</strong> →{" "}
            <strong>Local path</strong>.
          </li>
          <li>
            Enter the <strong>container</strong> path (e.g. <code className="font-mono text-xs">/mnt/star-wars</code>
            ), one per line. It must exist inside the container when you save.
          </li>
          <li>Click <strong>Save paths</strong>.</li>
        </ol>
      </div>

      <div className="space-y-3 text-sm">
        <h3 className="font-medium text-foreground">3. Use when starting a run</h3>
        <p className="text-muted-foreground">
          On a run in <strong>Ready</strong>, choose output <strong>Local path (bind mount)</strong>{" "}
          and set a destination directory under an allowlisted root (e.g.{" "}
          <code className="font-mono text-xs">/mnt/star-wars/exports</code>).
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Full reference:{" "}
        <a
          href={DOCS_BIND_MOUNTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          docs/bind-mounts.md
        </a>{" "}
        on GitHub.
      </p>
    </section>
  );
}
