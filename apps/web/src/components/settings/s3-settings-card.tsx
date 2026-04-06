"use client";

import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/confirm-alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type S3Status = {
  configured: boolean;
  endpointUrl: string;
  region: string;
  bucket: string;
  prefix: string;
  hasSecretKey: boolean;
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

export function S3SettingsCard() {
  const [status, setStatus] = useState<S3Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [endpointUrl, setEndpointUrl] = useState("");
  const [region, setRegion] = useState("");
  const [bucket, setBucket] = useState("");
  const [prefix, setPrefix] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const s = await jsonFetch<S3Status>(publicApiUrl("/api/s3/status"));
      setStatus(s);
      setEndpointUrl(s.endpointUrl);
      setRegion(s.region);
      setBucket(s.bucket);
      setPrefix(s.prefix);
      setAccessKeyId("");
      setSecretAccessKey("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load S3 status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setErr(null);
    setSaved(null);
    if (!status?.hasSecretKey && !secretAccessKey.trim()) {
      setErr("Secret access key is required on first save.");
      return;
    }
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/s3/config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint_url: endpointUrl.trim(),
          region: region.trim(),
          bucket: bucket.trim(),
          prefix: prefix.trim(),
          access_key_id: accessKeyId.trim(),
          secret_access_key: secretAccessKey.trim(),
        }),
      });
      setSecretAccessKey("");
      setSaved("S3 settings saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function onClear() {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/s3/config"), { method: "DELETE" });
      setSaved("S3 configuration cleared.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>S3 output</CardTitle>
        <CardDescription>
          AWS S3 or compatible API (MinIO, Cloudflare R2, etc.). Keys stay in SQLite on this host.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          {err ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
              {err}
            </p>
          ) : null}
          {saved ? (
            <p className="rounded-md border border-border bg-muted/50 p-2 text-foreground">{saved}</p>
          ) : null}
          <p className="text-muted-foreground">
            Status: {status == null ? "…" : status.configured ? "Ready" : "Not configured"}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Endpoint URL (optional, for S3-compatible)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://s3.amazonaws.com or MinIO base URL"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Region</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Bucket</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Key prefix (optional)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="clipengine/"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Access key ID</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Secret access key (leave blank to keep existing)
            </span>
            <input
              type="password"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
              autoComplete="off"
            />
          </label>
          {status?.hasSecretKey && !secretAccessKey ? (
            <p className="text-xs text-muted-foreground">Existing secret will be kept.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ConfirmAlertDialog
              open={clearDialogOpen}
              onOpenChange={setClearDialogOpen}
              title="Remove S3 credentials?"
              description="This removes stored S3 credentials from this server."
              confirmLabel="Remove"
              cancelLabel="Keep"
              onConfirm={onClear}
            />
            <Button type="button" disabled={pending} onClick={() => void onSave()}>
              {pending ? "Saving…" : "Save S3 settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !status?.configured}
              onClick={() => setClearDialogOpen(true)}
            >
              Clear
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
