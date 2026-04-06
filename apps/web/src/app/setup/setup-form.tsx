"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { publicApiUrl } from "@/lib/api";

export default function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
      const res = await fetch(publicApiUrl("/api/setup/complete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
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
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Initial setup
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create the admin account for this Clip Engine instance. After this step you can
          choose your LLM provider and API keys under{" "}
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Settings</span>{" "}
          anytime.
        </p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          Username
        </span>
        <input
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          Password
        </span>
        <input
          type="password"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          Confirm password
        </span>
        <input
          type="password"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </label>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {pending ? "Saving…" : "Complete setup"}
      </button>
    </form>
  );
}
