import { attendanceStore } from '../local/attendanceStore';
import { supabaseAttendanceRemote } from './remoteAttendance';
import { SyncEngine } from './syncEngine';

/** Instância única do motor de sincronização. */
export const syncEngine = new SyncEngine(attendanceStore, supabaseAttendanceRemote);
