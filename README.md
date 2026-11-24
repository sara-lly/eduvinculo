# EduVínculo

**Escola, família e estudante conectados.**

Aplicativo de acompanhamento da frequência escolar que conecta escolas, professores, responsáveis e
estudantes. Funciona offline, protege dados de crianças e adolescentes (LGPD) e foi construído com
foco em **alta performance mobile**. Projeto da disciplina **Código de Alta Performance Mobile**.

Primeiro cenário: uma escola fictícia de **Teresina-PI**. A arquitetura é multiescola e
não depende de dados de Teresina.

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Stack](#stack)
3. [Como executar](#como-executar)
4. [Contas de demonstração](#contas-de-demonstração)
5. [Como testar cada perfil](#como-testar-cada-perfil)
6. [Testes automatizados](#testes-automatizados)
7. [Desempenho](#desempenho)
8. [Build (APK)](#build-apk)
9. [Estrutura do projeto](#estrutura-do-projeto)
10. [O que depende de configuração externa](#o-que-depende-de-configuração-externa)
11. [Limitações conhecidas](#limitações-conhecidas)

Documentação complementar: [Arquitetura](docs/ARQUITETURA.md) · [Backend](docs/BACKEND.md) ·
[Profiling](docs/PROFILING.md) · [LGPD](docs/LGPD.md) · [Roteiro da apresentação](docs/APRESENTACAO.md)

---

## Funcionalidades

| Perfil | O que faz |
|---|---|
| **Professor(a)** | Painel (turmas, chamadas pendentes e concluídas, próximas aulas, faltas recorrentes); chamada com Presente / Ausente / Atrasado / Falta justificada, **offline**; correção dentro da janela permitida; histórico; detalhes do estudante; observações pedagógicas; notificações |
| **Responsável** | Frequência dos estudantes vinculados (percentual, calendário, evolução); notificações de falta; comunicados com confirmação de ciência; próximas atividades; preferências |
| **Estudante** | Frequência pessoal, histórico, comunicados, calendário escolar |
| **Coordenação / Direção** | Painel (total de estudantes, frequência média, faltas, turmas com mais ausências, evolução, pendências); gestão de turmas, estudantes (com transferência), professores, responsáveis e convites; regras configuráveis de faltas recorrentes; acompanhamento pedagógico restrito; conflitos de chamada; comunicados; relatórios (CSV); calendário; registro de envios |
| **Administração da plataforma** | Escolas (cadastro, suspensão/reativação, convites de gestão), administradores, auditoria — **sem acesso a dados de estudantes** |

Também incluídos: cadastro, login, logout, recuperação de senha por código, sessão segura, seleção de
escola/perfil para quem tem vários vínculos, primeiro acesso por **código de convite**, política de
privacidade, indicadores de sincronização, tratamento de perda de conexão, estados de carregamento,
vazio e erro em todas as telas.

## Stack

* **App:** Expo SDK 58, React Native 0.88, TypeScript estrito, Expo Router, FlashList, expo-sqlite,
  TanStack Query, Zustand, React Hook Form + Zod, expo-secure-store, expo-network,
  expo-notifications, expo-background-task.
* **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, funções RPC, Edge Function).
* **Qualidade:** Jest + React Native Testing Library, node:test + PGlite (banco), ESLint, Prettier, TypeScript.

Decisões e diagrama: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Como executar

### Pré-requisitos

* Node.js 20+ (testado com 24.20) e npm.
* Um projeto gratuito no [Supabase](https://supabase.com).
* Celular com o app **Expo Go** (SDK 58) **ou** um APK/development build (ver [Build](#build-apk)).

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar o backend

Siga [docs/BACKEND.md](docs/BACKEND.md) (≈ 10 minutos):

1. Crie o projeto no Supabase.
2. Execute as 6 migrations de `supabase/migrations/` **em ordem** e depois `supabase/seed.sql`
   (SQL Editor ou `npx supabase db push --include-seed`).
3. Ajuste o template de e-mail de redefinição de senha para conter `{{ .Token }}`.
4. Copie `.env.example` para `.env` e preencha a URL e a chave **pública** (anon):

```env
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica
```

> Nunca coloque a `service_role` key no app. Ela só é usada na Edge Function, no servidor.

### 3. Iniciar

```bash
npx expo start
```

Leia o QR Code com o Expo Go (Android) ou a câmera (iOS). Sem o `.env`, o app abre uma tela
explicando que o backend não está configurado.

## Contas de demonstração

Todas fictícias, com senha **`Demo@2026`**. O domínio `.demo` não recebe e-mails.

| Perfil | E-mail | Escola |
|---|---|---|
| Administração da plataforma | `admin@eduvinculo.demo` | — |
| Coordenação | `coordenacao@eduvinculo.demo` | Escola Municipal Vínculo do Saber (Teresina-PI) |
| Direção | `direcao@eduvinculo.demo` | Escola Municipal Vínculo do Saber |
| Professora (6º A, turmas de teste 100 e 500) | `professora@eduvinculo.demo` | Escola Municipal Vínculo do Saber |
| Professor (8º C) | `professor@eduvinculo.demo` | Escola Municipal Vínculo do Saber |
| Responsável (mãe de Lucas e Ana Clara) | `responsavel@eduvinculo.demo` | Escola Municipal Vínculo do Saber |
| Estudante (Lucas) | `estudante@eduvinculo.demo` | Escola Municipal Vínculo do Saber |
| Coordenação de outra escola (teste de isolamento) | `coordenacao2@eduvinculo.demo` | Escola Estadual Horizonte Azul |

**Códigos de convite de demonstração** (para testar o primeiro acesso com uma conta nova):

| Código | Efeito |
|---|---|
| `DEMO-PROF-2026` | Vira professor(a) da escola (até 20 usos) |
| `DEMO-RESP-2026` | Vincula a conta ao responsável "José Moura Teixeira", pai de Lucas (1 uso) |
| `DEMO-ALUNO-2026` | Vincula a conta à estudante "Ana Clara" (1 uso) |

O seed inclui 2 escolas, 5 turmas (30, 25, 100, 500 e 20 estudantes), 675 estudantes fictícios,
6 semanas de chamadas, notificações, comunicados, calendário e acompanhamentos pedagógicos. A chamada
de **hoje** fica pendente de propósito, para a demonstração.

## Como testar cada perfil

* **Professora:** Início › "Chamadas pendentes" › 6º Ano A › marque e conclua. Ative o modo avião,
  faça outra chamada (Turma de Teste — 500, aberta antes com internet), feche e reabra o app; ao
  voltar a conexão, veja a sincronização em Mais › Sincronização.
* **Professor:** só enxerga o 8º C (isolamento por turma).
* **Responsável:** Início mostra Lucas (2 faltas consecutivas recentes) e Ana Clara; abra a
  notificação de falta; em Comunicados, confirme a ciência da reunião.
* **Estudante:** Início/Frequência/Calendário com os próprios dados.
* **Coordenação:** Painel, Faltas (alertas com motivos), Acompanhamento, Gestão (turmas, estudantes,
  convites, regras), Relatórios (exportação CSV) e Conflitos.
* **Isolamento entre escolas:** `coordenacao2@eduvinculo.demo` não vê nada da escola 1.
* **Administração:** escolas com contagens, suspensão, convites de gestão e auditoria.

## Testes automatizados

```bash
npm run typecheck   # TypeScript (app + scripts)
npm run lint        # ESLint
npm test            # Jest: domínio, validação, permissões, sincronização offline (SQL real), interface
npm run test:db     # Banco: migrations + seed + RLS + RPCs em PostgreSQL embarcado (PGlite)
npm run test:all    # tudo acima
```

Resultado na última execução: **57 testes** (Jest) e **37 testes** de banco, todos passando.

Cobertura funcional: autenticação/convites, permissões e isolamento entre escolas, cálculo de
frequência, registro de chamada, prevenção de duplicação (idempotência), faltas recorrentes,
sincronização offline, conflitos, validação de formulários e componentes de interface.

## Desempenho

Otimizações implementadas e **resultados medidos** (antes × depois): [docs/PROFILING.md](docs/PROFILING.md).

```bash
npm run bench:db       # RLS original × otimizada (mesmos dados)
npm run bench:domain   # algoritmo de alertas e gravação SQLite (antes × depois)
```

Destaques medidos: histórico da responsável **609 ms → 4,5 ms**; detecção de faltas para 500
estudantes **85 ms → 1,1 ms**; gravação local da turma de 500 **150 ms → 1,3 ms**.
As medições no celular são feitas pelo próprio app (Mais › Desempenho e Laboratório de listas)
e pelo Android Studio Profiler, seguindo o procedimento do relatório.

## Build (APK)

Build na nuvem com EAS (não exige Android Studio):

```bash
npx eas-cli@latest login
npx eas-cli@latest init                      # cria o projeto EAS
npx eas-cli@latest build -p android --profile preview      # APK instalável
npx eas-cli@latest build -p android --profile development  # development build (push remoto, profiling)
```

Defina as variáveis `EXPO_PUBLIC_*` no EAS (`npx eas-cli@latest env:create`) ou mantenha o `.env`
local ao rodar o build.

## Estrutura do projeto

```
src/
  app/                 rotas (Expo Router): (auth), (app)/teacher|guardian|coordinator|student|admin, telas compartilhadas
  core/                configuração, erros, datas BR, ids, métricas, agendamento
  domain/              regras de negócio puras (frequência, alertas, papéis, validação)
  data/local/          SQLite: migrações locais, cache, outbox
  data/remote/         cliente Supabase e sessão segura
  data/repositories/   acesso a dados por funcionalidade (offline-first)
  data/sync/           motor de sincronização e tarefa em segundo plano
  features/            estado global, hooks, telas compartilhadas
  ui/                  tema e componentes reutilizáveis
supabase/
  migrations/          6 migrations versionadas (schema, RLS, RPCs, otimização)
  seed.sql             dados de demonstração fictícios
  functions/           Edge Function dispatch-push
  tests/               testes de banco (PGlite)
scripts/               benchmarks
docs/                  arquitetura, backend, profiling, LGPD, apresentação
```

## O que depende de configuração externa

| Item | Necessário | Onde |
|---|---|---|
| Projeto Supabase + `.env` | **Sim** (o app não funciona sem backend) | docs/BACKEND.md §1–2 |
| Template de e-mail com `{{ .Token }}` | Para recuperação de senha | docs/BACKEND.md §3 |
| SMTP próprio | Para volume real de e-mails | Supabase › Auth › SMTP |
| EAS + FCM + Edge Function `dispatch-push` + agendamento | Somente para push remoto com o app fechado | docs/BACKEND.md §4 |
| Cron de `purge_expired_data()` | Política de retenção | docs/BACKEND.md §5 |

## Limitações conhecidas

* O app e o banco foram validados por testes automatizados, typecheck, lint e build do bundle
  Android; **não foram executados em um celular nem contra um projeto Supabase hospedado** no
  ambiente de desenvolvimento (sem Android SDK/Docker). A primeira execução real pode revelar
  ajustes de configuração.
* A Edge Function de push foi escrita, mas não executada (requer credenciais FCM/EAS).
* Push remoto não funciona no Expo Go para Android (limitação do Expo desde o SDK 53); avisos locais
  e notificações dentro do app funcionam.
* Métricas de FPS da UI e memória no aparelho ainda precisam ser coletadas (procedimento em docs/PROFILING.md).
* Uma chamada por turma por horário (`lesson_slot`); a grade usa 1 aula por dia nas turmas do seed.
* Datas usam deslocamento fixo de fuso (o Brasil não tem horário de verão desde 2019).
