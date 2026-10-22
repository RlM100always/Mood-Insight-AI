import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type {Entry, EntryInput, Session} from '../types';
import {localDay} from '../insights';
import {DEFAULT_PREFERENCES, CONTEXT_TAGS} from '../deep';
import type {Preferences} from '../deep';
import {validateBackupPayload} from '../backup';
import type {BackupPayload} from '../backup';

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
    const columns = await candidate.getAllAsync<{name:string}>('PRAGMA table_info(mood_entries)');
    const existing = new Set(columns.map(c=>c.name));
    if(!existing.has('energy')) await candidate.execAsync('ALTER TABLE mood_entries ADD COLUMN energy INTEGER NOT NULL DEFAULT 3');
    if(!existing.has('sleep_quality')) await candidate.execAsync('ALTER TABLE mood_entries ADD COLUMN sleep_quality INTEGER NOT NULL DEFAULT 3');
    if(!existing.has('context_tags')) await candidate.execAsync("ALTER TABLE mood_entries ADD COLUMN context_tags TEXT NOT NULL DEFAULT ''");
    // Legacy records cannot prove which optional values were actually entered.
    // Default all new provenance flags to 0 rather than treating old defaults as observations.
    const measurementColumns = await candidate.getAllAsync<{name:string}>('PRAGMA table_info(mood_entries)');
    const measurementNames = new Set(measurementColumns.map(c=>c.name));
    for (const name of ['sleep_recorded','exercise_recorded','stress_recorded','energy_recorded','sleep_quality_recorded']) {
      if (!measurementNames.has(name)) await candidate.execAsync('ALTER TABLE mood_entries ADD COLUMN '+name+' INTEGER NOT NULL DEFAULT 0 CHECK('+name+' IN (0,1))');
    }
    const sessionColumns = await candidate.getAllAsync<{name:string}>('PRAGMA table_info(activity_sessions)');
    const activityExisting = new Set(sessionColumns.map(c=>c.name));
    if(!activityExisting.has('duration_seconds')) await candidate.execAsync('ALTER TABLE activity_sessions ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0');
    if(!activityExisting.has('mood_before')) await candidate.execAsync('ALTER TABLE activity_sessions ADD COLUMN mood_before INTEGER');
    if(!activityExisting.has('mood_after')) await candidate.execAsync('ALTER TABLE activity_sessions ADD COLUMN mood_after INTEGER');
    await candidate.execAsync("CREATE TABLE IF NOT EXISTS user_preferences (id INTEGER PRIMARY KEY CHECK(id=1), focus TEXT NOT NULL, max_minutes INTEGER NOT NULL, weekly_checkins INTEGER NOT NULL, weekly_activities INTEGER NOT NULL)");
    database = candidate;
    await purgeExpired();
  } catch (e) {
    // Candidate may already have been assigned before purgeExpired throws.
    // Never leave a closed DB cached as the current unlocked vault.
    if (database === candidate) database = null;
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
  const cutoffDay = localDay(new Date(limit));
  await db().runAsync('DELETE FROM mood_entries WHERE day < ?', cutoffDay);
  await db().runAsync('DELETE FROM activity_sessions WHERE day < ? OR created_at < ?', cutoffDay, limit);
}

export async function listEntries(): Promise<Entry[]> {
  await purgeExpired();
  return db().getAllAsync<Entry>('SELECT * FROM mood_entries ORDER BY day DESC');
}

export async function saveEntry(input: EntryInput): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) ||
    !Number.isFinite(new Date(input.day + 'T12:00:00').getTime()) ||
    localDay(new Date(input.day + 'T12:00:00')) !== input.day ||
    input.day > localDay() ||
    input.day < localDay(new Date(Date.now() - RETENTION_MS)) ||
    !Number.isInteger(input.mood) || input.mood < 1 || input.mood > 5 ||
    !Number.isFinite(input.sleep_hours) || input.sleep_hours < 0 || input.sleep_hours > 24 ||
    !Number.isInteger(input.exercise_min) || input.exercise_min < 0 || input.exercise_min > 600 ||
    !Number.isInteger(input.stress) || input.stress < 1 || input.stress > 5 ||
    !Number.isInteger(input.energy) || input.energy < 1 || input.energy > 5 ||
    !Number.isInteger(input.sleep_quality) || input.sleep_quality < 1 || input.sleep_quality > 5 ||
    input.context_tags.length > 250 || input.context_tags.split(',').some(t=>t.length>0&&!CONTEXT_TAGS.some(c=>c===t)) ||
    input.note.length > 2000 ||
    [input.sleep_recorded,input.exercise_recorded,input.stress_recorded,input.energy_recorded,input.sleep_quality_recorded].some(v=>v!==0&&v!==1))
    throw new Error('Check date, mood, optional measurements, provenance flags, notes and contexts.');
  const current = Date.now();
  // A day can be edited without increasing the entry count.
  await db().runAsync(
    'INSERT INTO mood_entries (id,day,mood,sleep_hours,exercise_min,stress,note,created_at,updated_at,energy,sleep_quality,context_tags,sleep_recorded,exercise_recorded,stress_recorded,energy_recorded,sleep_quality_recorded) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET mood=excluded.mood,' +
    'sleep_hours=excluded.sleep_hours,exercise_min=excluded.exercise_min,stress=excluded.stress,' +
    'note=excluded.note,energy=excluded.energy,sleep_quality=excluded.sleep_quality,' +
    'context_tags=excluded.context_tags,sleep_recorded=excluded.sleep_recorded,exercise_recorded=excluded.exercise_recorded,' +
    'stress_recorded=excluded.stress_recorded,energy_recorded=excluded.energy_recorded,sleep_quality_recorded=excluded.sleep_quality_recorded,updated_at=excluded.updated_at',
    randomHex(16), input.day, input.mood, input.sleep_hours, input.exercise_min,
    input.stress, input.note.trim(), current, current, input.energy, input.sleep_quality,input.context_tags,
    input.sleep_recorded,input.exercise_recorded,input.stress_recorded,input.energy_recorded,input.sleep_quality_recorded
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

export async function logSession(activityId: string, day: string, durationSeconds=0, moodBefore: number | null=null): Promise<void> {
  if(!/^[a-z]+$/.test(activityId) || day !== localDay() || !Number.isFinite(durationSeconds) || durationSeconds<0 || durationSeconds>7200 || (moodBefore!==null && (!Number.isInteger(moodBefore)||moodBefore<1||moodBefore>5))) throw new Error('Invalid activity record.');
  await db().runAsync('INSERT INTO activity_sessions (id,activity_id,day,created_at,helpful,duration_seconds,mood_before,mood_after) VALUES (?,?,?,?,NULL,?,?,NULL)',
    randomHex(16), activityId, day, Date.now(), Math.floor(durationSeconds),moodBefore);
}

export async function rateSession(id: string, helpful: boolean, moodAfter: number | null = null): Promise<void> {
  if(moodAfter!==null && (!Number.isInteger(moodAfter) || moodAfter<1 || moodAfter>5))throw new Error('Invalid post-activity mood.');
  await db().runAsync('UPDATE activity_sessions SET helpful=?,mood_after=? WHERE id=?', helpful ? 1 : 0,moodAfter,id);
}
export async function loadPreferences():Promise<Preferences>{
  const row=await db().getFirstAsync<Preferences>('SELECT focus,max_minutes,weekly_checkins,weekly_activities FROM user_preferences WHERE id=1');
  return row||DEFAULT_PREFERENCES;
}
export async function savePreferences(value:Preferences):Promise<void>{
  if(!['balance','calm','sleep','energy','connection'].includes(value.focus) ||
    ![5,10,15,20,30].includes(value.max_minutes) ||
    !Number.isInteger(value.weekly_checkins)||value.weekly_checkins<1||value.weekly_checkins>7 ||
    !Number.isInteger(value.weekly_activities)||value.weekly_activities<1||value.weekly_activities>14)
    throw new Error('Invalid wellbeing preferences.');
  await db().runAsync('INSERT INTO user_preferences (id,focus,max_minutes,weekly_checkins,weekly_activities) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET focus=excluded.focus,max_minutes=excluded.max_minutes,weekly_checkins=excluded.weekly_checkins,weekly_activities=excluded.weekly_activities',value.focus,value.max_minutes,value.weekly_checkins,value.weekly_activities);
}

export async function createBackupSnapshot():Promise<BackupPayload>{
 return {schema:'mood-insight-backup',version:1,exported_at:new Date().toISOString(),entries:await listEntries(),sessions:await listSessions(),preferences:await loadPreferences()};
}
/** Merge backup records without overwriting an existing local check-in for the same date. */
export async function mergeBackupSnapshot(input:unknown):Promise<{entriesAdded:number;sessionsAdded:number}>{
 const payload=validateBackupPayload(input),connection=db();
 const beforeEntries=await connection.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM mood_entries');
 const beforeSessions=await connection.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM activity_sessions');
 await connection.withTransactionAsync(async()=>{
  for(const e of payload.entries)await connection.runAsync(
   'INSERT OR IGNORE INTO mood_entries (id,day,mood,sleep_hours,exercise_min,stress,note,created_at,updated_at,energy,sleep_quality,context_tags,sleep_recorded,exercise_recorded,stress_recorded,energy_recorded,sleep_quality_recorded) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   e.id,e.day,e.mood,e.sleep_hours,e.exercise_min,e.stress,e.note,e.created_at,e.updated_at,e.energy,e.sleep_quality,e.context_tags,e.sleep_recorded,e.exercise_recorded,e.stress_recorded,e.energy_recorded,e.sleep_quality_recorded);
  for(const s of payload.sessions)await connection.runAsync(
   'INSERT OR IGNORE INTO activity_sessions (id,activity_id,day,created_at,helpful,duration_seconds,mood_before,mood_after) VALUES (?,?,?,?,?,?,?,?)',
   s.id,s.activity_id,s.day,s.created_at,s.helpful,s.duration_seconds,s.mood_before,s.mood_after);
  const p=payload.preferences;
  await connection.runAsync('INSERT INTO user_preferences (id,focus,max_minutes,weekly_checkins,weekly_activities) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET focus=excluded.focus,max_minutes=excluded.max_minutes,weekly_checkins=excluded.weekly_checkins,weekly_activities=excluded.weekly_activities',p.focus,p.max_minutes,p.weekly_checkins,p.weekly_activities);
 });
 const afterEntries=await connection.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM mood_entries');
 const afterSessions=await connection.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM activity_sessions');
 return {entriesAdded:Math.max(0,(afterEntries?.count||0)-(beforeEntries?.count||0)),sessionsAdded:Math.max(0,(afterSessions?.count||0)-(beforeSessions?.count||0))};
}

export async function checkVaultHealth(): Promise<{cipher: string; database: string; journal: string; activities: string; preferences: string; optionalMeasurements:string}> {
  // Genuine on-device read/write test. Uses a disposable record in its own encrypted table;
  // it never changes the user's mood, journal or activity data.
  const connection = db();
  const version = await connection.getFirstAsync<{cipher_version: string}>('PRAGMA cipher_version;');
  if (!version?.cipher_version) throw new Error('SQLCipher is missing from this native build.');
  const tables = await connection.getAllAsync<{name: string}>("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('mood_entries','activity_sessions','user_preferences')");
  const measurementColumns=await connection.getAllAsync<{name:string}>('PRAGMA table_info(mood_entries)');
  const columnNames=new Set(measurementColumns.map(c=>c.name));
  const provenance=['sleep_recorded','exercise_recorded','stress_recorded','energy_recorded','sleep_quality_recorded'];
  for(const name of provenance)if(!columnNames.has(name))throw new Error('Missing optional-measurement provenance column: '+name);
  const names = new Set(tables.map(t => t.name));
  for (const name of ['mood_entries', 'activity_sessions', 'user_preferences']) {
    if (!names.has(name)) throw new Error('Missing encrypted database table: ' + name);
  }
  const token = randomHex(12);
  await connection.execAsync('CREATE TABLE IF NOT EXISTS __device_health_check (token TEXT PRIMARY KEY NOT NULL);');
  try {
    await connection.runAsync('INSERT INTO __device_health_check (token) VALUES (?)',token);
    const record = await connection.getFirstAsync<{token: string}>('SELECT token FROM __device_health_check WHERE token = ?', token);
    if (record?.token !== token) throw new Error('Encrypted database roundtrip did not match.');
  } finally {
    await connection.runAsync('DELETE FROM __device_health_check WHERE token=?',token);
  }
  // Read each feature's data path without mutating private records.
  await Promise.all([listEntries(), listSessions(),loadPreferences()]);
  return {cipher:version.cipher_version,database:'Encrypted read/write passed',
    journal:'Read passed',activities:'Read passed',preferences:'Read passed',
    optionalMeasurements:'Unknown/skipped fields are tracked separately'};
}

export async function eraseEverything(): Promise<void> {
  const connection = db();
  await connection.execAsync('DELETE FROM mood_entries; DELETE FROM activity_sessions; DELETE FROM user_preferences;');
  await connection.closeAsync();
  database = null;
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await SecureStore.deleteItemAsync(KEY_ALIAS);
  await SecureStore.deleteItemAsync(CONSENT_ALIAS);
}
