"use client";

import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PublishSettings = {
  publishTitleSource: "ai_clip" | "run_filename";
  publishDescriptionMode: "full_ai" | "manual" | "hybrid";
  publishDescriptionPrefix: string;
  publishDescriptionSuffix: string;
  publishHybridIncludeAi: boolean;
};

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail != null) detail = JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function PublishingSettingsCard() {
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [titleSource, setTitleSource] = useState<PublishSettings["publishTitleSource"]>("ai_clip");
  const [descMode, setDescMode] = useState<PublishSettings["publishDescriptionMode"]>("hybrid");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [hybridAi, setHybridAi] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await jsonFetch<PublishSettings>(publicApiUrl("/api/settings"));
      setTitleSource(d.publishTitleSource === "run_filename" ? "run_filename" : "ai_clip");
      const m = d.publishDescriptionMode;
      setDescMode(m === "full_ai" || m === "manual" ? m : "hybrid");
      setPrefix(d.publishDescriptionPrefix ?? "");
      setSuffix(d.publishDescriptionSuffix ?? "");
      setHybridAi(d.publishHybridIncludeAi !== false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load publishing settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publish_title_source: titleSource,
          publish_description_mode: descMode,
          publish_description_prefix: prefix,
          publish_description_suffix: suffix,
          publish_hybrid_include_ai: hybridAi,
        }),
      });
      setSaved("Publishing settings saved. They apply to clip metadata, ZIP exports, and YouTube uploads.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publishing</CardTitle>
        <CardDescription>
          Control how titles and descriptions are resolved for the Library, download ZIPs (
          <code className="text-xs">publish.txt</code> / <code className="text-xs">publish_metadata.json</code>
          ), and YouTube uploads. Per-clip AI copy comes from the planner (
          <code className="text-xs">publish_description</code> in{" "}
          <code className="text-xs">cut_plan.json</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {err ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            {err}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-md border border-border bg-muted/50 p-2 text-foreground">{saved}</p>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">Video title</span>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={titleSource}
            onChange={(e) =>
              setTitleSource(e.target.value as PublishSettings["publishTitleSource"])
            }
          >
            <option value="ai_clip">Use AI clip title from the cut plan</option>
            <option value="run_filename">Use run title and filename (no AI title)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">Description</span>
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={descMode}
            onChange={(e) =>
              setDescMode(e.target.value as PublishSettings["publishDescriptionMode"])
            }
          >
            <option value="full_ai">Full AI — only the generated publish description</option>
            <option value="manual">Manual — prefix and suffix only (fixed text, hashtags)</option>
            <option value="hybrid">Hybrid — prefix, optional AI body, suffix</option>
          </select>
        </label>

        {descMode === "hybrid" ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hybridAi}
              onChange={(e) => setHybridAi(e.target.checked)}
              className="rounded border-input"
            />
            <span>Include AI publish description between prefix and suffix</span>
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">Description prefix (optional)</span>
          <textarea
            className="min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder='e.g. "This video is part of my series…"'
            disabled={descMode === "full_ai"}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">Description suffix (optional)</span>
          <textarea
            className="min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            placeholder="#gaming #highlights"
            disabled={descMode === "full_ai"}
          />
        </label>

        <Button type="button" size="sm" disabled={pending} onClick={() => void save()}>
          {pending ? "Saving…" : "Save publishing settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
