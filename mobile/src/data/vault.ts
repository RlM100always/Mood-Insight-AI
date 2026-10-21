import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type {Entry, EntryInput, Session} from '../types';

const DB_NAME = 'mood_insight_private.db';
const KEY_ALIAS = 'mood_insight_cipher_key_v1';
const CONSENT_ALIAS = 'mood_insight_privacy_consent_v1';
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
let database: SQLite.SQLiteDatabase | null = null;

function randomHex(size: number): string {
  return Array.from(Crypto.getRandomBytes(size), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hasConsent(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CONSENT_ALIAS)) === 'accepted';
}

export async function acceptConsent(): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_ALIAS, 'accepted');
}

export async function openVault(): Promise<void> {
  if (database) return;
  if (!(await hasConsent())) throw new Error('Read and accept the local privacy notice first.');
  let key = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!key) {
    key = randomHex(32);
    await SecureStore.setItemAsync(KEY_ALIAS, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid secure database key.');
  const candidate = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    // SQLCipher raw 256-bit key. Do not log key, SQL, or database contents.
    await candidate.execAsync('PRAGMA key = "x' + "'" + key + "'" + '";');
    const cipher = await candidate.getFirstAsync<{cipher_version: string}>('PRAGMA cipher_version;');
    if (!cipher?.cipher_version) throw new Error('SQLCipher unavailable. Build the native app with useSQLCipher: true; Expo Go will not work.');
    await candidate.execAsync('PRAGMA foreign_keys = ON;');
    await candidate.execAsync(
      'CREATE TABLE IF NOT EXISTS mood_entries (' +
      'id TEXT PRIMARY KEY NOT NULL, day TEXT UNIQUE NOT NULL, mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),' +
      'sleep_hours REAL NOT NULL, exercise_min INTEGER NOT NULL, stress INTEGER NOT NULL CHECK(stress BETWEEN 1 AND 5),' +
      'note TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);' +
      'CREATE INDEX IF NOT EXISTS idx_mood_day ON mood_entries(day DESC);' +
      'CREATE TABLE IF NOT EXISTS activity_sessions (' +
      'id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL, day TEXT NOT NULL,' +
      'created_at INTEGER NOT NULL, helpful INTEGER);'
    );
    database = candidate;
    await purgeExpired();
  } catch (e) {
    await candidate.closeAsync();
    throw e;
  }
}

function db(): SQLite.SQLiteDatabase {
  if (!database) throw new Error('Secure database not initialized.');
  return database;
}

export async function purgeExpired(): Promise<void> {
  const limit = Date.now() - RETENTION_MS;
  await db().runAsync('DELETE FROM mood_entries WHERE created_at < ?', limit);
  await db().runAsync('DELETE FROM activity_sessions WHERE created_at < ?', limit);
}

export async function listEntries(): Promise<Entry[]> {
  await purgeExpired();
  return db().getAllAsync<Entry>('SELECT * FROM mood_entries ORDER BY day DESC');
}

export async function saveEntry(input: EntryInput): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) ||
    !Number.isInteger(input.mood) || input.mood < 1 || input.mood > 5 ||
    !Number.isFinite(input.sleep_hours) || input.sleep_hours < 0 || input.sleep_hours > 24 ||
    !Number.isInteger(input.exercise_min) || input.exercise_min < 0 || input.exercise_min > 600 ||
    !Number.isInteger(input.stress) || input.stress < 1 || input.stress > 5 ||
    input.note.length > 2000) throw new Error('Check input values (sleep 0-24h, exercise 0-600min, mood/stress 1-5).');
  const current = Date.now();
  // A day can be edited without increasing the entry count.
  await db().runAsync(
    'INSERT INTO mood_entries (id,day,mood,sleep_hours,exercise_min,stress,note,created_at,updated_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET mood=excluded.mood,' +
    'sleep_hours=excluded.sleep_hours,exercise_min=excluded.exercise_min,stress=excluded.stress,' +
    'note=excluded.note,updated_at=excluded.updated_at',
    randomHex(16), input.day, input.mood, input.sleep_hours, input.exercise_min,
    input.stress, input.note.trim(), current, current
  );
  await purgeExpired();
}

export async function removeEntry(id: string): Promise<void> {
  await db().runAsync('DELETE FROM mood_entries WHERE id=?', id);
}

export async function listSessions(): Promise<Session[]> {
  await purgeExpired();
  return db().getAllAsync<Session>('SELECT * FROM activity_sessions ORDER BY created_at DESC');
}

export async function logSession(activityId: string, day: string): Promise<void> {
  await db().runAsync('INSERT INTO activity_sessions (id,activity_id,day,created_at,helpful) VALUES (?,?,?,?,NULL)',
    randomHex(16), activityId, day, Date.now());
}

export async function rateSession(id: string, helpful: boolean): Promise<void> {
  await db().runAsync('UPDATE activity_sessions SET helpful=? WHERE id=?', helpful ? 1 : 0, id);
}

export async function eraseEverything(): Promise<void> {
  const connection = db();
  await connection.execAsync('DELETE FROM mood_entries; DELETE FROM activity_sessions;');
  await connection.closeAsync();
  database = null;
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await SecureStore.deleteItemAsync(KEY_ALIAS);
  await SecureStore.deleteItemAsync(CONSENT_ALIAS);
}
