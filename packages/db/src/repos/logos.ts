/**
 * Logos repository. Stores metadata only; the binary lives on disk
 * under `<DATA_DIR>/logos/<id>.<ext>`.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { type LogoRow, type NewLogoRow, logo } from '../schema/logos.js';

export class LogosRepo {
  constructor(private readonly db: DbClient) {}

  async create(input: NewLogoRow): Promise<LogoRow> {
    const rows = this.db.insert(logo).values(input).returning().all();
    const row = rows[0];
    if (!row) throw new Error('logo: insert returned no rows');
    return row;
  }

  async findById(userId: string, id: string): Promise<LogoRow | null> {
    const rows = this.db
      .select()
      .from(logo)
      .where(and(eq(logo.id, id), eq(logo.userId, userId)))
      .all();
    return rows[0] ?? null;
  }

  /** Most recent first. */
  async listForUser(userId: string): Promise<LogoRow[]> {
    return this.db
      .select()
      .from(logo)
      .where(eq(logo.userId, userId))
      .orderBy(desc(logo.createdAt))
      .all();
  }

  async deleteById(userId: string, id: string): Promise<void> {
    this.db
      .delete(logo)
      .where(and(eq(logo.id, id), eq(logo.userId, userId)))
      .run();
  }
}
