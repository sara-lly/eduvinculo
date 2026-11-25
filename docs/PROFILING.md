# Relatório de desempenho e profiling — Presença+

> **Regra deste documento:** somente números **realmente medidos** aparecem como resultado.
> O que ainda precisa ser medido no celular está marcado como **[medir no aparelho]**, com o
> procedimento exato. Nada aqui afirma "60 FPS" sem medição.

## 1. Gargalo esperado

Listas extensas de estudantes (turmas de 30, 100 e 500), sincronização das chamadas e
persistência offline podem comprometer a fluidez, especialmente em aparelhos Android de entrada.

## 2. Otimizações implementadas (onde estão no código)

| # | Técnica | Onde | Categoria (disciplina) |
|---|---|---|---|
| 1 | Políticas RLS com conjunto de ids avaliado **uma vez por consulta** (InitPlan) em vez de função por linha | `supabase/migrations/20261124000006_rls_performance.sql` | Rede/dados |
| 2 | Virtualização com **FlashList** + linha **memoizada** + callback estável (só a linha tocada re-renderiza) | `src/app/(app)/attendance/[classroomId].tsx`, `src/ui/components/attendance.tsx` | Interface / memória |
| 3 | Gravação local em **transação única + prepared statement** (SQLite em thread nativa) | `src/data/local/attendanceStore.ts` (`replaceRoster`, `saveSessionAndEnqueue`) | Concorrência / offline |
| 4 | Detecção de faltas recorrentes **O(n log n)** (agrupamento único) no lugar de O(estudantes × registros) | `src/domain/alerts.ts` (usada offline em `attendanceRepository.localAlerts`) | CPU |
| 5 | **Offline-first** com fila (outbox), idempotência por `op_id`, *single-flight*, backoff exponencial e sincronização em segundo plano | `src/data/sync/syncEngine.ts`, `src/data/sync/backgroundSync.ts` | Concorrência / rede |
| 6 | Sincronização **incremental** por cursor `updated_at` + paginação (200 estudantes / 100 chamadas por página) | `src/data/repositories/attendanceRepository.ts` | Rede |
| 7 | Cache limitado: TanStack Query `gcTime` 5 min; SQLite com política de expiração (60 dias de histórico, listas não abertas há 30 dias, cache de respostas 7 dias) | `src/features/queryClient.ts`, `pruneCache` | Memória |
| 8 | Cancelamento de requisições ao sair da tela (`AbortSignal`), limpeza de listeners, abas montadas sob demanda (`lazy`) | telas + `src/features/bootstrap.tsx` | Memória / CPU |
| 9 | Agregações no banco/SQLite (dashboards e históricos calculados no servidor; contagens no SQLite) | RPCs `get_*_dashboard`, `listSessions` | CPU / rede |
| 10 | Tarefas não urgentes adiadas para quando a thread JS fica ociosa (`requestIdleCallback`) | `src/core/scheduling.ts` | Inicialização |

## 3. Resultados medidos (antes × depois, mesmas condições)

### 3.1 Banco de dados — políticas RLS (medido)

* Comando: `npm run bench:db`
* Ambiente: PGlite 0.6 (PostgreSQL 19 compilado para WebAssembly) no Node v24.20.0, Intel Core i5-13420H, 24/11/2026.
* Mesmos dados do seed (675 estudantes, 8.850 registros); mediana de 15 execuções; o script **falha** se o número de linhas retornadas divergir entre antes e depois.

| Cenário | Linhas | Antes (ms) | Depois (ms) | Ganho |
|---|---:|---:|---:|---:|
| Responsável lista seus estudantes | 2 | 39,5 | 0,8 | 47,3x |
| Responsável lê histórico (registros) | 60 | 609,1 | 4,5 | 135,5x |
| Professora carrega turma de 30 | 30 | 3,5 | 1,3 | 2,7x |
| Professora carrega turma de 100 | 100 | 12,3 | 1,6 | 7,7x |
| Professora carrega turma de 500 | 500 | 67,6 | 3,7 | 18,5x |
| Coordenação lista estudantes (página de 50) | 50 | 19,5 | 0,9 | 22,7x |
| Coordenação de outra escola (0 linhas) | 0 | 40,5 | 0,7 | 57,5x |

**Limitação:** PGlite roda em WebAssembly e é mais lento que um PostgreSQL nativo do Supabase; os
valores absolutos no servidor real serão menores, mas a relação antes/depois é a mesma (mesmos
planos de execução).

### 3.2 Código do app — algoritmo e SQLite local (medido)

* Comando: `npm run bench:domain`
* Ambiente: Node v24.20.0, Intel Core i5-13420H, 24/11/2026 (**computador**, não o celular).

**Detecção de faltas recorrentes** (40 dias letivos por estudante, mediana de 9 execuções; teste
automatizado garante resultado idêntico entre as duas versões):

| Estudantes | Registros | Antes — ingênua (ms) | Depois — otimizada (ms) | Ganho |
|---:|---:|---:|---:|---:|
| 30 | 1.200 | 1,37 | 0,29 | 4,8x |
| 100 | 4.000 | 7,13 | 0,81 | 8,8x |
| 500 | 20.000 | 85,13 | 1,08 | 79,1x |

> Interpretação: um quadro de 60 FPS dispõe de ~16,7 ms. A versão ingênua com 500 estudantes
> (85 ms já no computador) bloquearia a thread de JavaScript por vários quadros no celular.

**Gravação da lista de estudantes no SQLite** (arquivo em disco, WAL, mediana de 5 execuções):

| Estudantes | Antes — INSERT avulso (ms) | Depois — transação + prepared (ms) | Ganho |
|---:|---:|---:|---:|
| 30 | 10,27 | 0,35 | 29,2x |
| 100 | 30,40 | 0,52 | 58,0x |
| 500 | 149,62 | 1,28 | 116,8x |

### 3.3 No aparelho — **[medir no aparelho]**

Estas medições dependem de um celular Android e **não foram executadas** neste ambiente
(sem Android SDK/emulador nesta máquina). O app já traz a instrumentação para coletá-las:

| Métrica | Como o app mede | Onde ver |
|---|---|---|
| Início do JS → primeira tela útil | `markFirstScreen()` nos dashboards | Mais › Desempenho |
| Tela de chamada pronta (30/100/500) | `attendance.screen_ready` | Mais › Desempenho |
| Salvar chamada no aparelho | `attendance.save_local` | Mais › Desempenho |
| Sincronização com o servidor | `attendance.sync` | Mais › Desempenho |
| Alertas calculados offline | `alerts.local_compute` | Mais › Desempenho |
| Lista ANTES × DEPOIS: montagem, custo por marcação, FPS do JS na rolagem | Laboratório de listas | Mais › Desempenho › Laboratório |

## 4. Procedimento de medição no celular (mesmas condições)

1. **Gere um APK de release** (os tempos em modo desenvolvimento são muito maiores):
   `npx eas-cli@latest build --platform android --profile preview` e instale o APK.
2. Use **o mesmo aparelho**, carregado acima de 50%, modo avião **desligado**, Wi-Fi estável,
   sem outros apps abertos. Anote modelo, Android e RAM (aparecem na tela Desempenho).
3. Entre como `professora@eduvinculo.demo` (turmas de 30, 100 e 500 estudantes no seed).
4. **Laboratório de listas** (Mais › Desempenho › Abrir laboratório): para 30, 100 e 500,
   rode ANTES e DEPOIS, tocando em "Medir marcações" e "Medir rolagem" **3 vezes cada**.
5. **Fluxo real:** abra a chamada das três turmas, marque e conclua. Repita 3 vezes.
6. **Offline:** ative o modo avião, registre uma chamada, feche o app, reabra (os dados
   permanecem), desative o modo avião e observe a sincronização (Mais › Sincronização).
7. Em Mais › Desempenho toque em **Compartilhar** e cole os resultados na tabela abaixo.

### 4.1 Android Studio Profiler (memória e CPU)

1. Instale o APK, conecte o celular por USB com **Depuração USB** ativa.
2. Android Studio › *View › Tool Windows › Profiler* › selecione `app.presencaplus.mobile`.
3. **Memory:** abra o Laboratório com 500 estudantes; registre o pico de memória no modo ANTES
   e no modo DEPOIS (remontando a lista entre as medições). Faça um *heap dump* após sair da
   tela de chamada para verificar que as linhas foram liberadas.
4. **CPU:** grave um *System Trace* durante "Medir rolagem" em cada modo.
5. Tempo de inicialização a frio: `adb shell am force-stop app.presencaplus.mobile` e
   `adb shell am start -W -n app.presencaplus.mobile/.MainActivity` (campo `TotalTime`), 5 vezes.

### 4.2 React Native DevTools

Com o app em development build (`npx expo start`, tecla `j`): aba **Profiler** para ver quais
componentes renderizam ao marcar um estudante (no modo DEPOIS apenas a linha tocada) e aba
**Performance** para os quadros da thread JS.

### 4.3 Tabela para preencher com as medições do aparelho

| Métrica | Turma | ANTES | DEPOIS |
|---|---|---|---|
| Montagem da lista (ms) | 500 | | |
| Marcação — render + commit (ms, mediana) | 500 | | |
| FPS da thread JS durante rolagem | 500 | | |
| Memória (MB, Android Studio) | 500 | | |
| Cold start — `TotalTime` (ms) | — | — | |
| Salvar chamada no aparelho (ms) | 30 / 100 / 500 | — | |
| Sincronização (ms) | 30 / 100 / 500 | — | |

## 5. Limitações

* Os resultados de banco foram medidos em PGlite (WebAssembly), não no Supabase hospedado.
* Os resultados de domínio/SQLite foram medidos no computador (Node.js), não no celular.
* FPS da thread de UI e memória exigem o Android Studio Profiler no aparelho (procedimento acima).
* A sincronização em segundo plano depende do agendamento do Android (mínimo de ~15 min, inexato).
