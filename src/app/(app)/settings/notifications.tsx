import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toAppError } from '@/core/errors';
import { communicationRepository, type NotificationPreferences } from '@/data/repositories/communicationRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { getPermissionStatus, registerPushToken, requestPermission } from '@/features/notifications/pushNotifications';
import { FormSection, SwitchField } from '@/ui/components/forms';
import { Screen } from '@/ui/components/layout';
import { Button } from '@/ui/components/primitives';
import { ErrorState, InlineMessage, LoadingState } from '@/ui/components/states';
import { toast } from '@/ui/components/toast';

export default function NotificationPreferencesScreen() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['prefs', userId, ctx.schoolId], queryFn: () => communicationRepository.getPreferences(userId, ctx.schoolId) });
  const permission = useQuery({ queryKey: ['notif-permission'], queryFn: getPermissionStatus, networkMode: 'always' });
  // Rascunho local: só existe depois que o usuário altera algo.
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const prefs = draft ?? q.data ?? null;

  const save = useMutation({
    mutationFn: (p: NotificationPreferences) => communicationRepository.savePreferences(userId, ctx.schoolId, p),
    onSuccess: () => {
      toast.success('Preferências salvas.');
      void qc.invalidateQueries({ queryKey: ['prefs'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const enablePush = async () => {
    const granted = await requestPermission();
    void permission.refetch();
    if (!granted) {
      toast.info('Permissão negada. Você continuará vendo as notificações dentro do app.');
      return;
    }
    const r = await registerPushToken(userId);
    toast.info(r === 'registered' ? 'Notificações no aparelho ativadas.' : 'Notificações locais ativadas. O push remoto requer o app instalado (APK/development build).');
  };

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isPending || !prefs) return <LoadingState />;
  const set = (patch: Partial<NotificationPreferences>) => setDraft({ ...prefs, ...patch });

  return (
    <Screen>
      <InlineMessage tone="info" text="Notificações na tela bloqueada nunca mostram nomes ou detalhes — apenas “Você tem uma nova notificação da escola”." />
      {permission.data !== 'granted' ? (
        <>
          <InlineMessage tone="warning" text="As notificações do aparelho estão desativadas. O app continua funcionando e as notificações aparecem na aba Notificações." />
          <Button title="Permitir notificações no aparelho" variant="secondary" onPress={() => void enablePush()} />
        </>
      ) : null}
      <FormSection title="Receber avisos de">
        <SwitchField label="Faltas registradas" value={prefs.absenceAlerts} onValueChange={(v) => set({ absenceAlerts: v })} />
        <SwitchField label="Faltas recorrentes" value={prefs.recurrentAlerts} onValueChange={(v) => set({ recurrentAlerts: v })} />
        <SwitchField label="Comunicados da escola" value={prefs.announcements} onValueChange={(v) => set({ announcements: v })} />
        <SwitchField label="Notificação no aparelho (push)" value={prefs.pushEnabled} onValueChange={(v) => set({ pushEnabled: v })}
          description="Se desligado, os avisos ficam apenas dentro do app." />
      </FormSection>
      <Button title="Salvar preferências" onPress={() => save.mutate(prefs)} loading={save.isPending} />
    </Screen>
  );
}
