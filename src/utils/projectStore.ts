import type { Project } from '../types';
import type { SnapshotEntry } from './snapshots';

const DB_NAME = 'gannt-db';
const STORE = 'projects';
const REGISTRY_KEY = '__registry__';
const LEGACY_KEY = 'gannt-project';
const SNAPSHOT_PREFIX = '__snapshots__:';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

export interface Registry {
  activeId: string;
  projects: ProjectMeta[];
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getDB() {
  const { openDB } = await import('idb');
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
}

export async function loadRegistry(): Promise<Registry | null> {
  try {
    const db = await getDB();
    const reg = await db.get(STORE, REGISTRY_KEY);
    db.close();
    return (reg as Registry) ?? null;
  } catch {
    return null;
  }
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const db = await getDB();
  await db.put(STORE, registry, REGISTRY_KEY);
  db.close();
}

export async function loadProjectById(id: string): Promise<Project | null> {
  try {
    const db = await getDB();
    const p = await db.get(STORE, id);
    db.close();
    return (p as Project) ?? null;
  } catch {
    return null;
  }
}

export async function saveProjectById(id: string, project: Project): Promise<void> {
  const db = await getDB();
  await db.put(STORE, project, id);
  db.close();
}

export async function deleteProjectById(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
  db.close();
}

/** 旧バージョンの単一スロット（'gannt-project'）を読む */
export async function loadLegacyProject(): Promise<Project | null> {
  try {
    const db = await getDB();
    const p = await db.get(STORE, LEGACY_KEY);
    db.close();
    return (p as Project) ?? null;
  } catch {
    return null;
  }
}

export async function deleteLegacyProject(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, LEGACY_KEY);
    db.close();
  } catch {
    /* noop */
  }
}

export async function loadSnapshots(projectId: string): Promise<SnapshotEntry[]> {
  try {
    const db = await getDB();
    const snaps = await db.get(STORE, SNAPSHOT_PREFIX + projectId);
    db.close();
    return (snaps as SnapshotEntry[]) ?? [];
  } catch {
    return [];
  }
}

export async function saveSnapshots(projectId: string, snaps: SnapshotEntry[]): Promise<void> {
  const db = await getDB();
  await db.put(STORE, snaps, SNAPSHOT_PREFIX + projectId);
  db.close();
}

export async function deleteSnapshots(projectId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, SNAPSHOT_PREFIX + projectId);
    db.close();
  } catch {
    /* noop */
  }
}
