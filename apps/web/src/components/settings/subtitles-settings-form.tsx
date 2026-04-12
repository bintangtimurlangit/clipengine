"use client";

import { Loader2 } from "lucide-react";
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

type SettingsResponse = {
  subtitlesEnabled?: boolean;
  subtitlesFontFamily?: string;
  subtitlesFontSize?: number;
  subtitlesPrimaryColor?: string;
  subtitlesOutlineColor?: string;
  subtitlesOutlineWidth?: number;
  subtitlesMarginV?: number;
  subtitlesAlignment?: string;
  subtitlesMaxLines?: number;
};

const ALIGN_OPTIONS: { value: string; label: string }[] = [
  { value: "bottom_left", label: "Bottom left" },
  { value: "bottom_center", label: "Bottom center" },
  { value: "bottom_right", label: "Bottom right" },
  { value: "middle_left", label: "Middle left" },
  { value: "middle_center", label: "Middle center" },
  { value: "middle_right", label: "Middle right" },
  { value: "top_left", label: "Top left" },
  { value: "top_center", label: "Top center" },
  { value: "top_right", label: "Top right" },
];

const inputClass =
  "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SubtitlesSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [fontFamily, setFontFamily] = useState("DejaVu Sans");
  const [fontSize, setFontSize] = useState(48);
  const [primaryColor, setPrimaryColor] = useState("#FFFFFF");
  const [outlineColor, setOutlineColor] = useState("#000000");
  const [outlineWidth, setOutlineWidth] = useState(3);
  const [marginV, setMarginV] = useState(48);
  const [alignment, setAlignment] = useState("bottom_center");
  const [maxLines, setMaxLines] = useState(2);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const d = await jsonFetch<SettingsResponse>(publicApiUrl("/api/settings"));
      setEnabled(d.subtitlesEnabled ?? false);
      setFontFamily(d.subtitlesFontFamily ?? "DejaVu Sans");
      setFontSize(d.subtitlesFontSize ?? 48);
      setPrimaryColor(d.subtitlesPrimaryColor ?? "#FFFFFF");
      setOutlineColor(d.subtitlesOutlineColor ?? "#000000");
      setOutlineWidth(d.subtitlesOutlineWidth ?? 3);
      setMarginV(d.subtitlesMarginV ?? 48);
      setAlignment(d.subtitlesAlignment ?? "bottom_center");
      setMaxLines(d.subtitlesMaxLines ?? 2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setErr(null);
    setSaved(null);
    setSaving(true);
    try {
      await jsonFetch(publicApiUrl("/api/settings"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subtitles_enabled: enabled,
          subtitles_font_family: fontFamily,
          subtitles_font_size: fontSize,
          subtitles_primary_color: primaryColor,
          subtitles_outline_color: outlineColor,
          subtitles_outline_width: outlineWidth,
          subtitles_margin_v: marginV,
          subtitles_alignment: alignment,
          subtitles_max_lines: maxLines,
        }),
      });
      setSaved("Saved.");
      window.setTimeout(() => setSaved(null), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {err ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          {saved}
        </p>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Burned-in subtitles</CardTitle>
          <CardDescription>
            When enabled, transcript text from each run is drawn onto rendered MP4s during encode.
            You can turn subtitles off for individual runs from the run page when starting the
            pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-input"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium">Enable subtitles globally</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                New runs use this unless you disable subtitles for a specific run when starting.
              </span>
            </span>
          </label>

          {enabled ? (
            <div className="space-y-4 border-t border-border/60 pt-6">
              <p className="text-sm font-medium">Appearance</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Font family</span>
                  <input
                    className={inputClass}
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    placeholder="DejaVu Sans"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Font size (px)</span>
                  <input
                    type="number"
                    min={8}
                    max={200}
                    className={inputClass}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Text color</span>
                  <input
                    className={inputClass}
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#FFFFFF"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Outline color</span>
                  <input
                    className={inputClass}
                    value={outlineColor}
                    onChange={(e) => setOutlineColor(e.target.value)}
                    placeholder="#000000"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Outline width</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    className={inputClass}
                    value={outlineWidth}
                    onChange={(e) => setOutlineWidth(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Vertical margin (px)</span>
                  <input
                    type="number"
                    min={0}
                    max={400}
                    className={inputClass}
                    value={marginV}
                    onChange={(e) => setMarginV(Number(e.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">Alignment</span>
                  <select
                    className={inputClass}
                    value={alignment}
                    onChange={(e) => setAlignment(e.target.value)}
                  >
                    {ALIGN_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Max lines per cue</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className={inputClass}
                    value={maxLines}
                    onChange={(e) => setMaxLines(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save subtitles settings"
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={saving}>
              Reload
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
