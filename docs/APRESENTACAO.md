# Roteiro da apresentação (~10 minutos)

> Antes de apresentar: backend configurado com o seed; app instalado (APK de release ou Expo Go);
> celular carregado; medições do aparelho já coletadas (docs/PROFILING.md, seção 4);
> e-mails/senha das contas de demonstração à mão (README).

## Parte 1 — Introdução e contexto (1 min)

* **Presença+ — "Escola, família e estudante conectados."** Integrantes: _[preencher nomes]_.
* **Problema:** faltas frequentes passam despercebidas quando a escola não acompanha a frequência
  nem fala com a família; isso esconde dificuldades de aprendizagem, problemas familiares,
  desmotivação e risco de abandono.
* **Proposta:** acompanhamento **preventivo** — o sistema sinaliza fatos; a equipe pedagógica decide.
* **Gargalo técnico esperado:** listas grandes de estudantes, sincronização de chamadas e
  persistência offline em celulares Android de pouca memória.

## Parte 2 — Stack e arquitetura (1,5 min)

* Expo SDK 58 / React Native 0.88 (Nova Arquitetura, Hermes) + TypeScript estrito.
* Supabase: PostgreSQL com **RLS em todas as tabelas**, Auth e funções RPC.
* Camadas: telas (Expo Router) → hooks/ViewModels (TanStack Query, Zustand) → repositórios
  → SQLite local / Supabase; regras puras no domínio. Mostrar o diagrama de `docs/ARQUITETURA.md`.
* **Offline-first:** grava no SQLite primeiro, envia depois; fila com idempotência.

## Parte 3 — Demonstração "caminho feliz" (2 min)

1. Login `professora@presenca.demo` → painel: chamadas pendentes, próximas aulas, alertas.
2. Turmas › **6º Ano A** › Chamada: marcar presenças/faltas (mostrar fluidez), "Restantes: presente",
   **Concluir** → confirmação com resumo.
3. **Sem internet:** ativar modo avião → abrir a **Turma de Teste — 500** → registrar e concluir →
   selo "Pendente (offline)" → desativar modo avião → selo muda para "Sincronizada".
4. Faltas recorrentes: aba da turma mostra Lucas com "2 faltas consecutivas".
5. Login `responsavel@presenca.demo` → notificação de falta e comunicado com confirmação de ciência.
6. Login `coordenacao@presenca.demo` → painel (frequência média, turmas com mais faltas, evolução),
   **Faltas** › registrar acompanhamento.

## Parte 4 — Mergulho técnico (3,5 min) — escolher 3

1. **Virtualização + memoização (UI / memória):** FlashList recicla células; `AttendanceRow`
   memoizada + callback estável → marcar um estudante re-renderiza **1 linha**, não 500.
   Demonstrar o **Laboratório de listas** (ANTES × DEPOIS) em Mais › Desempenho.
2. **Concorrência e assincronismo:** SQLite assíncrono (thread nativa) em **transação + prepared
   statement**; sincronização *single-flight* em segundo plano, backoff exponencial, cancelamento
   com `AbortSignal` ao sair da tela; tarefas não urgentes com `requestIdleCallback`.
3. **Rede e dados offline:** outbox com `op_id` (idempotência — testes provam que reenvio não
   duplica), download incremental por cursor `updated_at`, paginação, cache com expiração, e
   **conflitos sem sobrescrita** (as duas versões ficam para revisão).
4. **(Bônus) Banco:** RLS reescrita para avaliar permissões uma vez por consulta em vez de por linha.

## Parte 5 — Métricas e profiling (1,5 min)

Mostrar as tabelas de `docs/PROFILING.md`:

* **RLS (medido):** histórico da responsável **609 ms → 4,5 ms (135x)**; turma de 500 **67,6 → 3,7 ms (18x)**.
* **Alertas (medido):** 500 estudantes **85,1 → 1,1 ms (79x)** — a versão antiga estouraria vários quadros de 16,7 ms.
* **SQLite (medido):** gravar turma de 500 **149,6 → 1,3 ms (117x)**.
* **No aparelho:** prints do Android Studio Profiler e da tela Desempenho (preencher a tabela 4.3
  com as medições reais antes da apresentação). **Não afirmar FPS sem medir.**
* **Limitações:** banco medido em PGlite; domínio medido no computador; UI/memória dependem do aparelho.

## Parte 6 — Encerramento (30 s)

* **Principal desafio:** sincronizar chamadas feitas offline sem duplicar e sem sobrescrever o
  trabalho de outra pessoa (idempotência por `op_id` + versionamento + tabela de conflitos).
* **Aprendizados:** medir antes de otimizar (a RLS por linha só apareceu medindo); regras de acesso
  no banco, não na tela.
* **Próximos passos:** push remoto em produção (FCM), relatórios em PDF, integração com sistemas
  oficiais de matrícula, modo multiaulas por dia na grade, acessibilidade com leitores de tela
  validada com usuários.

## Contas para a demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Professora | professora@presenca.demo | Demo@2026 |
| Responsável | responsavel@presenca.demo | Demo@2026 |
| Coordenação | coordenacao@presenca.demo | Demo@2026 |
| Estudante | estudante@presenca.demo | Demo@2026 |
| Administração | admin@presenca.demo | Demo@2026 |
