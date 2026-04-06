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

type TelegramStatus = {
  enabled: boolean;
  chatId: string;
  botTokenConfigured: boolean;
  botTokenFromEnv: boolean;
  chatIdFromEnv: boolean;
};

const MASKED_TOKEN = "••••••••••";

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

export function TelegramNotificationsCard() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [chatId, setChatId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botTokenTouched, setBotTokenTouched] = useState(false);
  const [clearTokenDialogOpen, setClearTokenDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const s = await jsonFetch<TelegramStatus>(publicApiUrl("/api/notifications/telegram"));
      setStatus(s);
      setEnabled(s.enabled);
      setChatId(s.chatId);
      setBotToken("");
      setBotTokenTouched(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load Telegram settings");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setErr(null);
    setSaved(null);
    if (enabled) {
      const hasToken =
        status?.botTokenFromEnv ||
        status?.botTokenConfigured ||
        botToken.trim().length > 0;
      const hasChat =
        status?.chatIdFromEnv || chatId.trim().length > 0;
      if (!hasToken) {
        setErr("Bot token is required (or set TELEGRAM_BOT_TOKEN in the environment).");
        return;
      }
      if (!hasChat) {
        setErr("Chat ID is required (or set TELEGRAM_CHAT_ID in the environment).");
        return;
      }
    }
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/notifications/telegram"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          chat_id: chatId.trim(),
          bot_token: botToken.trim(),
          clear_bot_token: false,
        }),
      });
      setBotToken("");
      setBotTokenTouched(false);
      setSaved("Telegram notification settings saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function onClearToken() {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/notifications/telegram"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          chat_id: chatId.trim(),
          bot_token: "",
          clear_bot_token: true,
        }),
      });
      setBotToken("");
      setBotTokenTouched(false);
      setSaved("Stored bot token removed.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setPending(false);
    }
  }

  async function onTest() {
    setErr(null);
    setSaved(null);
    setPending(true);
    try {
      await jsonFetch(publicApiUrl("/api/notifications/telegram/test"), {
        method: "POST",
      });
      setSaved("Test message sent. Check Telegram.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Test failed");
    } finally {
      setPending(false);
    }
  }

  const tokenDisplay =
    status?.botTokenConfigured && !botTokenTouched
      ? MASKED_TOKEN
      : botToken;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription className="space-y-2">
          <span>
            Get a bot token from <strong>@BotFather</strong> in Telegram (<code>/newbot</code>),
            then open your bot and tap <strong>Start</strong> so it can message you.
          </span>
          <span className="block text-xs">
            To find your <strong>chat ID</strong>: send any message to your bot, then open{" "}
            <code className="rounded bg-muted px-1">
              https://api.telegram.org/bot&lt;token&gt;/getUpdates
            </code>{" "}
            in a browser and read <code className="rounded bg-muted px-1">message.chat.id</code>.
          </span>
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

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Send notifications when a pipeline run completes or fails</span>
          </label>

          <p className="text-xs text-muted-foreground">
            {status == null
              ? "…"
              : [
                  enabled ? "Enabled" : "Disabled",
                  status.botTokenConfigured || status.botTokenFromEnv
                    ? "token: set"
                    : "token: not set",
                  status.chatIdFromEnv || (status.chatId && status.chatId.length > 0)
                    ? "chat: set"
                    : "chat: not set",
                ].join(" · ")}
          </p>

          {(status?.botTokenFromEnv || status?.chatIdFromEnv) ? (
            <p className="text-xs text-muted-foreground">
              {status.botTokenFromEnv ? (
                <span className="block">TELEGRAM_BOT_TOKEN is set in the environment.</span>
              ) : null}
              {status.chatIdFromEnv ? (
                <span className="block">TELEGRAM_CHAT_ID is set in the environment.</span>
              ) : null}
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">Chat ID</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. 123456789"
              autoComplete="off"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground">
              Bot token (leave blank to keep stored token)
            </span>
            <input
              type="password"
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={tokenDisplay}
              onFocus={() => setBotTokenTouched(true)}
              onBlur={() => {
                if (botToken === "" && status?.botTokenConfigured) {
                  setBotTokenTouched(false);
                }
              }}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:ABC…"
              autoComplete="off"
            />
          </label>
          {status?.botTokenConfigured && !botTokenTouched && !botToken ? (
            <p className="text-xs text-muted-foreground">Existing token will be kept.</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <ConfirmAlertDialog
              open={clearTokenDialogOpen}
              onOpenChange={setClearTokenDialogOpen}
              title="Remove stored bot token?"
              description="This removes the bot token saved on this server (not values from the environment)."
              confirmLabel="Remove token"
              cancelLabel="Keep"
              onConfirm={onClearToken}
            />
            <Button type="button" disabled={pending} onClick={() => void onSave()}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !status?.botTokenConfigured}
              onClick={() => setClearTokenDialogOpen(true)}
            >
              Clear stored token
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || !enabled}
              onClick={() => void onTest()}
            >
              Send test
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
