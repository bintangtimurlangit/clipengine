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

type SmbStatus = {
  configured: boolean;
  host: string;
  share: string;
  port: number;
  remoteBasePath: string;
  username: string;
  hasPassword: boolean;
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

export function SmbSettingsCard() {
  const [status, setStatus] = useState<SmbStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [host, setHost] = useState("");
  const [share, setShare] = useState("");
  const [port, setPort] = useState(445);
  const [remoteBasePath, setRemoteBasePath] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const s = await jsonFetch<SmbStatus>(publicApiUrl("/api/smb/status"));
      setStatus(s);
      setHost(s.host);
      setShare(s.share);
      setPort(s.port);
      setRemoteBasePath(s.remoteBasePath);
      setUsername(s.username);
      setPassword("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load SMB status");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setErr(null);
    setSaved(null);
    if (!status?.hasPassword && !password) {
      setErr("Password is required on first save.");
      return;
    }
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/smb/config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          share: share.trim(),
          port,
          remote_base_path: remoteBasePath.trim(),
          username: username.trim(),
          password: password,
        }),
      });
      setPassword("");
      setSaved("SMB settings saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function onClear() {
    if (!window.confirm("Remove stored SMB credentials from this server?")) return;
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/smb/config"), { method: "DELETE" });
      setSaved("SMB configuration cleared.");
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
        <CardTitle>SMB / Windows share output</CardTitle>
        <CardDescription>
          Optional convenience for <strong>LAN</strong> or <strong>private networks</strong> only.
          The API must reach TCP <strong>445</strong> on the file server. Do{" "}
          <strong>not</strong> expose SMB to the public internet. For a VPS, prefer{" "}
          <strong>S3</strong>, <strong>Google Drive</strong>, or <strong>workspace</strong>; or use
          Tailscale/VPN + <strong>mount</strong> the share on the host instead of this.
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
            <span className="text-muted-foreground">Host</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="nas.local or 192.168.1.10"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Share name</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={share}
              onChange={(e) => setShare(e.target.value)}
              placeholder="videos"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Port</span>
            <input
              type="number"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={port}
              min={1}
              max={65535}
              onChange={(e) => setPort(Number(e.target.value) || 445)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Path under share (optional)</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={remoteBasePath}
              onChange={(e) => setRemoteBasePath(e.target.value)}
              placeholder="clipengine/outputs"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Username</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Password (leave blank to keep existing)
            </span>
            <input
              type="password"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </label>
          {status?.hasPassword && !password ? (
            <p className="text-xs text-muted-foreground">Existing password will be kept.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => void onSave()}
              className="inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? "Saving…" : "Save SMB settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !status?.configured}
              onClick={() => void onClear()}
            >
              Clear
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
