/**
 * Benchmark do banco: políticas RLS originais (migrations 0001–0005)
 * versus políticas otimizadas (0006), com os MESMOS dados do seed.
 *
 * Executar: npm run bench:db
 * Ambiente: PGlite (PostgreSQL compilado para WebAssembly) no Node.js.
 * Os tempos absolutos são maiores que em um PostgreSQL nativo; o que
 * importa é a comparação relativa nas mesmas condições.
 */
import { createTestDb, IDS, type TestDb } from '../supabase/tests/harness';

interface Scenario {
  name: string;
  user: string;
  sql: string;
}

const SCENARIOS: Scenario[] = [
  { name: 'Responsável lista seus estudantes', user: IDS.rita, sql: 'select id, full_name from students' },
  { name: 'Responsável lê histórico (registros)', user: IDS.rita, sql: 'select id, status from attendance_records' },
  { name: 'Professora carrega turma de 30', user: IDS.marina, sql: `select s.id, s.full_name from classroom_students cs join students s on s.id = cs.student_id where cs.classroom_id = '${IDS.class6A}' and cs.active` },
  { name: 'Professora carrega turma de 100', user: IDS.marina, sql: `select s.id, s.full_name from classroom_students cs join students s on s.id = cs.student_id where cs.classroom_id = '${IDS.class100}' and cs.active` },
  { name: 'Professora carrega turma de 500', user: IDS.marina, sql: `select s.id, s.full_name from classroom_students cs join students s on s.id = cs.student_id where cs.classroom_id = '${IDS.class500}' and cs.active` },
  { name: 'Coordenação lista estudantes (página de 50)', user: IDS.coordinator, sql: 'select id, full_name from students order by full_name limit 50' },
  { name: 'Coordenação de outra escola (0 linhas)', user: IDS.coordinator2, sql: `select id from students where school_id = '${IDS.school1}'` },
];

const RUNS = 15;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

async function measure(db: TestDb, scenario: Scenario) {
  // aquecimento
  await db.as(scenario.user, scenario.sql);
  const times: number[] = [];
  let rows = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    rows = (await db.as(scenario.user, scenario.sql)).length;
    times.push(performance.now() - t0);
  }
  return { median: median(times), rows };
}

async function main() {
  console.log(`Benchmark RLS — ${RUNS} execuções por cenário (mediana), Node ${process.version}\n`);
  const before = await createTestDb({ excludeMigrations: ['_rls_performance'] });
  const after = await createTestDb();

  const lines: string[] = [];
  lines.push('| Cenário | Linhas | Antes (ms) | Depois (ms) | Ganho |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const s of SCENARIOS) {
    const b = await measure(before, s);
    const a = await measure(after, s);
    if (a.rows !== b.rows) {
      throw new Error(`Resultado divergente em "${s.name}": antes ${b.rows} linhas, depois ${a.rows}`);
    }
    const gain = b.median / a.median;
    lines.push(`| ${s.name} | ${a.rows} | ${b.median.toFixed(1)} | ${a.median.toFixed(1)} | ${gain.toFixed(1)}x |`);
  }
  console.log(lines.join('\n'));
  await before.db.close();
  await after.db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
