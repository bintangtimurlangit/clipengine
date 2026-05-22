/**
 * Settings repository.
 *
 * Each setting is a JSON blob keyed by `(user_id, key)`. Reads
 * validate against the matching schema in
 * {@link SETTING_SCHEMAS}; writes accept a parsed value and
 * serialize it as JSON. Routes always go through this repo so that
 * raw blobs never leak through the API.
 */

import { SETTING_SCHEMAS, type SettingKey } from '@clipengine/schemas';
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { setting } from '../schema/settings.js';

type SchemaFor<K extends SettingKey> = (typeof SETTING_SCHEMAS)[K];
type ValueFor<K extends SettingKey> = ReturnType<SchemaFor<K>['parse']>;

export class SettingsRepo {
  constructor(private readonly db: DbClient) {}

  /** Fetch and validate a single setting. Returns `null` if missing. */
  async get<K extends SettingKey>(userId: string, key: K): Promise<ValueFor<K> | null> {
    const rows = this.db
      .select({ value: setting.value })
      .from(setting)
      .where(and(eq(setting.userId, userId), eq(setting.key, key)))
      .all();
    const row = rows[0];
    if (!row) return null;
    const schema = SETTING_SCHEMAS[key] as SchemaFor<K>;
    return schema.parse(row.value) as ValueFor<K>;
  }

  /** Validate and upsert a setting. Returns the parsed value. */
  async set<K extends SettingKey>(userId: string, key: K, value: unknown): Promise<ValueFor<K>> {
    const schema = SETTING_SCHEMAS[key] as SchemaFor<K>;
    const parsed = schema.parse(value) as ValueFor<K>;
    this.db
      .insert(setting)
      .values({ userId, key, value: parsed as unknown })
      .onConflictDoUpdate({
        target: [setting.userId, setting.key],
        set: { value: parsed as unknown, updatedAt: new Date() },
      })
      .run();
    return parsed;
  }

  async delete(userId: string, key: SettingKey): Promise<void> {
    this.db
      .delete(setting)
      .where(and(eq(setting.userId, userId), eq(setting.key, key)))
      .run();
  }
}
