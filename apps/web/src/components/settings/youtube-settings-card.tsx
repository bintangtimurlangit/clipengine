"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type YouTubeAccountRow = {
  id: string;
  connected: boolean;
  channelId?: string | null;
  channelTitle?: string | null;
};

type YouTubeStatus = {
  hasCredentials: boolean;
  connected: boolean;
  accounts?: YouTubeAccountRow[];
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

export function YouTubeSettingsCard() {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [disconnectAllOpen, setDisconnectAllOpen] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const s = await jsonFetch<YouTubeStatus>(publicApiUrl("/api/youtube/status"));
      setStatus(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load YouTube status");
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
      await jsonFetch(publicApiUrl("/api/youtube/credentials"), {
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

  async function openAuth(opts?: { intent: "add" | "replace"; accountId?: string }) {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      const data = await jsonFetch<{
        authUrl: string;
        redirectUri: string;
      }>(publicApiUrl("/api/youtube/auth-url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: opts?.intent ?? "add",
          accountId: opts?.accountId ?? null,
        }),
      });
      window.open(data.authUrl, "_blank", "noopener,noreferrer");
      setSaved(
        "Complete sign-in in the new tab. Enable YouTube Data API v3 on the same Google Cloud project.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start OAuth");
    } finally {
      setPending(false);
    }
  }

  async function disconnectAll() {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/youtube/connection"), {
        method: "DELETE",
      });
      setSaved("Disconnected all accounts.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setPending(false);
    }
  }

  async function disconnectOne(accountId: string) {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl(`/api/youtube/connection/${encodeURIComponent(accountId)}`), {
        method: "DELETE",
      });
      setSaved("Account disconnected.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setPending(false);
      setDisconnectId(null);
    }
  }

  const accounts = status?.accounts ?? [];

  const accountsFiltered = useMemo(() => {
    const q = accountFilter.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const title = (a.channelTitle || "").toLowerCase();
      const id = a.id.toLowerCase();
      return title.includes(q) || id.includes(q);
    });
  }, [accounts, accountFilter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>YouTube upload</CardTitle>
        <CardDescription>
          Bring your own Google Cloud OAuth client (Web application). Enable{" "}
          <strong>YouTube Data API v3</strong> on the project. Add redirect URI{" "}
          <code className="rounded bg-muted px-1 text-xs">
            {"{public URL}"}/api/youtube/callback
          </code>{" "}
          (set <code className="text-xs">CLIPENGINE_PUBLIC_URL</code> behind a reverse proxy). API
          quota is per <strong>Google Cloud project</strong> — multiple channels do not multiply
          daily upload quota.
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
              ? `${accounts.filter((a) => a.connected).length} connected account(s)`
              : status.hasCredentials
                ? "Credentials saved — not connected yet"
                : "Not configured"}
        </p>
        {accounts.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm font-medium text-foreground">
                Connected channels ({accounts.filter((a) => a.connected).length} active ·{" "}
                {accounts.length} total)
              </p>
            </div>
            {accounts.length >= 4 ? (
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                placeholder="Filter by channel name…"
                autoComplete="off"
              />
            ) : null}
            {accountsFiltered.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No channels match this filter.
              </p>
            ) : (
              <ul className="max-h-[min(28rem,65vh)] space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {accountsFiltered.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {a.channelTitle || "YouTube channel"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.connected ? "Connected" : "Not connected"} · id {a.id}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending || !status?.hasCredentials}
                        onClick={() => void openAuth({ intent: "replace", accountId: a.id })}
                      >
                        Reconnect
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending || !a.connected}
                        onClick={() => setDisconnectId(a.id)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
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
            <ConfirmAlertDialog
              open={disconnectAllOpen}
              onOpenChange={setDisconnectAllOpen}
              title="Disconnect all YouTube accounts?"
              description="This removes stored tokens for every connected account on this server. Client ID and secret are kept."
              confirmLabel="Disconnect all"
              cancelLabel="Cancel"
              onConfirm={disconnectAll}
            />
            <ConfirmAlertDialog
              open={disconnectId != null}
              onOpenChange={(o) => !o && setDisconnectId(null)}
              title="Disconnect this account?"
              description="You can reconnect later with Reconnect."
              confirmLabel="Disconnect"
              cancelLabel="Keep"
              onConfirm={() => disconnectId && void disconnectOne(disconnectId)}
            />
            <Button
              type="button"
              disabled={pending}
              size="sm"
              onClick={() => void saveCredentials()}
            >
              Save credentials
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || !status?.hasCredentials}
              onClick={() => void openAuth({ intent: "add" })}
            >
              Add account (browser)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !status?.connected}
              onClick={() => setDisconnectAllOpen(true)}
            >
              Disconnect all
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
