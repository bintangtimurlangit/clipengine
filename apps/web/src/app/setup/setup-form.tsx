"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { publicApiUrl } from "@/lib/api";

export default function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [llmProvider, setLlmProvider] = useState<"openai" | "anthropic">("openai");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState("");
  const [anthropicModel, setAnthropicModel] = useState(
    "claude-3-5-sonnet-20241022",
  );
  const [anthropicKey, setAnthropicKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        username: username.trim(),
        password,
        llm_provider: llmProvider,
      };
      if (tavilyKey.trim()) body.tavily_api_key = tavilyKey.trim();
      if (llmProvider === "openai") {
        if (openaiKey.trim()) body.openai_api_key = openaiKey.trim();
        if (openaiBaseUrl.trim()) body.openai_base_url = openaiBaseUrl.trim();
        if (openaiModel.trim()) body.openai_model = openaiModel.trim();
      } else {
        if (anthropicKey.trim()) body.anthropic_api_key = anthropicKey.trim();
        if (anthropicBaseUrl.trim())
          body.anthropic_base_url = anthropicBaseUrl.trim();
        if (anthropicModel.trim()) body.anthropic_model = anthropicModel.trim();
      }
      const res = await fetch(publicApiUrl("/api/setup/complete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          detail?: unknown;
        };
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? JSON.stringify(detail)
              : detail != null
                ? String(detail)
                : null;
        setError(msg ?? `Setup failed (${res.status})`);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not reach the API. Is it running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-6 rounded-xl border border-border bg-card/90 p-6 shadow-lg ring-1 ring-border/50 backdrop-blur-md"
    >
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Initial setup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          Create the admin account and configure the LLM and Tavily keys used by
          the planning pipeline. Keys are stored in SQLite on this host.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">Admin account</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Username</span>
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Password</span>
          <input
            type="password"
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Confirm password</span>
          <input
            type="password"
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">LLM (planning)</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Provider</span>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={llmProvider}
            onChange={(e) =>
              setLlmProvider(e.target.value === "anthropic" ? "anthropic" : "openai")
            }
          >
            <option value="openai">OpenAI-compatible</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        {llmProvider === "openai" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">OpenAI API key</span>
              <input
                type="password"
                autoComplete="off"
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Base URL (optional)</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Model</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Anthropic API key</span>
              <input
                type="password"
                autoComplete="off"
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Base URL (optional)</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={anthropicBaseUrl}
                onChange={(e) => setAnthropicBaseUrl(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Model</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={anthropicModel}
                onChange={(e) => setAnthropicModel(e.target.value)}
              />
            </label>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          If the LLM API key is already set via environment (e.g.{" "}
          <code className="font-mono">OPENAI_API_KEY</code> /{" "}
          <code className="font-mono">ANTHROPIC_API_KEY</code>), leave the key
          field blank.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">Web search (Tavily)</h2>
        <p className="text-xs text-muted-foreground">
          Planning uses Tavily for context during the plan step.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Tavily API key</span>
          <input
            type="password"
            autoComplete="off"
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            placeholder="tvly-…"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          If <code className="font-mono">TAVILY_API_KEY</code> is set on the
          server, you can leave this blank.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Complete setup"}
      </button>
    </form>
  );
}
