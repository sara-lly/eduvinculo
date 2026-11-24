/**
 * Harness de testes do banco de dados.
 *
 * Executa as migrations e o seed reais em um PostgreSQL embarcado (PGlite),
 * com um "stub" mínimo do schema auth do Supabase (auth.users, auth.uid()).
 * Assim conseguimos verificar RLS, RPCs e regras de negócio sem Docker.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage on schema extensions to anon, authenticated;

create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz,
  confirmation_token text, email_change text, email_change_token_new text, recovery_token text
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users(id), provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  unique (provider_id, provider)
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
`;

export const IDS = {
  admin: '00000000-0000-4000-a000-000000000001',
  coordinator: '00000000-0000-4000-a000-000000000002',
  director: '00000000-0000-4000-a000-000000000003',
  marina: '00000000-0000-4000-a000-000000000004',
  caio: '00000000-0000-4000-a000-000000000005',
  rita: '00000000-0000-4000-a000-000000000006',
  lucas: '00000000-0000-4000-a000-000000000007',
  coordinator2: '00000000-0000-4000-a000-000000000009',
  school1: '10000000-0000-4000-a000-000000000001',
  school2: '10000000-0000-4000-a000-000000000002',
  class6A: '20000000-0000-4000-a000-000000000001',
  class8C: '20000000-0000-4000-a000-000000000002',
  class100: '20000000-0000-4000-a000-000000000003',
  class500: '20000000-0000-4000-a000-000000000004',
  class9A: '20000000-0000-4000-a000-000000000005',
  studentLucas: '30000000-0000-4000-a000-000000000001',
  studentAnaClara: '30000000-0000-4000-a000-000000000002',
  guardianRita: '40000000-0000-4000-a000-000000000001',
  guardianJose: '40000000-0000-4000-a000-000000000002',
} as const;

export interface TestDb {
  db: PGlite;
  /** Executa como o usuário autenticado informado (RLS ativo). */
  as<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa como "anon" (sem login). */
  asAnon<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa como superusuário (sem RLS) — somente para preparar/verificar cenários. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  createUser(id: string, email: string, fullName: string): Promise<void>;
}

export async function createTestDb(options: { seed?: boolean; excludeMigrations?: string[] } = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);

  const migrationsDir = join(ROOT, 'migrations');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && !(options.excludeMigrations ?? []).some((x) => f.includes(x))).sort()) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Falha na migration ${file}: ${(error as Error).message}`);
    }
  }
  if (options.seed !== false) {
    try {
      await db.exec(readFileSync(join(ROOT, 'seed.sql'), 'utf8'));
    } catch (error) {
      throw new Error(`Falha no seed: ${(error as Error).message}`);
    }
  }

  async function runAs<T>(role: 'authenticated' | 'anon', claims: object, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${role}`);
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  return {
    db,
    as: (userId, sql, params) => runAs('authenticated', { sub: userId, role: 'authenticated' }, sql, params),
    asAnon: (sql, params) => runAs('anon', { role: 'anon' }, sql, params),
    admin: async (sql, params = []) => (await db.query(sql, params)).rows as never,
    createUser: async (id, email, fullName) => {
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, jsonb_build_object('full_name', $3::text), 'authenticated', 'authenticated')`,
        [id, email, fullName],
      );
    },
  };
}
