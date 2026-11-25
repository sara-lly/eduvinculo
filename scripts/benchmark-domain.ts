/**
 * Benchmark de código do app (antes × depois), nas MESMAS condições:
 *
 *  1. Detecção de faltas recorrentes: implementação ingênua O(estudantes × registros)
 *     versus a otimizada O(n log n) usada no app (src/domain/alerts.ts).
 *  2. Gravação da lista de estudantes no SQLite local: INSERTs avulsos (autocommit)
 *     versus transação única + prepared statement (src/data/local/attendanceStore.ts).
 *
 * Executar: npm run bench:domain
 * Ambiente: Node.js no computador de desenvolvimento (não é o celular). Serve para
 * comparar as técnicas; os tempos absolutos no aparelho serão diferentes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { addDays } from '../src/core/dates';
import { detectAlerts, detectAlertsNaive, type AlertInputRecord } from '../src/domain/alerts';
import { DEFAULT_RULES, type AttendanceStatus } from '../src/domain/types';

const RULES = { schoolId: 'bench', ...DEFAULT_RULES, periodDays: 60 };
const AS_OF = '2026-11-24';
const SCHOOL_DAYS = 40;

function dataset(students: number): AlertInputRecord[] {
  const out: AlertInputRecord[] = [];
  const statuses: AttendanceStatus[] = ['present', 'absent', 'late', 'justified'];
  for (let s = 0; s < students; s++) {
    for (let d = 0; d < SCHOOL_DAYS; d++) {
      const h = (s * 2654435761 + d * 40503) % 100;
      out.push({ studentId: `st-${s}`, lessonDate: addDays(AS_OF, -d), lessonSlot: 1, status: statuses[h < 88 ? 0 : h < 93 ? 2 : h < 97 ? 1 : 3]! });
    }
  }
  return out;
}

function timeIt(fn: () => void, runs: number): number {
  fn(); // aquecimento (JIT)
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

function benchAlerts() {
  console.log(`\n## 1. Detecção de faltas recorrentes (${SCHOOL_DAYS} dias letivos por estudante, mediana de 9 execuções)\n`);
  console.log('| Estudantes | Registros | Antes — ingênua (ms) | Depois — otimizada (ms) | Ganho |');
  console.log('|---:|---:|---:|---:|---:|');
  for (const n of [30, 100, 500]) {
    const data = dataset(n);
    const naive = timeIt(() => detectAlertsNaive(data, RULES, AS_OF), 9);
    const fast = timeIt(() => detectAlerts(data, RULES, AS_OF), 9);
    console.log(`| ${n} | ${data.length} | ${naive.toFixed(2)} | ${fast.toFixed(2)} | ${(naive / fast).toFixed(1)}x |`);
  }
}

function benchRoster() {
  console.log('\n## 2. Gravação da lista de estudantes no SQLite (arquivo em disco, mediana de 5 execuções)\n');
  console.log('| Estudantes | Antes — INSERT avulso (ms) | Depois — transação + prepared (ms) | Ganho |');
  console.log('|---:|---:|---:|---:|');
  const dir = mkdtempSync(join(tmpdir(), 'presenca-bench-'));
  try {
    const db = new DatabaseSync(join(dir, 'bench.db'));
    db.exec('PRAGMA journal_mode = WAL; CREATE TABLE roster (classroom_id TEXT, student_id TEXT, full_name TEXT, registration_code TEXT, position INTEGER, PRIMARY KEY (classroom_id, student_id));');
    for (const n of [30, 100, 500]) {
      const rows = Array.from({ length: n }, (_, i) => [`s${i}`, `Estudante Fictício ${i}`, `M-${i}`, i] as const);
      const before = timeIt(() => {
        db.exec(`DELETE FROM roster WHERE classroom_id = 'c${n}'`);
        for (const r of rows) {
          db.prepare('INSERT INTO roster VALUES (?, ?, ?, ?, ?)').run(`c${n}`, r[0], r[1], r[2], r[3]);
        }
      }, 5);
      const after = timeIt(() => {
        db.exec('BEGIN');
        db.prepare('DELETE FROM roster WHERE classroom_id = ?').run(`c${n}`);
        const stmt = db.prepare('INSERT INTO roster VALUES (?, ?, ?, ?, ?)');
        for (const r of rows) stmt.run(`c${n}`, r[0], r[1], r[2], r[3]);
        db.exec('COMMIT');
      }, 5);
      console.log(`| ${n} | ${before.toFixed(2)} | ${after.toFixed(2)} | ${(before / after).toFixed(1)}x |`);
    }
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`# Benchmark de domínio — Node ${process.version}, ${cpus()[0]?.model ?? 'CPU'}, ${new Date().toISOString().slice(0, 10)}`);
benchAlerts();
benchRoster();
