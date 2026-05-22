'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ANCHORS = [
  'top_left',
  'top_center',
  'top_right',
  'middle_left',
  'middle_center',
  'middle_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
] as const;

interface LogoRow {
  id: string;
  filename: string;
}

export interface PresetEditorValue {
  name: string;
  kind: 'longform' | 'shortform';
  orientation: 'horizontal' | 'vertical';
  width: number;
  height: number;
  min_s: number;
  max_s: number;
  fps: 24 | 30 | 60;
  crf: number;
  encode_preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow';
  audio_bitrate_kbps: number;
  logo_id: string;
  logo_anchor: (typeof ANCHORS)[number];
  logo_padding_px: number;
  logo_scale_pct: number;
  logo_opacity: number;
  subtitles_enabled: boolean;
  font_family: string;
  font_size_px: number;
  primary_color: string;
  outline_color: string;
  outline_width: number;
  alignment: (typeof ANCHORS)[number];
  margin_v_px: number;
  max_lines: number;
  safe_area_px: number;
}

const DEFAULT_LONGFORM: PresetEditorValue = {
  name: 'Longform 16:9',
  kind: 'longform',
  orientation: 'horizontal',
  width: 1920,
  height: 1080,
  min_s: 180,
  max_s: 360,
  fps: 30,
  crf: 20,
  encode_preset: 'medium',
  audio_bitrate_kbps: 192,
  logo_id: '',
  logo_anchor: 'top_right',
  logo_padding_px: 32,
  logo_scale_pct: 12,
  logo_opacity: 0.9,
  subtitles_enabled: true,
  font_family: 'DejaVu Sans',
  font_size_px: 42,
  primary_color: '#FFFFFF',
  outline_color: '#000000',
  outline_width: 2,
  alignment: 'bottom_center',
  margin_v_px: 80,
  max_lines: 2,
  safe_area_px: 0,
};

const DEFAULT_SHORTFORM: PresetEditorValue = {
  ...DEFAULT_LONGFORM,
  name: 'Shortform 9:16',
  kind: 'shortform',
  orientation: 'vertical',
  width: 1080,
  height: 1920,
  min_s: 27,
  max_s: 80,
  font_size_px: 56,
  outline_width: 3,
  alignment: 'middle_center',
  margin_v_px: 0,
  safe_area_px: 240,
};

function buildBody(value: PresetEditorValue) {
  return {
    name: value.name,
    kind: value.kind,
    orientation: value.orientation,
    dimensions: { width: value.width, height: value.height },
    duration: { min_s: value.min_s, max_s: value.max_s },
    encode: {
      fps: value.fps,
      crf: value.crf,
      preset: value.encode_preset,
      audio_bitrate_kbps: value.audio_bitrate_kbps,
    },
    logo: value.logo_id
      ? {
          logo_id: value.logo_id,
          anchor: value.logo_anchor,
          padding_px: value.logo_padding_px,
          scale_pct: value.logo_scale_pct,
          opacity: value.logo_opacity,
        }
      : null,
    subtitles: {
      enabled: value.subtitles_enabled,
      font_family: value.font_family,
      font_size_px: value.font_size_px,
      primary_color: value.primary_color,
      outline_color: value.outline_color,
      outline_width: value.outline_width,
      alignment: value.alignment,
      margin_v_px: value.margin_v_px,
      max_lines: value.max_lines,
      safe_area_px: value.safe_area_px,
    },
  };
}

export interface PresetEditorProps {
  presetId?: string;
  initialKind?: 'longform' | 'shortform';
}

export function PresetEditor({ presetId, initialKind }: PresetEditorProps) {
  const router = useRouter();
  const [value, setValue] = useState<PresetEditorValue>(
    initialKind === 'shortform' ? DEFAULT_SHORTFORM : DEFAULT_LONGFORM,
  );
  const [logos, setLogos] = useState<LogoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(presetId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .get<{ logos: LogoRow[] }>('/api/logos')
      .then((res) => setLogos(res.logos))
      .catch(() => setLogos([]));
  }, []);

  useEffect(() => {
    if (!presetId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<{
          preset: {
            name: string;
            kind: 'longform' | 'shortform';
            orientation: 'horizontal' | 'vertical';
            dimensions: { width: number; height: number };
            duration: { min_s: number; max_s: number };
            encode: PresetEditorValue extends infer T
              ? T extends { encode_preset: infer P }
                ? { fps: 24 | 30 | 60; crf: number; preset: P; audio_bitrate_kbps: number }
                : never
              : never;
            logo: null | {
              logo_id: string;
              anchor: PresetEditorValue['logo_anchor'];
              padding_px: number;
              scale_pct: number;
              opacity: number;
            };
            subtitles: {
              enabled: boolean;
              font_family: string;
              font_size_px: number;
              primary_color: string;
              outline_color: string;
              outline_width: number;
              alignment: PresetEditorValue['alignment'];
              margin_v_px: number;
              max_lines: number;
              safe_area_px: number;
            };
          };
        }>(`/api/presets/${presetId}`);
        if (cancelled) return;
        const p = res.preset;
        setValue({
          name: p.name,
          kind: p.kind,
          orientation: p.orientation,
          width: p.dimensions.width,
          height: p.dimensions.height,
          min_s: p.duration.min_s,
          max_s: p.duration.max_s,
          fps: p.encode.fps,
          crf: p.encode.crf,
          encode_preset: p.encode.preset,
          audio_bitrate_kbps: p.encode.audio_bitrate_kbps,
          logo_id: p.logo?.logo_id ?? '',
          logo_anchor: p.logo?.anchor ?? 'top_right',
          logo_padding_px: p.logo?.padding_px ?? 32,
          logo_scale_pct: p.logo?.scale_pct ?? 12,
          logo_opacity: p.logo?.opacity ?? 0.9,
          subtitles_enabled: p.subtitles.enabled,
          font_family: p.subtitles.font_family,
          font_size_px: p.subtitles.font_size_px,
          primary_color: p.subtitles.primary_color,
          outline_color: p.subtitles.outline_color,
          outline_width: p.subtitles.outline_width,
          alignment: p.subtitles.alignment,
          margin_v_px: p.subtitles.margin_v_px,
          max_lines: p.subtitles.max_lines,
          safe_area_px: p.subtitles.safe_area_px,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load preset.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  function setField<K extends keyof PresetEditorValue>(key: K, val: PresetEditorValue[K]) {
    setValue((prev) => ({ ...prev, [key]: val }));
  }

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const body = buildBody(value);
      if (presetId) {
        await api.patch(`/api/presets/${presetId}`, body);
      } else {
        await api.post('/api/presets', body);
      }
      router.push('/presets');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading preset…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{presetId ? 'Edit preset' : 'New preset'}</CardTitle>
        <CardDescription>
          Dimensions, encoding, logo placement, and subtitle style. Each field maps directly to the
          FFmpeg filter chain at render time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={value.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kind">Kind</Label>
            <select
              id="kind"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={value.kind}
              onChange={(e) => setField('kind', e.target.value as 'longform' | 'shortform')}
            >
              <option value="longform">Longform</option>
              <option value="shortform">Shortform</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="orientation">Orientation</Label>
            <select
              id="orientation"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={value.orientation}
              onChange={(e) => setField('orientation', e.target.value as 'horizontal' | 'vertical')}
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                type="number"
                value={value.width}
                onChange={(e) => setField('width', Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                type="number"
                value={value.height}
                onChange={(e) => setField('height', Number(e.target.value))}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="min-s">Min duration (s)</Label>
            <Input
              id="min-s"
              type="number"
              value={value.min_s}
              onChange={(e) => setField('min_s', Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="max-s">Max duration (s)</Label>
            <Input
              id="max-s"
              type="number"
              value={value.max_s}
              onChange={(e) => setField('max_s', Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fps">Frame rate</Label>
            <select
              id="fps"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={value.fps}
              onChange={(e) => setField('fps', Number(e.target.value) as 24 | 30 | 60)}
            >
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="crf">CRF (lower = better)</Label>
            <Input
              id="crf"
              type="number"
              min={14}
              max={32}
              value={value.crf}
              onChange={(e) => setField('crf', Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="encode-preset">x264 preset</Label>
            <select
              id="encode-preset"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={value.encode_preset}
              onChange={(e) =>
                setField('encode_preset', e.target.value as PresetEditorValue['encode_preset'])
              }
            >
              {['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'].map(
                (p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="audio-bitrate">Audio bitrate (kbps)</Label>
            <Input
              id="audio-bitrate"
              type="number"
              min={64}
              max={320}
              value={value.audio_bitrate_kbps}
              onChange={(e) => setField('audio_bitrate_kbps', Number(e.target.value))}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="logo">Logo (optional)</Label>
            <select
              id="logo"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={value.logo_id}
              onChange={(e) => setField('logo_id', e.target.value)}
            >
              <option value="">— no logo —</option>
              {logos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.filename}
                </option>
              ))}
            </select>
          </div>
          {value.logo_id ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="logo-anchor">Anchor</Label>
                <select
                  id="logo-anchor"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={value.logo_anchor}
                  onChange={(e) =>
                    setField('logo_anchor', e.target.value as PresetEditorValue['logo_anchor'])
                  }
                >
                  {ANCHORS.map((a) => (
                    <option key={a} value={a}>
                      {a.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="logo-padding">Padding (px)</Label>
                <Input
                  id="logo-padding"
                  type="number"
                  value={value.logo_padding_px}
                  onChange={(e) => setField('logo_padding_px', Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="logo-scale">Scale (% of frame)</Label>
                <Input
                  id="logo-scale"
                  type="number"
                  min={1}
                  max={50}
                  value={value.logo_scale_pct}
                  onChange={(e) => setField('logo_scale_pct', Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="logo-opacity">Opacity (0–1)</Label>
                <Input
                  id="logo-opacity"
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={value.logo_opacity}
                  onChange={(e) => setField('logo_opacity', Number(e.target.value))}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="subtitles">Burn-in subtitles</Label>
            <input
              id="subtitles"
              type="checkbox"
              checked={value.subtitles_enabled}
              onChange={(e) => setField('subtitles_enabled', e.target.checked)}
              className="size-4"
            />
          </div>
          {value.subtitles_enabled ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="font-family">Font family</Label>
                <Input
                  id="font-family"
                  value={value.font_family}
                  onChange={(e) => setField('font_family', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="font-size">Font size (px)</Label>
                <Input
                  id="font-size"
                  type="number"
                  value={value.font_size_px}
                  onChange={(e) => setField('font_size_px', Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="primary-color">Primary color</Label>
                <Input
                  id="primary-color"
                  value={value.primary_color}
                  onChange={(e) => setField('primary_color', e.target.value)}
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="outline-color">Outline color</Label>
                <Input
                  id="outline-color"
                  value={value.outline_color}
                  onChange={(e) => setField('outline_color', e.target.value)}
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="outline-width">Outline width</Label>
                <Input
                  id="outline-width"
                  type="number"
                  min={0}
                  max={20}
                  value={value.outline_width}
                  onChange={(e) => setField('outline_width', Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="alignment">Alignment</Label>
                <select
                  id="alignment"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={value.alignment}
                  onChange={(e) =>
                    setField('alignment', e.target.value as PresetEditorValue['alignment'])
                  }
                >
                  {ANCHORS.map((a) => (
                    <option key={a} value={a}>
                      {a.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="margin-v">Vertical margin (px)</Label>
                <Input
                  id="margin-v"
                  type="number"
                  min={0}
                  max={800}
                  value={value.margin_v_px}
                  onChange={(e) => setField('margin_v_px', Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="max-lines">Max lines</Label>
                <Input
                  id="max-lines"
                  type="number"
                  min={1}
                  max={8}
                  value={value.max_lines}
                  onChange={(e) => setField('max_lines', Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="safe-area">Safe area (px)</Label>
                <Input
                  id="safe-area"
                  type="number"
                  min={0}
                  max={800}
                  value={value.safe_area_px}
                  onChange={(e) => setField('safe_area_px', Number(e.target.value))}
                />
              </div>
            </div>
          ) : null}
        </section>
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save preset'}
        </Button>
      </CardFooter>
    </Card>
  );
}
