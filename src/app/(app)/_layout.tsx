import { Stack } from 'expo-router';
import { colors } from '@/ui/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="select-context" options={{ title: 'Escolha o acesso' }} />
      <Stack.Screen name="invite" options={{ title: 'Código de convite' }} />
      <Stack.Screen name="teacher" options={{ headerShown: false }} />
      <Stack.Screen name="guardian" options={{ headerShown: false }} />
      <Stack.Screen name="coordinator" options={{ headerShown: false }} />
      <Stack.Screen name="student" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
      <Stack.Screen name="attendance/[classroomId]" options={{ title: 'Chamada' }} />
      <Stack.Screen name="classroom/[id]" options={{ title: 'Turma' }} />
      <Stack.Screen name="students/[id]" options={{ title: 'Estudante' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notificações' }} />
      <Stack.Screen name="notification/[id]" options={{ title: 'Notificação' }} />
      <Stack.Screen name="announcement/[id]" options={{ title: 'Comunicado' }} />
      <Stack.Screen name="announcement/new" options={{ title: 'Novo comunicado', presentation: 'modal' }} />
      <Stack.Screen name="conflicts" options={{ title: 'Conflitos de chamada' }} />
      <Stack.Screen name="sync-queue" options={{ title: 'Sincronização' }} />
      <Stack.Screen name="followup/[id]" options={{ title: 'Acompanhamento' }} />
      <Stack.Screen name="reports" options={{ title: 'Relatórios' }} />
      <Stack.Screen name="management/classrooms" options={{ title: 'Turmas' }} />
      <Stack.Screen name="management/classroom-form" options={{ title: 'Turma', presentation: 'modal' }} />
      <Stack.Screen name="management/students" options={{ title: 'Estudantes' }} />
      <Stack.Screen name="management/student-form" options={{ title: 'Estudante', presentation: 'modal' }} />
      <Stack.Screen name="management/teachers" options={{ title: 'Professores' }} />
      <Stack.Screen name="management/guardians" options={{ title: 'Responsáveis' }} />
      <Stack.Screen name="management/guardian-form" options={{ title: 'Responsável', presentation: 'modal' }} />
      <Stack.Screen name="management/invites" options={{ title: 'Convites' }} />
      <Stack.Screen name="management/rules" options={{ title: 'Regras de frequência' }} />
      <Stack.Screen name="management/calendar" options={{ title: 'Calendário escolar' }} />
      <Stack.Screen name="management/deliveries" options={{ title: 'Envios de notificações' }} />
      <Stack.Screen name="settings/profile" options={{ title: 'Perfil' }} />
      <Stack.Screen name="settings/password" options={{ title: 'Alterar senha' }} />
      <Stack.Screen name="settings/notifications" options={{ title: 'Preferências de notificação' }} />
      <Stack.Screen name="settings/school" options={{ title: 'Informações da escola' }} />
      <Stack.Screen name="settings/performance" options={{ title: 'Desempenho (diagnóstico)' }} />
      <Stack.Screen name="settings/performance-lab" options={{ title: 'Laboratório de listas' }} />
      <Stack.Screen name="admin-school-form" options={{ title: 'Nova escola', presentation: 'modal' }} />
    </Stack>
  );
}
