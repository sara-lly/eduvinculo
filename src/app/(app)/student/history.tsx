import { useQuery } from '@tanstack/react-query';
import { familyRepository } from '@/data/repositories/familyRepository';
import { useSchoolContext, useUserId } from '@/features/auth/sessionStore';
import { StudentAttendanceView } from '@/features/students/StudentAttendanceView';
import { Screen } from '@/ui/components/layout';
import { AppText } from '@/ui/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

/** Minha frequência + histórico completo. */
export default function StudentHistory() {
  const ctx = useSchoolContext();
  const userId = useUserId();
  const me = useQuery({ queryKey: ['family', userId, ctx.schoolId], queryFn: () => familyRepository.myStudents(userId, ctx.schoolId) });
  if (me.isPending) return <LoadingState />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  const student = me.data[0];
  if (!student) return <EmptyState title="Cadastro não encontrado" />;
  return (
    <Screen>
      <AppText variant="title" style={{ marginBottom: spacing.md }}>Minha frequência</AppText>
      <StudentAttendanceView studentId={student.id} schoolId={ctx.schoolId} timezone={ctx.timezone} />
    </Screen>
  );
}
