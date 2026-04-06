"use client";

import { useCallback, useEffect, useState } from "react";

import { publicApiUrl } from "@/lib/api";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type GDriveStatus = {
  hasCredentials: boolean;
  connected: boolean;
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

export function GoogleDriveSettingsCard() {
  const [status, setStatus] = useState<GDriveStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const s = await jsonFetch<GDriveStatus>(publicApiUrl("/api/google-drive/status"));
      setStatus(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load Google Drive status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCredentials() {
    setErr(null);
    setSaved(null);
    if (!clientId.trim() || !clientSecret.trim()) {
      setErr("Client ID and Client Secret are required.");
      return;
    }
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/google-drive/credentials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      setClientSecret("");
      setSaved("Credentials saved. Use “Connect in browser” next.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function openAuth() {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      const data = await jsonFetch<{ authUrl: string; redirectUri: string }>(
        publicApiUrl("/api/google-drive/auth-url"),
      );
      window.open(data.authUrl, "_blank", "noopener,noreferrer");
      setSaved(
        "Complete sign-in in the new tab. If upload fails later, reconnect to grant upload scope.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start OAuth");
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Drive on this server?")) return;
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/google-drive/connection"), {
        method: "DELETE",
      });
      setSaved("Disconnected.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive</CardTitle>
        <CardDescription>
          Bring your own Google Cloud OAuth client (Web application). Add redirect URI{" "}
          <code className="rounded bg-muted px-1 text-xs">
            {"{public URL}"}/api/google-drive/callback
          </code>{" "}
          (set <code className="text-xs">CLIPENGINE_PUBLIC_URL</code> behind a reverse proxy).
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
        <p className="text-muted-foreground">
          Status:{" "}
          {status == null
            ? "…"
            : status.connected
              ? "Connected"
              : status.hasCredentials
                ? "Credentials saved — not connected yet"
                : "Not configured"}
        </p>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">OAuth Client ID</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="off"
              placeholder="*.apps.googleusercontent.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">OAuth Client Secret</span>
            <input
              type="password"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              size="sm"
              onClick={() => void saveCredentials()}
              className="inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              Save credentials
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || !status?.hasCredentials}
              onClick={() => void openAuth()}
            >
              Connect in browser
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !status?.connected}
              onClick={() => void disconnect()}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
