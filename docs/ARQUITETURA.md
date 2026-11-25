# Arquitetura do Presença+

## Visão geral

```
┌──────────────────────────── Aplicativo (Expo / React Native) ────────────────────────────┐
│  Apresentação      src/app/**           telas (Expo Router) — sem SQL, sem regras          │
│                    src/ui/**            componentes reutilizáveis, tema, estados           │
│  ViewModels        src/features/**      hooks/estado (TanStack Query, Zustand), bootstrap  │
│  Domínio           src/domain/**        regras puras: frequência, alertas, papéis, Zod     │
│  Dados             src/data/repositories  casos de uso de dados (offline-first)            │
│                    src/data/local/**    SQLite (cache + outbox) — expo-sqlite (thread nativa)│
│                    src/data/sync/**     motor de sincronização + tarefa em segundo plano   │
│                    src/data/remote/**   cliente Supabase (chave pública + sessão segura)   │
│  Núcleo            src/core/**          config, erros, datas BR, ids, métricas, agendamento│
└───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                            │ HTTPS (PostgREST/RPC), JWT do usuário
┌───────────────────────────────────────────▼──────────────────────────────────────────────┐
│ Supabase: Auth • PostgreSQL com RLS em todas as tabelas • RPCs com validação • auditoria │
│           Edge Function dispatch-push (service role, somente no servidor)                 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Inspirada em **Clean Architecture + MVVM**: as telas consomem *hooks* (ViewModels) que chamam
**repositórios**; repositórios combinam **fonte local** (SQLite) e **remota** (Supabase); regras de
negócio ficam no **domínio** (funções puras e testáveis) e são reforçadas no **banco**.

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| Expo SDK 58 + React Native 0.88 (Nova Arquitetura) + TypeScript estrito | Stack sugerida, build na nuvem (EAS) sem Android Studio, Hermes |
| Expo Router com rotas protegidas (`Stack.Protected`) | Navegação por arquivos; áreas separadas por perfil |
| FlashList | Reciclagem de células para listas de 500+ estudantes |
| expo-sqlite (assíncrono) | Persistência offline com consultas fora da thread JS |
| TanStack Query | Cache em memória limitado, deduplicação de requisições, refetch ao reconectar |
| Zustand | Estado global mínimo (sessão e contexto ativo) com seletores |
| React Hook Form + Zod | Formulários sem re-render por tecla, validação tipada em português |
| expo-network (em vez de NetInfo) | Módulo oficial do Expo, sem dependência extra |
| expo-secure-store (fragmentado) | Sessão no Keychain/Keystore; contorna limite de tamanho |
| Regras críticas no banco (RLS + RPC `security definer` com checagens) | Autorização nunca depende do app |
| Ids de chamada gerados no aparelho (UUID v4) + `op_id` por operação | Criação offline idempotente |
| PGlite nos testes do banco | Executa migrations/RLS reais sem Docker |
| `node:sqlite` nos testes do app | Executa o SQL real do banco local fora do celular |

## Fluxo offline-first da chamada

```
Professor marca presenças ──► estado local da tela (Map, só a linha tocada re-renderiza)
        │ Salvar / Concluir
        ▼
SQLite (1 transação): upsert da sessão + registros + operação na outbox (op_id)
        │                                  ▲
        │ dispara sem bloquear a UI        │ falha de rede: backoff exponencial (5 s … 10 min)
        ▼                                  │
SyncEngine (single-flight) ── RPC sync_attendance_session(op_id, sessão, registros, base_version)
        │
        ├─ applied   → marca "sincronizada", adota id do servidor se outro aparelho criou a mesma chamada
        ├─ replayed  → op_id já processado (reenvio após resposta perdida): mesmo resultado, sem duplicar
        ├─ conflict  → outra pessoa editou desde a versão conhecida: NADA é sobrescrito;
        │              servidor guarda as duas versões em attendance_conflicts para revisão
        └─ erro definitivo (permissão/validação) → marcado como erro, visível e reenviável
```

Gatilhos de sincronização: ao salvar, ao reconectar (listener de rede), ao voltar o app para
primeiro plano, ao entrar, manualmente (tela Sincronização) e em segundo plano
(`expo-background-task`, ≥ 15 min).

Download incremental: por turma, apenas chamadas com `updated_at` > cursor salvo; o *merge* nunca
sobrescreve alterações locais pendentes.

## Segurança em camadas

1. **App:** mostra só o que o papel pode usar (`can()`); sessão em armazenamento seguro; dados locais apagados no logout.
2. **API:** apenas chave pública; JWT do usuário em cada chamada.
3. **Banco:** RLS em todas as tabelas, sem política = negado; `anon` sem acesso; escritas sensíveis
   só via RPC com checagens explícitas; triggers impedem auto-promoção e mistura de escolas.
4. **Auditoria:** gatilhos registram autor, ação e campos alterados.

## Testes

| Camada | Ferramenta | Arquivo |
|---|---|---|
| Banco (RLS, RPCs, idempotência, conflitos, convites, isolamento entre escolas) | node:test + PGlite | `supabase/tests/database.test.ts` |
| Sincronização offline (SQL real do SQLite) | Jest + node:sqlite | `src/data/sync/syncEngine.test.ts` |
| Regras de negócio, validação, permissões, datas, erros | Jest | `src/domain/*.test.ts`, `src/core/core.test.ts` |
| Interface | React Native Testing Library | `src/ui/components/components.test.tsx` |
