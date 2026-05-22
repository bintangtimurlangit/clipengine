/**
 * User repository. Wraps the auth-managed `user` table with helpers
 * that are convenient for the registration flow and for checking
 * whether the single-admin slot is taken.
 */

import { count, eq } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { type UserRow, user } from '../schema/auth.js';

export class UsersRepo {
  constructor(private readonly db: DbClient) {}

  /** Total number of users. Used to decide whether registration is open. */
  async count(): Promise<number> {
    const rows = this.db.select({ value: count() }).from(user).all();
    return rows[0]?.value ?? 0;
  }

  async findByUsername(username: string): Promise<UserRow | null> {
    const rows = this.db.select().from(user).where(eq(user.username, username)).all();
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const rows = this.db.select().from(user).where(eq(user.id, id)).all();
    return rows[0] ?? null;
  }
}
