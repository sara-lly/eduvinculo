import { useQuery } from '@tanstack/react-query';
import { managementRepository } from '@/data/repositories/managementRepository';
import { useSchoolContext } from '@/features/auth/sessionStore';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Card } from '@/ui/components/primitives';
import { ErrorState, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

export default function SchoolInfoScreen() {
  const ctx = useSchoolContext();
  const q = useQuery({ queryKey: ['school', ctx.schoolId], queryFn: () => managementRepository.schoolInfo(ctx.schoolId), staleTime: 60 * 60_000 });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data;
  return (
    <Screen>
      <Card style={{ marginBottom: spacing.md }}>
        <AppText variant="subtitle">{s.name}</AppText>
        <AppText variant="caption">{`${s.city} — ${s.state}`}</AppText>
      </Card>
      {s.address ? <ListItem icon="location-outline" title="Endereço" subtitle={s.address} /> : null}
      {s.phone ? <ListItem icon="call-outline" title="Telefone" subtitle={s.phone} /> : null}
      {s.email ? <ListItem icon="mail-outline" title="E-mail" subtitle={s.email} /> : null}
      {s.inep_code ? <ListItem icon="barcode-outline" title="Código INEP" subtitle={s.inep_code} /> : null}
      <ListItem icon="time-outline" title="Fuso horário" subtitle={`${ctx.timezone} (horário de Brasília)`} />
    </Screen>
  );
}
