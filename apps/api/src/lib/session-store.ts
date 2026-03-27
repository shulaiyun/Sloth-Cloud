import { randomUUID } from 'node:crypto';

export interface SessionRecord {
  accessToken: string;
  createdAt: number;
  updatedAt: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly ttlMs: number) {}

  create(accessToken: string) {
    const id = randomUUID();
    const now = Date.now();

    this.sessions.set(id, {
      accessToken,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  get(id?: string | null) {
    if (!id) {
      return null;
    }

    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }

    if (Date.now() - session.updatedAt > this.ttlMs) {
      this.sessions.delete(id);
      return null;
    }

    session.updatedAt = Date.now();
    return session;
  }

  destroy(id?: string | null) {
    if (!id) {
      return;
    }

    this.sessions.delete(id);
  }

  rotate(id: string, accessToken: string) {
    this.destroy(id);
    return this.create(accessToken);
  }

  cleanup() {
    const cutoff = Date.now() - this.ttlMs;

    for (const [id, session] of this.sessions.entries()) {
      if (session.updatedAt < cutoff) {
        this.sessions.delete(id);
      }
    }
  }
}
