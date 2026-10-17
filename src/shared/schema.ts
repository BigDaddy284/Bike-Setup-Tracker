// Single source of truth for the Bike Setup Tracker data format.
//
// The Android app (Capacitor build of the same web code) writes backups named
// `suspension_tracker_backup_YYYYMMDD.json` to Documents via "Export Data".
// Windows reads and writes exactly the same shape, so a file can move between
// devices in either direction. Change this file, not the UI, when the format changes.

export type Condition = 'Dry' | 'Wet';
export type ProfileId = 1 | 2 | 3;
export type Theme = 'dark' | 'light';

export interface Bike {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  name: string;
  mapLink?: string;
  activeCondition: Condition;
}

export interface SuspensionSettingValues {
  frontCompression?: number;
  frontRebound?: number;
  frontAirPressure?: number;
  rearLowSpeedCompression?: number;
  rearHighSpeedCompression?: number;
  rearLowSpeedRebound?: number;
  rearHighSpeedRebound?: number;
  frontTyrePressure?: number;
  rearTyrePressure?: number;
  forkHeight?: number; // mm past top clamp, 1 decimal place
  notes?: string;
}

export type NumericSettingKey = keyof Omit<SuspensionSettingValues, 'notes'>;

export interface SuspensionSetting {
  bikeId: string;
  trackId: string;
  condition: Condition;
  profileId: ProfileId;
  settings: SuspensionSettingValues;
}

/** The exported backup file, as written by Android and Windows. */
export interface BackupFile {
  bikes: Bike[];
  tracks: Track[];
  settings: SuspensionSetting[];
  selectedBikeId: string | null;
  selectedTrackId: string | null;
  currentTrackCondition: Condition;
  selectedProfileId: ProfileId;
  isSidebarCollapsed: boolean;
  currentTheme: Theme;
}

/** localStorage key used by the Android app; kept identical on Windows. */
export const LOCAL_STORAGE_KEY = 'suspensionTrackerData_v2_profiles_notes';
export const BACKUP_FILE_PREFIX = 'suspension_tracker_backup_';

export const MAX_BIKES = 50;
export const MAX_TRACKS = 100;
export const MAX_NOTES_LENGTH = 1000;
export const MAX_NAME_LENGTH = 50;

export const SUSPENSION_SETTING_MAX_VALUES: Partial<Record<NumericSettingKey, number>> = {
  frontCompression: 40,
  frontRebound: 40,
  frontAirPressure: 200,
  rearLowSpeedCompression: 40,
  rearHighSpeedCompression: 40,
  rearLowSpeedRebound: 40,
  rearHighSpeedRebound: 40,
  frontTyrePressure: 30,
  rearTyrePressure: 30,
  forkHeight: 50,
};

export const DEFAULT_SUSPENSION_SETTINGS: SuspensionSettingValues = {
  frontCompression: 0, frontRebound: 0, frontAirPressure: 0,
  rearLowSpeedCompression: 0, rearHighSpeedCompression: 0,
  rearLowSpeedRebound: 0, rearHighSpeedRebound: 0,
  frontTyrePressure: 0, rearTyrePressure: 0,
  forkHeight: 0.0,
  notes: '',
};

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function isValidURL(string: string): boolean {
  if (!string || string.trim() === '') return true;
  try {
    const urlToTest = string.startsWith('www.') ? `http://${string}` : string;
    new URL(urlToTest);
    return true;
  } catch (_) {
    return false;
  }
}

const isCondition = (v: unknown): v is Condition => v === 'Dry' || v === 'Wet';
const isProfileId = (v: unknown): v is ProfileId => v === 1 || v === 2 || v === 3;
const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light';

export function normalizeBike(b: any): Bike {
  return { id: b?.id || generateId(), name: String(b?.name || 'Unnamed Bike').slice(0, MAX_NAME_LENGTH) };
}

export function normalizeTrack(t: any): Track {
  return {
    id: t?.id || generateId(),
    name: String(t?.name || 'Unnamed Track').slice(0, MAX_NAME_LENGTH),
    mapLink: typeof t?.mapLink === 'string' && isValidURL(t.mapLink) ? t.mapLink : undefined,
    activeCondition: isCondition(t?.activeCondition) ? t.activeCondition : 'Dry',
  };
}

/** Fills missing values with defaults, clamps numbers to their range, trims notes. */
export function normalizeSettingValues(raw: any): SuspensionSettingValues {
  const source = raw && typeof raw === 'object' ? raw : {};
  const values: SuspensionSettingValues = {};
  for (const key of Object.keys(DEFAULT_SUSPENSION_SETTINGS) as Array<keyof SuspensionSettingValues>) {
    if (key === 'notes') {
      values.notes = typeof source.notes === 'string' ? source.notes.slice(0, MAX_NOTES_LENGTH) : '';
      continue;
    }
    const fallback = DEFAULT_SUSPENSION_SETTINGS[key] as number;
    const rawValue = source[key] ?? fallback;
    let n = key === 'forkHeight' ? parseFloat(String(rawValue)) : parseInt(String(rawValue), 10);
    if (isNaN(n)) n = fallback;
    const max = SUSPENSION_SETTING_MAX_VALUES[key];
    n = max !== undefined ? Math.min(Math.max(0, n), max) : Math.max(0, n);
    values[key] = n;
  }
  return values;
}

export function normalizeSetting(s: any): SuspensionSetting {
  return {
    bikeId: s?.bikeId,
    trackId: s?.trackId,
    condition: isCondition(s?.condition) ? s.condition : 'Dry',
    profileId: isProfileId(s?.profileId) ? s.profileId : 1,
    settings: normalizeSettingValues(s?.settings),
  };
}

export interface BackupDefaults {
  bikes: Bike[];
  tracks: Track[];
  theme: Theme;
}

/**
 * Validates a parsed backup file (from Android or Windows) and returns a clean copy.
 * Mirrors the Android app's "Import Data" rules: lists are capped, settings that point
 * at a missing bike or track are dropped, and bad selections fall back to the first item.
 * Throws if the input is not a JSON object.
 */
export function parseBackup(raw: unknown, defaults: BackupDefaults): BackupFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Not a Bike Setup Tracker backup file.');
  }
  const r = raw as any;

  const bikes: Bike[] = sortByName<Bike>(Array.isArray(r.bikes) ? r.bikes.map(normalizeBike) : [...defaults.bikes]).slice(0, MAX_BIKES);
  const tracks: Track[] = sortByName<Track>(Array.isArray(r.tracks) ? r.tracks.map(normalizeTrack) : [...defaults.tracks]).slice(0, MAX_TRACKS);

  const settings: SuspensionSetting[] = Array.isArray(r.settings)
    ? r.settings
        .filter((s: unknown) => typeof s === 'object' && s !== null)
        .map(normalizeSetting)
        .filter((s: SuspensionSetting) => bikes.some(b => b.id === s.bikeId) && tracks.some(t => t.id === s.trackId))
    : [];

  const selectedBikeId = bikes.some(b => b.id === r.selectedBikeId) ? r.selectedBikeId : (bikes[0]?.id || null);
  const selectedTrackId = tracks.some(t => t.id === r.selectedTrackId) ? r.selectedTrackId : (tracks[0]?.id || null);
  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  return {
    bikes,
    tracks,
    settings,
    selectedBikeId,
    selectedTrackId,
    currentTrackCondition: selectedTrack ? selectedTrack.activeCondition : 'Dry',
    selectedProfileId: isProfileId(r.selectedProfileId) ? r.selectedProfileId : 1,
    isSidebarCollapsed: typeof r.isSidebarCollapsed === 'boolean' ? r.isSidebarCollapsed : false,
    currentTheme: isTheme(r.currentTheme) ? r.currentTheme : defaults.theme,
  };
}

/** Builds the backup object in the exact field order the Android app exports. */
export function toBackup(state: BackupFile): BackupFile {
  return {
    bikes: state.bikes,
    tracks: state.tracks,
    settings: state.settings,
    selectedBikeId: state.selectedBikeId,
    selectedTrackId: state.selectedTrackId,
    currentTrackCondition: state.currentTrackCondition,
    selectedProfileId: state.selectedProfileId,
    isSidebarCollapsed: state.isSidebarCollapsed,
    currentTheme: state.currentTheme,
  };
}

export function serializeBackup(state: BackupFile): string {
  return JSON.stringify(toBackup(state), null, 2);
}

export function backupFileName(date = new Date()): string {
  return `${BACKUP_FILE_PREFIX}${date.toISOString().slice(0, 10).replace(/-/g, '')}.json`;
}
