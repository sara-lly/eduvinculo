/** Entidades de domínio do Presença+ (espelham o banco, em camelCase). */
import type { IsoDate } from '@/core/dates';

export type MembershipRole = 'director' | 'coordinator' | 'teacher' | 'guardian' | 'student';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'justified';
export type SessionStatus = 'draft' | 'completed';
export type SchoolStatus = 'active' | 'suspended';
export type FollowupStatus = 'open' | 'in_progress' | 'closed';
export type NotificationType = 'absence' | 'recurrent_absence' | 'announcement' | 'followup' | 'system';
export type AnnouncementAudience = 'all' | 'guardians' | 'students' | 'teachers' | 'classroom';

export interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isPlatformAdmin: boolean;
  active: boolean;
}

export interface Membership {
  id: string;
  schoolId: string;
  role: MembershipRole;
  schoolName: string;
  schoolCity: string;
  schoolState: string;
  schoolStatus: SchoolStatus;
  schoolTimezone: string;
}

/** Contexto ativo: em qual escola e com qual papel o usuário está navegando. */
export type ActiveContext =
  | { kind: 'school'; membershipId: string; schoolId: string; schoolName: string; role: MembershipRole; timezone: string }
  | { kind: 'platform_admin' };

export interface Classroom {
  id: string;
  schoolId: string;
  name: string;
  grade: string | null;
  shift: 'morning' | 'afternoon' | 'evening' | 'full';
  schoolYear: number;
  active: boolean;
  studentCount?: number;
}

export interface RosterStudent {
  studentId: string;
  fullName: string;
  registrationCode: string;
}

export interface Student {
  id: string;
  schoolId: string;
  fullName: string;
  registrationCode: string;
  birthDate: string | null;
  active: boolean;
  hasAccount: boolean;
  classroomId?: string | null;
  classroomName?: string | null;
}

export interface Guardian {
  id: string;
  schoolId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  hasAccount: boolean;
  students: { id: string; fullName: string; relationship: string }[];
}

export interface AttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  note?: string | null;
}

/** Estado local de sincronização de uma chamada no aparelho. */
export type LocalSyncState = 'synced' | 'pending' | 'conflict' | 'error';

export interface AttendanceSession {
  id: string;
  schoolId: string;
  classroomId: string;
  lessonDate: IsoDate;
  lessonSlot: number;
  status: SessionStatus;
  serverVersion: number;
  syncState: LocalSyncState;
  syncError?: string | null;
  updatedAt: string;
}

export interface AttendanceRules {
  schoolId: string;
  minAttendancePercent: number;
  consecutiveAbsencesThreshold: number;
  weeklyAbsencesThreshold: number;
  periodDays: number;
  periodAbsencesThreshold: number;
  minRecordsForPercent: number;
  lateCountsAsPresent: boolean;
  justifiedCountsAsPresent: boolean;
  notifyGuardiansOnAbsence: boolean;
  notifyGuardiansOnAlert: boolean;
  teacherEditWindowDays: number;
}

export const DEFAULT_RULES: Omit<AttendanceRules, 'schoolId'> = {
  minAttendancePercent: 75,
  consecutiveAbsencesThreshold: 2,
  weeklyAbsencesThreshold: 3,
  periodDays: 30,
  periodAbsencesThreshold: 5,
  minRecordsForPercent: 5,
  lateCountsAsPresent: true,
  justifiedCountsAsPresent: true,
  notifyGuardiansOnAbsence: true,
  notifyGuardiansOnAlert: true,
  teacherEditWindowDays: 7,
};

export interface StudentAlert {
  studentId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
  totalRecords: number;
  absences: number;
  consecutiveAbsences: number;
  weekAbsences: number;
  attendancePercent: number | null;
  reasons: string[];
}

export interface AppNotification {
  id: string;
  schoolId: string;
  type: NotificationType;
  title: string;
  body: string;
  occurrenceDate: IsoDate | null;
  studentId: string | null;
  readAt: string | null;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classroomId: string | null;
  requiresAck: boolean;
  publishedAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  recipientsCount?: number;
  acknowledgedCount?: number;
}

export interface Followup {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  identifiedAt: IsoDate;
  reason: string;
  situation: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  actionsTaken: string | null;
  nextFollowupDate: IsoDate | null;
  status: FollowupStatus;
  outcome: string | null;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  eventDate: IsoDate;
  eventType: 'holiday' | 'exam' | 'meeting' | 'event' | 'other';
  classroomId: string | null;
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  justified: number;
  attendancePercent: number | null;
  minRecordsForPercent: number;
  minAttendancePercent: number;
  monthly: { month: string; total: number; absent: number; percent: number }[];
  days: { date: IsoDate; slot: number; status: AttendanceStatus; note: string | null }[];
}
