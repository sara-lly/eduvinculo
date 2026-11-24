/**
 * Laboratório de desempenho de listas — comparação ANTES × DEPOIS nas mesmas
 * condições (mesmo aparelho, mesmos dados fictícios, mesmo roteiro):
 *
 *  ANTES  : ScrollView + .map(), linhas sem memo e com closures novas a cada
 *           renderização (todas as N linhas são montadas e re-renderizadas).
 *  DEPOIS : FlashList (virtualização/reciclagem) + AttendanceRow memoizada
 *           + callback estável (só a linha alterada re-renderiza).
 *
 * Métricas registradas: tempo de montagem, custo de uma marcação
 * (render + commit) e FPS da thread JS durante rolagem automática.
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { recordMetric } from '@/core/perf';
import { STATUS_ORDER, STATUS_SHORT } from '@/domain/attendance';
import type { AttendanceStatus, RosterStudent } from '@/domain/types';
import { ATTENDANCE_ROW_HEIGHT, AttendanceRow } from '@/ui/components/attendance';
import { ChipSelect } from '@/ui/components/forms';
import { AppText, Button, Card, Row } from '@/ui/components/primitives';
import { InlineMessage } from '@/ui/components/states';
import { colors, spacing, statusColors } from '@/ui/theme';

type Mode = 'before' | 'after';
type Size = '30' | '100' | '500';

const FIRST = ['Ana', 'Bruno', 'Carla', 'Davi', 'Elisa', 'Fábio', 'Gabi', 'Heitor', 'Iara', 'João'];
const LAST = ['Teste', 'Exemplo', 'Modelo', 'Fictício', 'Demo'];

function syntheticRoster(n: number): RosterStudent[] {
  return Array.from({ length: n }, (_, i) => ({
    studentId: `lab-${i}`,
    fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]} ${i + 1}`,
    registrationCode: `LAB-${String(i + 1).padStart(4, '0')}`,
  }));
}

/** Linha "ingênua": sem memo, recebe closure nova a cada render. */
function NaiveRow({ s, index, status, onPress }: { s: RosterStudent; index: number; status?: AttendanceStatus; onPress: (st: AttendanceStatus) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1}>{`${index + 1}. ${s.fullName}`}</AppText>
        <AppText variant="caption">{`Matrícula ${s.registrationCode}`}</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {STATUS_ORDER.map((st) => (
          <Pressable key={st} onPress={() => onPress(st)} style={[styles.btn, { borderColor: statusColors[st].fg }, status === st && { backgroundColor: statusColors[st].fg }]}>
            <AppText style={{ color: status === st ? '#fff' : statusColors[st].fg, fontWeight: '800' }}>{STATUS_SHORT[st]}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function measureJsFps(durationMs: number): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < durationMs) requestAnimationFrame(tick);
      else resolve((frames * 1000) / (performance.now() - start));
    };
    requestAnimationFrame(tick);
  });
}

function LabList({ mode, roster, onResult }: { mode: Mode; roster: RosterStudent[]; onResult: (r: string) => void }) {
  const [records, setRecords] = useState<Map<string, AttendanceStatus>>(new Map());
  const [mountStart] = useState(() => performance.now());
  const tapStart = useRef<number | null>(null);
  const tapSamples = useRef<number[]>([]);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const flashRef = useRef<FlashListRef<RosterStudent>>(null);
  const mountedOnce = useRef(false);

  // Montagem: do início da renderização até o commit da primeira tela.
  useLayoutEffect(() => {
    if (mountedOnce.current) return;
    mountedOnce.current = true;
    const ms = performance.now() - mountStart;
    recordMetric('lab.mount', ms, 'ms', { mode, n: roster.length });
    onResult(`Montagem: ${ms.toFixed(1)} ms`);
  }, [mode, roster.length, onResult, mountStart]);

  // Custo de uma marcação: do toque até o commit.
  useLayoutEffect(() => {
    if (tapStart.current === null) return;
    const ms = performance.now() - tapStart.current;
    tapStart.current = null;
    tapSamples.current.push(ms);
    recordMetric('lab.tap_commit', ms, 'ms', { mode, n: roster.length });
  }, [records, mode, roster.length]);

  const setStatus = useCallback((studentId: string, st: AttendanceStatus) => {
    tapStart.current = performance.now();
    setRecords((prev) => {
      const next = new Map(prev);
      next.set(studentId, st);
      return next;
    });
  }, []);

  const runTapBenchmark = async () => {
    tapSamples.current = [];
    for (let i = 0; i < 20; i++) {
      const s = roster[(i * 7) % roster.length];
      if (!s) break;
      setStatus(s.studentId, STATUS_ORDER[i % 4]!);
      await new Promise((r) => setTimeout(r, 30));
    }
    const sorted = [...tapSamples.current].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    onResult(`Marcação (mediana de ${sorted.length}): ${median.toFixed(1)} ms`);
  };

  const runScrollBenchmark = async () => {
    const total = roster.length * ATTENDANCE_ROW_HEIGHT;
    const fpsPromise = measureJsFps(3000);
    const steps = 30;
    for (let i = 1; i <= steps; i++) {
      const y = (total * i) / steps;
      if (mode === 'before') scrollRef.current?.scrollTo({ y, animated: true });
      else flashRef.current?.scrollToOffset({ offset: y, animated: true });
      await new Promise((r) => setTimeout(r, 100));
    }
    const fps = await fpsPromise;
    recordMetric('lab.scroll_fps', fps, 'fps', { mode, n: roster.length });
    onResult(`FPS do JS na rolagem: ${fps.toFixed(1)}`);
    if (mode === 'before') scrollRef.current?.scrollTo({ y: 0, animated: false });
    else flashRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  return (
    <View style={{ flex: 1 }}>
      <Row style={{ padding: spacing.sm }}>
        <Button title="Medir marcações" compact variant="secondary" style={{ flex: 1 }} onPress={() => void runTapBenchmark()} />
        <Button title="Medir rolagem" compact variant="secondary" style={{ flex: 1 }} onPress={() => void runScrollBenchmark()} />
      </Row>
      {mode === 'before' ? (
        <ScrollView ref={scrollRef}>
          {roster.map((s, i) => (
            <NaiveRow key={s.studentId} s={s} index={i} status={records.get(s.studentId)} onPress={(st) => setStatus(s.studentId, st)} />
          ))}
        </ScrollView>
      ) : (
        <FlashList
          ref={flashRef}
          data={roster}
          keyExtractor={(s) => s.studentId}
          extraData={records}
          renderItem={({ item, index }) => (
            <AttendanceRow studentId={item.studentId} name={item.fullName} registrationCode={item.registrationCode}
              index={index} status={records.get(item.studentId)} onChange={setStatus} />
          )}
        />
      )}
    </View>
  );
}

export default function PerformanceLab() {
  const [mode, setMode] = useState<Mode>('after');
  const [size, setSize] = useState<Size>('500');
  const [runId, setRunId] = useState(0);
  const [results, setResults] = useState<string[]>([]);
  const roster = useMemo(() => syntheticRoster(Number(size)), [size]);
  const onResult = useCallback((r: string) => setResults((prev) => [r, ...prev].slice(0, 6)), []);

  const restart = (patch: { mode?: Mode; size?: Size }) => {
    if (patch.mode) setMode(patch.mode);
    if (patch.size) setSize(patch.size);
    setResults([]);
    setRunId((x) => x + 1); // remonta a lista para medir a montagem do zero
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.md, gap: spacing.xs }}>
        <ChipSelect<Mode> value={mode} onChange={(m) => restart({ mode: m })} options={[
          { value: 'before', label: 'ANTES (ScrollView)' }, { value: 'after', label: 'DEPOIS (FlashList)' },
        ]} />
        <ChipSelect<Size> value={size} onChange={(s) => restart({ size: s })} options={[
          { value: '30', label: '30' }, { value: '100', label: '100' }, { value: '500', label: '500 estudantes' },
        ]} />
        <Card style={{ padding: spacing.sm }}>
          {results.length === 0 ? <AppText variant="caption">Os resultados aparecem aqui e ficam salvos em “Desempenho”.</AppText> : null}
          {results.map((r, i) => <AppText key={`${r}-${i}`} variant="caption">{`${mode === 'before' ? 'ANTES' : 'DEPOIS'} · ${size} · ${r}`}</AppText>)}
        </Card>
        {__DEV__ ? <InlineMessage tone="warning" text="Build de desenvolvimento: valores maiores que em produção. Compare sempre no mesmo tipo de build." /> : null}
      </View>
      <LabList key={`${mode}-${size}-${runId}`} mode={mode} roster={roster} onResult={onResult} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ATTENDANCE_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  btn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
