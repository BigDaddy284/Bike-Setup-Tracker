import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBackup, serializeBackup, backupFileName, BackupDefaults } from '../src/shared/schema';

const defaults: BackupDefaults = { bikes: [], tracks: [], theme: 'dark' };
const androidFile = readFileSync(path.join(__dirname, 'fixtures', 'android_backup_example.json'), 'utf8');

describe('Android backup compatibility', () => {
  it('reads every bike, track and setting from an Android export', () => {
    const backup = parseBackup(JSON.parse(androidFile), defaults);
    expect(backup.bikes.map(b => b.name)).toEqual(['KTM 450 SX-F', 'Stark Varg MX 80HP 2025']);
    expect(backup.tracks).toHaveLength(3);
    expect(backup.settings).toHaveLength(2);
    const wet = backup.settings.find(s => s.condition === 'Wet')!;
    expect(wet.profileId).toBe(2);
    expect(wet.settings.forkHeight).toBe(4.5);
    expect(wet.settings.notes).toContain('Sand ruts');
    expect(backup.selectedTrackId).toBe('default-track-5');
    expect(backup.currentTrackCondition).toBe('Wet');
  });

  it('writes a file the Android importer reads back unchanged', () => {
    const once = parseBackup(JSON.parse(androidFile), defaults);
    const written = serializeBackup(once);
    expect(parseBackup(JSON.parse(written), defaults)).toEqual(once);
    expect(Object.keys(JSON.parse(written))).toEqual(Object.keys(JSON.parse(androidFile)));
  });

  it('applies the Android validation rules to bad input', () => {
    const backup = parseBackup({
      bikes: [{ id: 'b', name: 'B' }],
      tracks: [{ id: 't', name: 'T', mapLink: 'not a url', activeCondition: 'Snow' }],
      settings: [
        { bikeId: 'b', trackId: 't', condition: 'Dry', profileId: 7, settings: { frontCompression: 99, forkHeight: '3.25', rearTyrePressure: -2 } },
        { bikeId: 'gone', trackId: 't', condition: 'Dry', profileId: 1, settings: {} },
      ],
      currentTheme: 'purple',
    }, defaults);
    expect(backup.tracks[0].mapLink).toBeUndefined();
    expect(backup.tracks[0].activeCondition).toBe('Dry');
    expect(backup.settings).toHaveLength(1);
    expect(backup.settings[0].profileId).toBe(1);
    expect(backup.settings[0].settings.frontCompression).toBe(40);
    expect(backup.settings[0].settings.forkHeight).toBe(3.25);
    expect(backup.settings[0].settings.rearTyrePressure).toBe(0);
    expect(backup.settings[0].settings.notes).toBe('');
    expect(backup.currentTheme).toBe('dark');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup([1, 2], defaults)).toThrow();
    expect(() => parseBackup(null, defaults)).toThrow();
  });

  it('uses the Android file name pattern', () => {
    expect(backupFileName(new Date('2026-10-17T09:00:00Z'))).toBe('suspension_tracker_backup_20261017.json');
  });
});
