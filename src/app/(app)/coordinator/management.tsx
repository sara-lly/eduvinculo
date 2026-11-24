import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { ListItem, Screen } from '@/ui/components/layout';
import { SectionTitle } from '@/ui/components/primitives';

export default function ManagementHub() {
  const router = useRouter();
  return (
    <Screen padded={false}>
      <SectionTitle title="  Cadastros" />
      <View>
        <ListItem icon="people-outline" title="Turmas" subtitle="Criar, editar, vincular professores" onPress={() => router.push('/management/classrooms')} />
        <ListItem icon="school-outline" title="Estudantes" subtitle="Cadastro, matrícula e transferência" onPress={() => router.push('/management/students')} />
        <ListItem icon="person-outline" title="Professores" subtitle="Vínculos com turmas" onPress={() => router.push('/management/teachers')} />
        <ListItem icon="home-outline" title="Responsáveis" subtitle="Cadastro e vínculo com estudantes" onPress={() => router.push('/management/guardians')} />
        <ListItem icon="ticket-outline" title="Convites de acesso" subtitle="Primeiro acesso de professores, famílias e estudantes" onPress={() => router.push('/management/invites')} />
      </View>
      <SectionTitle title="  Frequência e comunicação" />
      <View>
        <ListItem icon="create-outline" title="Fazer/corrigir chamada" subtitle="Escolha uma turma" onPress={() => router.push('/management/classrooms')} />
        <ListItem icon="git-compare-outline" title="Conflitos de chamada" onPress={() => router.push('/conflicts')} />
        <ListItem icon="options-outline" title="Regras de frequência e alertas" onPress={() => router.push('/management/rules')} />
        <ListItem icon="megaphone-outline" title="Comunicados" onPress={() => router.push('/announcement/new')} />
        <ListItem icon="paper-plane-outline" title="Envios de notificações" subtitle="Tentativas e falhas de envio" onPress={() => router.push('/management/deliveries')} />
        <ListItem icon="calendar-outline" title="Calendário escolar" onPress={() => router.push('/management/calendar')} />
        <ListItem icon="document-text-outline" title="Relatórios" onPress={() => router.push('/reports')} />
      </View>
    </Screen>
  );
}
