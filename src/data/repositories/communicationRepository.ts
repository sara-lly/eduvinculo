import { config } from '@/core/config';
import { isNetworkError, toAppError } from '@/core/errors';
import type { Announcement, AnnouncementAudience, AppNotification, NotificationType } from '@/domain/types';
import { networkFirst } from '../local/queryCache';
import { rpc, supabase, unwrap } from '../remote/supabase';

interface NotificationRow {
  id: string; school_id: string; type: NotificationType; title: string; body: string;
  occurrence_date: string | null; student_id: string | null; read_at: string | null; created_at: string;
  data: Record<string, unknown>;
}

const mapNotification = (r: NotificationRow): AppNotification => ({
  id: r.id, schoolId: r.school_id, type: r.type, title: r.title, body: r.body, occurrenceDate: r.occurrence_date,
  studentId: r.student_id, readAt: r.read_at, createdAt: r.created_at, data: r.data ?? {},
});

export interface NotificationPreferences {
  absenceAlerts: boolean;
  recurrentAlerts: boolean;
  announcements: boolean;
  pushEnabled: boolean;
}

export const communicationRepository = {
  /** Paginação por cursor (created_at) — carrega 50 por vez. */
  async notificationsPage(userId: string, schoolId: string, before?: string): Promise<{ items: AppNotification[]; nextCursor: string | null; fromCache?: number }> {
    const key = `notifications:${userId}:${schoolId}:${before ?? 'first'}`;
    const items = await networkFirst(key, async () => {
      let q = supabase
        .from('notifications')
        .select('id, school_id, type, title, body, occurrence_date, student_id, read_at, created_at, data')
        .eq('recipient_id', userId)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(config.pageSize);
      if (before) q = q.lt('created_at', before);
      return unwrap<NotificationRow[]>(await q).map(mapNotification);
    }, isNetworkError);
    const last = items[items.length - 1];
    return {
      items: Array.from(items),
      nextCursor: items.length === config.pageSize && last ? last.createdAt : null,
      fromCache: (items as { __fromCache?: number }).__fromCache,
    };
  },

  async notification(id: string): Promise<AppNotification> {
    const row = unwrap<NotificationRow>(await supabase
      .from('notifications')
      .select('id, school_id, type, title, body, occurrence_date, student_id, read_at, created_at, data')
      .eq('id', id)
      .single());
    return mapNotification(row);
  },

  async unreadCount(userId: string, schoolId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('school_id', schoolId)
      .is('read_at', null);
    if (error) throw toAppError(error);
    return count ?? 0;
  },

  markNotificationRead(id: string) {
    return rpc<void>('mark_notification_read', { p_notification: id });
  },

  markAllRead(schoolId: string) {
    return rpc<number>('mark_all_notifications_read', { p_school: schoolId });
  },

  async announcements(userId: string, schoolId: string, staff: boolean): Promise<Announcement[]> {
    return networkFirst(`announcements:${userId}:${schoolId}`, async () => {
      if (staff) {
        const rows = unwrap<{
          id: string; school_id: string; title: string; body: string; audience: AnnouncementAudience;
          classroom_id: string | null; requires_ack: boolean; published_at: string;
          announcement_recipients: { read_at: string | null; acknowledged_at: string | null; user_id: string }[];
        }[]>(await supabase
          .from('announcements')
          .select('id, school_id, title, body, audience, classroom_id, requires_ack, published_at, announcement_recipients(read_at, acknowledged_at, user_id)')
          .eq('school_id', schoolId)
          .eq('active', true)
          .order('published_at', { ascending: false })
          .limit(config.pageSize));
        return rows.map((r) => {
          const mine = r.announcement_recipients.find((x) => x.user_id === userId);
          return {
            id: r.id, schoolId: r.school_id, title: r.title, body: r.body, audience: r.audience, classroomId: r.classroom_id,
            requiresAck: r.requires_ack, publishedAt: r.published_at, readAt: mine?.read_at ?? null,
            acknowledgedAt: mine?.acknowledged_at ?? null,
            recipientsCount: r.announcement_recipients.length,
            acknowledgedCount: r.announcement_recipients.filter((x) => x.acknowledged_at).length,
          };
        });
      }
      const rows = unwrap<{
        read_at: string | null; acknowledged_at: string | null;
        announcements: { id: string; school_id: string; title: string; body: string; audience: AnnouncementAudience;
          classroom_id: string | null; requires_ack: boolean; published_at: string; active: boolean } | null;
      }[]>(await supabase
        .from('announcement_recipients')
        .select('read_at, acknowledged_at, announcements(id, school_id, title, body, audience, classroom_id, requires_ack, published_at, active)')
        .eq('user_id', userId)
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(config.pageSize));
      return rows
        .filter((r) => r.announcements?.active)
        .map((r) => {
          const a = r.announcements!;
          return {
            id: a.id, schoolId: a.school_id, title: a.title, body: a.body, audience: a.audience, classroomId: a.classroom_id,
            requiresAck: a.requires_ack, publishedAt: a.published_at, readAt: r.read_at, acknowledgedAt: r.acknowledged_at,
          };
        });
    }, isNetworkError);
  },

  markAnnouncementRead(id: string, acknowledge: boolean) {
    return rpc<void>('mark_announcement_read', { p_announcement: id, p_acknowledge: acknowledge });
  },

  publishAnnouncement(input: { schoolId: string; title: string; body: string; audience: AnnouncementAudience; classroomId?: string | null; requiresAck: boolean }) {
    return rpc<string>('publish_announcement', {
      p_school: input.schoolId, p_title: input.title, p_body: input.body, p_audience: input.audience,
      p_classroom: input.classroomId || null, p_requires_ack: input.requiresAck,
    });
  },

  async getPreferences(userId: string, schoolId: string): Promise<NotificationPreferences> {
    const row = unwrap<{ absence_alerts: boolean; recurrent_alerts: boolean; announcements: boolean; push_enabled: boolean } | null>(
      await supabase.from('notification_preferences').select('absence_alerts, recurrent_alerts, announcements, push_enabled')
        .eq('user_id', userId).eq('school_id', schoolId).maybeSingle());
    return {
      absenceAlerts: row?.absence_alerts ?? true,
      recurrentAlerts: row?.recurrent_alerts ?? true,
      announcements: row?.announcements ?? true,
      pushEnabled: row?.push_enabled ?? true,
    };
  },

  async savePreferences(userId: string, schoolId: string, p: NotificationPreferences): Promise<void> {
    unwrap(await supabase.from('notification_preferences').upsert({
      user_id: userId, school_id: schoolId, absence_alerts: p.absenceAlerts, recurrent_alerts: p.recurrentAlerts,
      announcements: p.announcements, push_enabled: p.pushEnabled,
    }));
  },

  async registerPushToken(userId: string, token: string, platform: 'android' | 'ios'): Promise<void> {
    unwrap(await supabase.from('push_tokens').upsert({ user_id: userId, token, platform }, { onConflict: 'token' }));
  },

  async removePushToken(token: string): Promise<void> {
    await supabase.from('push_tokens').delete().eq('token', token);
  },

  async deliveries(schoolId: string) {
    return unwrap<{ id: string; channel: string; status: string; attempts: number; last_error: string | null; created_at: string;
      notifications: { title: string; type: NotificationType } | null }[]>(
      await supabase.from('notification_deliveries')
        .select('id, channel, status, attempts, last_error, created_at, notifications(title, type)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(config.pageSize));
  },
};
