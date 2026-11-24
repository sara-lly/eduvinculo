import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { authRepository } from '@/data/repositories/authRepository';
import { availableContexts, contextKey, ROLE_LABEL, areaForContext } from '@/domain/roles';
import type { ActiveContext } from '@/domain/types';
import { useSessionStore } from '@/features/auth/sessionStore';
import { Brand } from '@/ui/components/brand';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

export default function SelectContextScreen() {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const memberships = useSessionStore((s) => s.memberships);
  const selectContext = useSessionStore((s) => s.selectContext);
  const loadContext = useSessionStore((s) => s.loadContext);
  const contexts = availableContexts(memberships, profile?.isPlatformAdmin ?? false);
  const suspended = memberships.filter((m) => m.schoolStatus !== 'active');

  const choose = async (ctx: ActiveContext) => {
    await selectContext(ctx);
    router.replace(`/${areaForContext(ctx)}`);
  };

  return (
    <Screen onRefresh={() => void loadContext()}>
      <Brand compact />
      <AppText variant="subtitle" style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
        {profile?.fullName ? `Olá, ${profile.fullName.split(' ')[0]}!` : 'Olá!'}
      </AppText>
      {suspended.map((m) => (
        <InlineMessage key={m.id} tone="warning" text={`${m.schoolName} está temporariamente suspensa na plataforma.`} />
      ))}
      {contexts.length === 0 ? (
        <Card>
          <AppText variant="label">Sua conta ainda não está vinculada a uma escola.</AppText>
          <AppText variant="caption" style={{ marginVertical: spacing.sm }}>
            Informe o código de convite entregue pela secretaria ou coordenação da escola.
          </AppText>
          <Button title="Tenho um código de convite" onPress={() => router.push('/invite')} />
        </Card>
      ) : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {contexts.map((ctx) => (
            <ListItem
              key={contextKey(ctx)}
              icon={ctx.kind === 'platform_admin' ? 'shield-checkmark-outline' : 'school-outline'}
              title={ctx.kind === 'platform_admin' ? 'Administração da plataforma' : ctx.schoolName}
              subtitle={ctx.kind === 'platform_admin' ? 'Gestão de escolas e auditoria' : ROLE_LABEL[ctx.role]}
              onPress={() => void choose(ctx)}
            />
          ))}
        </View>
      )}
      {contexts.length > 0 ? (
        <Button title="Adicionar vínculo com código de convite" variant="ghost" onPress={() => router.push('/invite')} style={{ marginTop: spacing.md }} />
      ) : null}
      <Button title="Sair" variant="ghost" onPress={() => void authRepository.signOut()} />
    </Screen>
  );
}
