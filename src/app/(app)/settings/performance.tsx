import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, Platform, Share, View } from 'react-native';
import * as Device from 'expo-device';
import { clearMetrics, readMetrics, summarize } from '@/core/perf';
import { ListItem, Screen } from '@/ui/components/layout';
import { AppText, Button, Card, Row, SectionTitle } from '@/ui/components/primitives';
import { EmptyState, InlineMessage, LoadingState } from '@/ui/components/states';
import { spacing } from '@/ui/theme';

const LABELS: Record<string, string> = {
  'startup.js_to_first_screen': 'Abertura: início do JS → primeira tela útil',
  'attendance.screen_ready': 'Chamada: tela pronta com a lista',
  'attendance.save_local': 'Chamada: salvar no aparelho (SQLite)',
  'attendance.sync': 'Chamada: sincronização com o servidor',
  'lab.mount': 'Laboratório: montagem da lista',
  'lab.tap_commit': 'Laboratório: marcação (render + commit)',
  'lab.scroll_fps': 'Laboratório: FPS do JS durante rolagem',
};

function deviceDescription() {
  return `${Device.manufacturer ?? ''} ${Device.modelName ?? ''} · ${Platform.OS} ${Device.osVersion ?? ''} · RAM ${Device.totalMemory ? `${Math.round(Device.totalMemory / 1024 ** 3)} GB` : '?'}`;
}

/** Métricas REAIS medidas neste aparelho (nenhum valor é estimado). */
export default function PerformanceScreen() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['perf-metrics'], queryFn: () => readMetrics(500), networkMode: 'always', staleTime: 0 });
  const summary = summarize(q.data ?? []);

  const share = () => {
    const lines = summary.map((m) => `${LABELS[m.name] ?? m.name}: mediana ${m.median} ${m.unit}, p90 ${m.p90} ${m.unit} (n=${m.count}, min ${m.min}, máx ${m.max})`);
    void Share.share({ message: [`Presença+ — métricas medidas em ${deviceDescription()}`, `Build: ${__DEV__ ? 'desenvolvimento (Metro)' : 'produção'}`, ...lines].join('\n') });
  };

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <InlineMessage tone="info" text={`Dispositivo: ${deviceDescription()}. Build ${__DEV__ ? 'de DESENVOLVIMENTO — os tempos são maiores que em produção; use um APK de release para o relatório final.' : 'de produção.'}`} />
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="label">Laboratório de listas (antes × depois)</AppText>
        <AppText variant="caption">Compara a lista NÃO otimizada (ScrollView + map) com a otimizada (FlashList + memo) usando 30, 100 ou 500 estudantes fictícios.</AppText>
        <Button title="Abrir laboratório" onPress={() => router.push('/settings/performance-lab')} />
      </Card>
      <SectionTitle title="Métricas registradas" />
      {q.isPending ? <LoadingState /> : summary.length === 0 ? (
        <EmptyState icon="speedometer-outline" title="Nenhuma medição ainda" message="Use o app (abra chamadas, salve, sincronize) ou rode o laboratório." />
      ) : (
        <View style={{ borderRadius: 14, overflow: 'hidden' }}>
          {summary.map((m) => (
            <ListItem key={`${m.name}-${m.unit}`} title={LABELS[m.name] ?? m.name}
              subtitle={`mediana ${m.median} ${m.unit} · p90 ${m.p90} ${m.unit} · n=${m.count} · mín ${m.min} · máx ${m.max}`} />
          ))}
        </View>
      )}
      <Row style={{ marginTop: spacing.lg }}>
        <Button title="Compartilhar" variant="secondary" style={{ flex: 1 }} disabled={summary.length === 0} onPress={share} />
        <Button title="Limpar" variant="ghost" style={{ flex: 1 }} onPress={() => Alert.alert('Limpar métricas', 'Apagar todas as medições deste aparelho?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Apagar', style: 'destructive', onPress: () => void clearMetrics().then(() => q.refetch()) },
        ])} />
      </Row>
      <AppText variant="caption" style={{ marginTop: spacing.lg }}>
        Memória e FPS da interface (thread nativa) devem ser medidos com o Android Studio Profiler / React Native DevTools — veja docs/PROFILING.md.
      </AppText>
    </Screen>
  );
}
