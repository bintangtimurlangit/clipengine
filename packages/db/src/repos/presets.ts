/**
 * Presets repository. The `definition` JSON column is validated
 * against `PresetSchema` on every read and write so a malformed blob
 * never reaches the renderer.
 */

import { randomUUID } from 'node:crypto';
import {
  type ClipKind,
  PRESET_SCHEMA_VERSION,
  type Preset,
  type PresetInput,
  PresetSchema,
} from '@clipengine/schemas';
import { and, asc, eq } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { type PresetRow, preset } from '../schema/presets.js';

export class PresetsRepo {
  constructor(private readonly db: DbClient) {}

  /** Validate, persist, and return the full Preset (with id + version). */
  async create(
    userId: string,
    input: PresetInput,
    options: { isDefault?: boolean; id?: string } = {},
  ): Promise<Preset> {
    const id = options.id ?? randomUUID();
    const definition: Preset = PresetSchema.parse({
      ...input,
      id,
      schema_version: PRESET_SCHEMA_VERSION,
    });
    this.db
      .insert(preset)
      .values({
        id,
        userId,
        name: definition.name,
        kind: definition.kind,
        schemaVersion: PRESET_SCHEMA_VERSION,
        definition: definition as unknown,
        isDefault: options.isDefault ?? false,
      })
      .run();
    return definition;
  }

  async findById(userId: string, id: string): Promise<Preset | null> {
    const rows = this.db
      .select()
      .from(preset)
      .where(and(eq(preset.id, id), eq(preset.userId, userId)))
      .all();
    const row = rows[0];
    return row ? PresetSchema.parse(row.definition) : null;
  }

  /** Sorted by name; most-recent default first. */
  async listForUser(userId: string, filter: { kind?: ClipKind } = {}): Promise<Preset[]> {
    const where = filter.kind
      ? and(eq(preset.userId, userId), eq(preset.kind, filter.kind))
      : eq(preset.userId, userId);
    const rows = this.db.select().from(preset).where(where).orderBy(asc(preset.name)).all();
    return rows.map((r: PresetRow) => PresetSchema.parse(r.definition));
  }

  async update(userId: string, id: string, input: PresetInput): Promise<Preset> {
    const existing = await this.findById(userId, id);
    if (!existing) throw new Error(`preset ${id} not found`);
    const definition: Preset = PresetSchema.parse({
      ...input,
      id,
      schema_version: PRESET_SCHEMA_VERSION,
    });
    this.db
      .update(preset)
      .set({
        name: definition.name,
        kind: definition.kind,
        definition: definition as unknown,
        updatedAt: new Date(),
      })
      .where(and(eq(preset.id, id), eq(preset.userId, userId)))
      .run();
    return definition;
  }

  async deleteById(userId: string, id: string): Promise<void> {
    this.db
      .delete(preset)
      .where(and(eq(preset.id, id), eq(preset.userId, userId)))
      .run();
  }
}
