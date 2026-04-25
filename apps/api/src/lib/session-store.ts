// @ts-nocheck
import { randomUUID } from 'node:crypto';
export class SessionStore {
    ttlMs;
    sessions = new Map();
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    create(accessToken) {
        const id = randomUUID();
        const now = Date.now();
        this.sessions.set(id, {
            accessToken,
            createdAt: now,
            updatedAt: now,
        });
        return id;
    }
    get(id) {
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
    destroy(id) {
        if (!id) {
            return;
        }
        this.sessions.delete(id);
    }
    rotate(id, accessToken) {
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
