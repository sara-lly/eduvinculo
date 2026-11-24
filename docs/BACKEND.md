# Backend (Supabase) — configuração passo a passo

O backend é 100% Supabase: PostgreSQL + Auth + RLS + funções RPC (PL/pgSQL) + uma Edge Function
opcional para push. Nada de chave administrativa vai para o app.

## 1. Criar o projeto

1. Acesse <https://supabase.com>, crie uma conta e um **New project** (região *South America (São Paulo)*).
2. Em **Project Settings › API**, copie a **Project URL** e a **anon / publishable key**.
3. Na raiz do app, copie `.env.example` para `.env` e preencha:

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 2. Aplicar as migrations e o seed

### Opção A — SQL Editor (mais simples, sem instalar nada)

No painel: **SQL Editor › New query**. Cole e execute, **nesta ordem**, o conteúdo de:

1. `supabase/migrations/20261124000001_base_schema.sql`
2. `supabase/migrations/20261124000002_attendance.sql`
3. `supabase/migrations/20261124000003_communication_audit.sql`
4. `supabase/migrations/20261124000004_security.sql`
5. `supabase/migrations/20261124000005_rpc.sql`
6. `supabase/migrations/20261124000006_rls_performance.sql`
7. `supabase/seed.sql` (dados de demonstração — **somente** em ambiente de demonstração)

### Opção B — Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --include-seed
```

> O seed cria contas em `auth.users` com a senha `Demo@2026` usando `extensions.crypt` (pgcrypto,
> já habilitado em todo projeto Supabase).

## 3. Autenticação

* **Authentication › Providers › Email**: habilitado (padrão).
* **Confirmação de e-mail:** para a apresentação você pode desativar *Confirm email*
  (Authentication › Sign In / Providers › Email). Com a confirmação ativa, o cadastro avisa o
  usuário para confirmar o e-mail antes de entrar.
* **Recuperação de senha por código (obrigatório para o fluxo do app):** em
  **Authentication › Email Templates › Reset Password**, inclua o código no corpo:

```html
<h2>Redefinir senha — EduVínculo</h2>
<p>Use este código no aplicativo: <strong>{{ .Token }}</strong></p>
<p>Se você não pediu a redefinição, ignore este e-mail.</p>
```

* O envio de e-mails pelo SMTP padrão do Supabase tem limite baixo por hora; para uso real,
  configure um SMTP próprio (Project Settings › Auth › SMTP).

## 4. Push remoto (opcional)

O app funciona sem push: as notificações sempre aparecem dentro do app, e um aviso local
genérico é exibido quando chegam notificações novas com o app aberto.

Para push remoto (app fechado):

1. Gere um **development build ou APK** (o Expo Go no Android não recebe push remoto desde o SDK 53).
2. `npx eas-cli@latest init` e coloque o ID do projeto em `EXPO_PUBLIC_EAS_PROJECT_ID` no `.env`.
3. Configure as credenciais FCM do Android no EAS (`npx eas-cli@latest credentials`).
4. Publique a função: `npx supabase functions deploy dispatch-push`.
5. Agende a função a cada minuto (**Integrations › Cron**, job HTTP `POST` para
   `https://SEU-PROJETO.supabase.co/functions/v1/dispatch-push` com header
   `Authorization: Bearer <SERVICE_ROLE_KEY>`), ou crie um *Database Webhook* em `INSERT` na
   tabela `notification_deliveries`.

A função envia apenas texto genérico ("Você tem uma nova notificação da escola"), registra cada
tentativa em `notification_deliveries` (status, tentativas, último erro), aplica backoff e remove
tokens inválidos.

> **Status:** a Edge Function foi escrita mas **não foi executada** neste ambiente (requer o
> projeto Supabase e credenciais FCM). As entregas *in-app* e o registro das tentativas são
> criados pelo banco e estão cobertos pelos testes.

## 5. Retenção de dados (LGPD)

Agende diariamente (Integrations › Cron, job SQL):

```sql
select public.purge_expired_data();
```

Remove: operações de sincronização processadas (> 30 dias), notificações e entregas (> 1 ano),
auditoria (> 5 anos). Registros escolares de frequência **não** são apagados automaticamente.

## 6. Modelo de dados (resumo)

| Tabela | Finalidade |
|---|---|
| `schools`, `attendance_rules` | Escola e critérios configuráveis de frequência/alertas |
| `profiles`, `school_memberships` | Usuário e seus vínculos (escola × papel); vários vínculos por usuário |
| `classrooms`, `classroom_teachers`, `class_schedules`, `calendar_events` | Turmas, professores, grade horária, calendário |
| `students`, `guardians`, `student_guardians`, `classroom_students` | Estudantes, responsáveis e matrículas (transferência = encerra uma matrícula e abre outra) |
| `invitations` | Convites de primeiro acesso (somente hash SHA-256 do código) |
| `attendance_sessions`, `attendance_records` | Chamadas (id gerado no aparelho) e registros por estudante, com autor e versão |
| `attendance_conflicts`, `processed_ops` | Conflitos de edição concorrente e idempotência da sincronização |
| `pedagogical_followups`, `pedagogical_notes` | Acompanhamento pedagógico (restrito) e observações de professores |
| `announcements`, `announcement_recipients` | Comunicados e confirmação de leitura/ciência |
| `notifications`, `notification_deliveries`, `notification_preferences`, `push_tokens` | Notificações com deduplicação, tentativas de envio e preferências |
| `audit_logs` | Auditoria: autor, ação e campos alterados (sem copiar valores) |

## 7. Principais funções (RPC)

| Função | Quem pode | O que faz |
|---|---|---|
| `get_my_context()` | autenticado | Perfil + vínculos em uma única chamada |
| `create_invite(...)` / `redeem_invite(code)` | coordenação (admin para gestão) / autenticado | Convite seguro de primeiro acesso |
| `sync_attendance_session(op_id, session, records, base_version)` | professor da turma / coordenação | Grava a chamada de forma **idempotente**, valida completude e detecta **conflitos** |
| `resolve_attendance_conflict(id, accept)` | professor da turma / coordenação | Resolve conflito preservando o histórico |
| `compute_student_alerts(school, ...)` | coordenação; professor (só as próprias turmas) | Faltas recorrentes com motivos descritivos |
| `get_student_attendance_summary(student, from, to)` | quem pode ver o estudante | Totais, percentual (nulo se poucos registros), série mensal e dias |
| `get_school_dashboard`, `get_teacher_dashboard`, `get_attendance_report` | por perfil | Indicadores agregados no servidor |
| `publish_announcement`, `mark_announcement_read`, `mark_notification_read` | por perfil | Comunicação |
| `transfer_student`, `set_student_active` | coordenação | Gestão sem exclusão física |
| `get_platform_overview`, `set_platform_admin` | administração da plataforma | Visão sem dados pessoais |
| `purge_expired_data()` | somente service role/cron | Retenção |
