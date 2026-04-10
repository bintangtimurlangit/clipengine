"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { publicApiUrl } from "@/lib/api";

const STEP_LABELS = ["Account", "LLM", "Search", "Connection"] as const;

/** Same provider list as Settings → Search (primary provider). */
const SETUP_SEARCH_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (API keys first, else DuckDuckGo)" },
  { value: "none", label: "Off (no web search)" },
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave Search" },
  { value: "duckduckgo", label: "DuckDuckGo" },
  { value: "exa", label: "Exa" },
  { value: "firecrawl", label: "Firecrawl" },
  { value: "gemini", label: "Google Gemini" },
  { value: "grok", label: "xAI Grok" },
  { value: "kimi", label: "Kimi (Moonshot)" },
  { value: "minimax", label: "MiniMax" },
  { value: "ollama_web", label: "Ollama Web" },
  { value: "perplexity", label: "Perplexity" },
  { value: "searxng", label: "SearXNG" },
];

type SearchCredentialField = {
  bodyKey: string;
  label: string;
  placeholder?: string;
  envVar: string;
  inputType: "password" | "text";
};

/** Provider id → optional credential field for first-run setup (matches Settings keys). */
const SEARCH_CREDENTIAL_BY_PROVIDER: Record<string, SearchCredentialField | null> = {
  auto: null,
  none: null,
  duckduckgo: null,
  tavily: {
    bodyKey: "tavily_api_key",
    label: "Tavily API key",
    placeholder: "tvly-…",
    envVar: "TAVILY_API_KEY",
    inputType: "password",
  },
  brave: {
    bodyKey: "brave_api_key",
    label: "Brave API key (subscription token)",
    envVar: "BRAVE_API_KEY",
    inputType: "password",
  },
  exa: {
    bodyKey: "exa_api_key",
    label: "Exa API key",
    envVar: "EXA_API_KEY",
    inputType: "password",
  },
  firecrawl: {
    bodyKey: "firecrawl_api_key",
    label: "Firecrawl API key",
    envVar: "FIRECRAWL_API_KEY",
    inputType: "password",
  },
  gemini: {
    bodyKey: "gemini_api_key",
    label: "Gemini API key",
    envVar: "GEMINI_API_KEY",
    inputType: "password",
  },
  grok: {
    bodyKey: "xai_api_key",
    label: "xAI API key (Grok)",
    envVar: "XAI_API_KEY",
    inputType: "password",
  },
  kimi: {
    bodyKey: "moonshot_api_key",
    label: "Moonshot API key (Kimi)",
    envVar: "MOONSHOT_API_KEY",
    inputType: "password",
  },
  minimax: {
    bodyKey: "minimax_api_key",
    label: "MiniMax API key",
    envVar: "MINIMAX_API_KEY",
    inputType: "password",
  },
  ollama_web: {
    bodyKey: "ollama_api_key",
    label: "Ollama API key (web search)",
    envVar: "OLLAMA_API_KEY",
    inputType: "password",
  },
  perplexity: {
    bodyKey: "perplexity_api_key",
    label: "Perplexity API key",
    envVar: "PERPLEXITY_API_KEY",
    inputType: "password",
  },
  searxng: {
    bodyKey: "searxng_base_url",
    label: "SearXNG base URL",
    placeholder: "https://search.example.com",
    envVar: "SEARXNG_BASE_URL",
    inputType: "text",
  },
};

function parseApiError(res: Response, data: unknown): string {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return JSON.stringify(detail);
  if (detail != null) return String(detail);
  return `Request failed (${res.status})`;
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseApiError(res, data));
  }
  return data as T;
}

export default function SetupForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);

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
  const [searchProviderMain, setSearchProviderMain] = useState("auto");
  const [searchCredential, setSearchCredential] = useState("");

  const [bindPathsLines, setBindPathsLines] = useState("");
  const [gdriveClientId, setGdriveClientId] = useState("");
  const [gdriveClientSecret, setGdriveClientSecret] = useState("");
  const [s3EndpointUrl, setS3EndpointUrl] = useState("");
  const [s3Region, setS3Region] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Prefix, setS3Prefix] = useState("");
  const [s3AccessKeyId, setS3AccessKeyId] = useState("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [smbHost, setSmbHost] = useState("");
  const [smbShare, setSmbShare] = useState("");
  const [smbPort, setSmbPort] = useState("445");
  const [smbRemoteBasePath, setSmbRemoteBasePath] = useState("");
  const [smbUsername, setSmbUsername] = useState("");
  const [smbPassword, setSmbPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [chainErrors, setChainErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  /** Step 4 is split: 1 = local bind paths, 2 = cloud & network. */
  const [connectionPart, setConnectionPart] = useState<1 | 2>(1);

  function buildSetupBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      username: username.trim(),
      password,
      llm_provider: llmProvider,
    };
    if (searchProviderMain !== "auto") {
      body.search_provider_main = searchProviderMain;
    }
    const credField = SEARCH_CREDENTIAL_BY_PROVIDER[searchProviderMain] ?? null;
    if (credField && searchCredential.trim()) {
      body[credField.bodyKey] = searchCredential.trim();
    }
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
    return body;
  }

  function validateStep1(): boolean {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return false;
    }
    if (!username.trim()) {
      setError("Username is required.");
      return false;
    }
    return true;
  }

  function goNext() {
    setError(null);
    if (step === 1) {
      if (!validateStep1()) return;
    }
    if (step === 4 && connectionPart === 1) {
      setConnectionPart(2);
      return;
    }
    if (step === 3) {
      setConnectionPart(1);
    }
    setStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    setError(null);
    if (step === 4 && connectionPart === 2) {
      setConnectionPart(1);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  }

  function skipForward() {
    setError(null);
    if (step === 3) {
      setConnectionPart(1);
    }
    setStep((s) => Math.min(4, s + 1));
  }

  async function runStorageChain(): Promise<string[]> {
    const errs: string[] = [];

    const paths = bindPathsLines
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (paths.length > 0) {
      try {
        await jsonFetch(publicApiUrl("/api/storage/bind-paths"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        });
      } catch (e) {
        errs.push(
          `Local bind paths: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const gId = gdriveClientId.trim();
    const gSec = gdriveClientSecret.trim();
    if (gId || gSec) {
      if (!gId || !gSec) {
        errs.push(
          "Google Drive: provide both Client ID and Client Secret, or leave both empty.",
        );
      } else {
        try {
          await jsonFetch(publicApiUrl("/api/google-drive/credentials"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: gId,
              clientSecret: gSec,
            }),
          });
          setGdriveClientSecret("");
          try {
            const data = await jsonFetch<{ authUrl: string }>(
              publicApiUrl("/api/google-drive/auth-url"),
            );
            window.open(data.authUrl, "_blank", "noopener,noreferrer");
          } catch (e) {
            errs.push(
              `Google Drive OAuth: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        } catch (e) {
          errs.push(
            `Google Drive: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    const s3Filled = [
      s3EndpointUrl,
      s3Region,
      s3Bucket,
      s3Prefix,
      s3AccessKeyId,
      s3SecretAccessKey,
    ].some((s) => s.trim());
    const s3Complete =
      s3Region.trim() &&
      s3Bucket.trim() &&
      s3AccessKeyId.trim() &&
      s3SecretAccessKey.trim();
    if (s3Filled) {
      if (!s3Complete) {
        errs.push(
          "S3: provide region, bucket, access key ID, and secret access key, or leave all S3 fields empty.",
        );
      } else {
        try {
          await jsonFetch(publicApiUrl("/api/s3/config"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint_url: s3EndpointUrl.trim(),
              region: s3Region.trim(),
              bucket: s3Bucket.trim(),
              prefix: s3Prefix.trim(),
              access_key_id: s3AccessKeyId.trim(),
              secret_access_key: s3SecretAccessKey.trim(),
            }),
          });
          setS3SecretAccessKey("");
        } catch (e) {
          errs.push(`S3: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const smbFilled = [
      smbHost,
      smbShare,
      smbRemoteBasePath,
      smbUsername,
      smbPassword,
    ].some((s) => s.trim());
    const smbPortNum = parseInt(smbPort.trim(), 10);
    const smbComplete =
      smbHost.trim() &&
      smbShare.trim() &&
      smbUsername.trim() &&
      smbPassword.trim() &&
      !Number.isNaN(smbPortNum);
    if (smbFilled) {
      if (!smbComplete) {
        errs.push(
          "SMB: provide host, share, username, password, and a valid port, or leave all SMB fields empty.",
        );
      } else {
        try {
          await jsonFetch(publicApiUrl("/api/smb/config"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              host: smbHost.trim(),
              share: smbShare.trim(),
              port: smbPortNum,
              remote_base_path: smbRemoteBasePath.trim(),
              username: smbUsername.trim(),
              password: smbPassword.trim(),
            }),
          });
          setSmbPassword("");
        } catch (e) {
          errs.push(`SMB: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return errs;
  }

  async function completeSetup() {
    setError(null);
    setChainErrors([]);
    setPending(true);
    try {
      const res = await fetch(publicApiUrl("/api/setup/complete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSetupBody()),
      });
      const data = (await res.json().catch(() => ({}))) as {
        detail?: unknown;
      };
      if (!res.ok) {
        setError(parseApiError(res, data));
        return;
      }

      const errs = await runStorageChain();
      if (errs.length > 0) {
        setChainErrors(errs);
        setAwaitingContinue(true);
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

  function continueToApp() {
    setAwaitingContinue(false);
    setChainErrors([]);
    router.replace("/");
    router.refresh();
  }

  const inputClass =
    "rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  const searchCredField =
    SEARCH_CREDENTIAL_BY_PROVIDER[searchProviderMain] ?? null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 4 && connectionPart === 2) void completeSetup();
      }}
      className="relative z-10 mx-auto flex w-full max-w-lg flex-col gap-6 rounded-xl border border-border bg-card/90 p-6 shadow-lg ring-1 ring-border/50 backdrop-blur-md"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
          {step === 4 ? (
            <>
              Step 4 of 4 — {STEP_LABELS[step - 1]} · Part {connectionPart} of 2
            </>
          ) : (
            <>
              Step {step} of 4 — {STEP_LABELS[step - 1]}
            </>
          )}
        </p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Initial setup
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {step === 1
            ? "Create the admin account for this Clip Engine instance."
            : step === 2
              ? "Optional: configure the LLM used in the planning step. You can add or change this in Settings later."
              : step === 3
                ? "Optional: web search adds context during planning. Pick a provider and API key, or configure later in Settings."
                : step === 4 && connectionPart === 1
                  ? "Import from folders or directories on disk—not only manual uploads. Optional; you can add paths later in Settings."
                  : step === 4 && connectionPart === 2
                    ? "Optional Google Drive, S3, or SMB—skip if you only use local paths or will add this in Settings."
                    : ""}
        </p>
      </div>

      {step === 1 ? (
        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Admin account
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              Username
            </span>
            <input
              className={inputClass}
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
              className={inputClass}
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
              className={inputClass}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            LLM (planning)
          </h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              Provider
            </span>
            <select
              className={inputClass}
              value={llmProvider}
              onChange={(e) =>
                setLlmProvider(
                  e.target.value === "anthropic" ? "anthropic" : "openai",
                )
              }
            >
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          {llmProvider === "openai" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  OpenAI API key
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  className={inputClass}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-…"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Base URL (optional)
                </span>
                <input
                  className={inputClass}
                  value={openaiBaseUrl}
                  onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Model
                </span>
                <input
                  className={inputClass}
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Anthropic API key
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  className={inputClass}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Base URL (optional)
                </span>
                <input
                  className={inputClass}
                  value={anthropicBaseUrl}
                  onChange={(e) => setAnthropicBaseUrl(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  Model
                </span>
                <input
                  className={inputClass}
                  value={anthropicModel}
                  onChange={(e) => setAnthropicModel(e.target.value)}
                />
              </label>
            </>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            If the LLM API key is already set via environment (e.g.{" "}
            <code className="font-mono">OPENAI_API_KEY</code> /{" "}
            <code className="font-mono">ANTHROPIC_API_KEY</code>), leave the key
            field blank.
          </p>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Web search
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Choose which search backend to use for the plan step. You can fine-tune
            fallbacks and extra keys under Settings.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              Search provider
            </span>
            <select
              className={inputClass}
              value={searchProviderMain}
              onChange={(e) => {
                setSearchProviderMain(e.target.value);
                setSearchCredential("");
              }}
            >
              {SETUP_SEARCH_PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {searchCredField ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {searchCredField.label}
              </span>
              <input
                type={searchCredField.inputType}
                autoComplete="off"
                className={inputClass}
                value={searchCredential}
                onChange={(e) => setSearchCredential(e.target.value)}
                placeholder={searchCredField.placeholder}
              />
            </label>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              {searchProviderMain === "auto"
                ? "Uses the first provider that has credentials (from the server environment or Settings)."
                : searchProviderMain === "none"
                  ? "Planning will run without web search context."
                  : "No API key required for this provider."}
            </p>
          )}
          {searchCredField ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              If <code className="font-mono">{searchCredField.envVar}</code> is
              set on the server, you can leave this blank.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 4 && connectionPart === 1 ? (
        <div className="space-y-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Besides uploading videos manually, Clip Engine can import from
              folders or directories on this server—so you can work with a
              library on disk instead of picking files one by one.
            </p>
            <p>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Want to set that up now?
              </span>{" "}
              Add allowlisted paths below (one per line). Leave empty to skip;
              you can change this anytime under Settings. After setup, use{" "}
              <strong>Import</strong> for YouTube, uploads, and files from paths
              you allowlist here.
            </p>
          </div>

          <Card size="sm" className="bg-muted/25 ring-zinc-200/80 dark:ring-zinc-700/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Local bind paths</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Folders inside the container available for folder/directory
                import and for output. One absolute path per line; directories
                must exist when saved.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <textarea
                className={`${inputClass} min-h-[100px] w-full max-w-full resize-y font-mono text-xs`}
                value={bindPathsLines}
                onChange={(e) => setBindPathsLines(e.target.value)}
                placeholder="/media/videos"
                autoComplete="off"
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 4 && connectionPart === 2 ? (
        <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Cloud & network
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Pick one tab. Leave everything empty if you don&apos;t need it
              yet.
            </p>
            <Tabs defaultValue="gdrive">
              <TabsList
                variant="line"
                className="flex w-full max-w-full flex-wrap gap-0.5 sm:w-fit"
              >
                <TabsTrigger value="gdrive">Google Drive</TabsTrigger>
                <TabsTrigger value="s3">S3</TabsTrigger>
                <TabsTrigger value="smb">SMB</TabsTrigger>
              </TabsList>

              <TabsContent value="gdrive" className="mt-3 outline-none">
                <Card size="sm" className="ring-zinc-200/80 dark:ring-zinc-700/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Google Drive</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      After setup completes, we can open a browser tab for OAuth
                      when both credentials are filled in.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        OAuth Client ID
                      </span>
                      <input
                        className={inputClass}
                        value={gdriveClientId}
                        onChange={(e) => setGdriveClientId(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        OAuth Client Secret
                      </span>
                      <input
                        type="password"
                        className={inputClass}
                        value={gdriveClientSecret}
                        onChange={(e) => setGdriveClientSecret(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="s3" className="mt-3 outline-none">
                <Card size="sm" className="ring-zinc-200/80 dark:ring-zinc-700/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">S3 output</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      Optional object storage for rendered output. Leave the
                      endpoint empty for default AWS.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Endpoint URL (optional)
                      </span>
                      <input
                        className={inputClass}
                        value={s3EndpointUrl}
                        onChange={(e) => setS3EndpointUrl(e.target.value)}
                        placeholder="Leave empty for AWS"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Region
                      </span>
                      <input
                        className={inputClass}
                        value={s3Region}
                        onChange={(e) => setS3Region(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Bucket
                      </span>
                      <input
                        className={inputClass}
                        value={s3Bucket}
                        onChange={(e) => setS3Bucket(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Prefix (optional)
                      </span>
                      <input
                        className={inputClass}
                        value={s3Prefix}
                        onChange={(e) => setS3Prefix(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Access key ID
                      </span>
                      <input
                        className={inputClass}
                        value={s3AccessKeyId}
                        onChange={(e) => setS3AccessKeyId(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Secret access key
                      </span>
                      <input
                        type="password"
                        className={inputClass}
                        value={s3SecretAccessKey}
                        onChange={(e) => setS3SecretAccessKey(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="smb" className="mt-3 outline-none">
                <Card size="sm" className="ring-zinc-200/80 dark:ring-zinc-700/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">SMB output</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      Optional share for rendered files on your LAN.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-4">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Host
                      </span>
                      <input
                        className={inputClass}
                        value={smbHost}
                        onChange={(e) => setSmbHost(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Share
                      </span>
                      <input
                        className={inputClass}
                        value={smbShare}
                        onChange={(e) => setSmbShare(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Port
                      </span>
                      <input
                        className={inputClass}
                        value={smbPort}
                        onChange={(e) => setSmbPort(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Path under share (optional)
                      </span>
                      <input
                        className={inputClass}
                        value={smbRemoteBasePath}
                        onChange={(e) => setSmbRemoteBasePath(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Username
                      </span>
                      <input
                        className={inputClass}
                        value={smbUsername}
                        onChange={(e) => setSmbUsername(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        Password
                      </span>
                      <input
                        type="password"
                        className={inputClass}
                        value={smbPassword}
                        onChange={(e) => setSmbPassword(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {chainErrors.length > 0 ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100"
          role="alert"
        >
          <p className="font-medium">Setup finished, but some options failed:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {chainErrors.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-90">
            You can fix these under Settings. Your admin account is already
            saved.
          </p>
        </div>
      ) : null}

      {awaitingContinue ? (
        <button
          type="button"
          onClick={continueToApp}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Continue to app
        </button>
      ) : (
        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                disabled={pending}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Back
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step === 2 || step === 3 ? (
              <button
                type="button"
                onClick={skipForward}
                disabled={pending}
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Skip for now
              </button>
            ) : null}
            {step === 4 && connectionPart === 1 ? (
              <button
                type="button"
                onClick={() => void completeSetup()}
                disabled={pending}
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Finish without cloud
              </button>
            ) : null}
            {step < 4 || (step === 4 && connectionPart === 1) ? (
              <button
                type="button"
                onClick={goNext}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {step === 4 && connectionPart === 1 ? "Next: cloud & network" : "Next"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {pending ? "Saving…" : "Complete setup"}
              </button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
