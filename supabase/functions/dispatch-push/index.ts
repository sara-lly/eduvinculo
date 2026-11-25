/**
 * Supabase Edge Function: dispatch-push
 *
 * Envia as notificações push PENDENTES (tabela notification_deliveries) pelo
 * serviço Expo Push, com:
 *  - conteúdo GENÉRICO (nada de nomes/detalhes na tela bloqueada);
 *  - controle de tentativas com backoff exponencial;
 *  - registro de sucesso/falha por entrega;
 *  - remoção de tokens inválidos (DeviceNotRegistered).
 *
 * Usa a SERVICE ROLE KEY, disponível apenas no ambiente da função (nunca no app).
 * Deploy: supabase functions deploy dispatch-push
 * Agendamento sugerido: a cada 1 minuto (Supabase Cron) ou Database Webhook em
 * INSERT de notification_deliveries. Ver docs/BACKEND.md.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 5;
const BATCH = 100;

interface Delivery {
  id: string;
  recipient_id: string;
  attempts: number;
}

Deno.serve(async (req) => {
  // Protege a função: somente chamadas com a service role (cron/webhook).
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } });

  const { data: pending, error } = await supabase
    .from('notification_deliveries')
    .select('id, recipient_id, attempts')
    .eq('channel', 'push')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at')
    .limit(BATCH);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const deliveries = (pending ?? []) as Delivery[];
  if (deliveries.length === 0) return Response.json({ processed: 0 });

  const recipientIds = [...new Set(deliveries.map((d) => d.recipient_id))];
  const { data: tokens } = await supabase.from('push_tokens').select('user_id, token').in('user_id', recipientIds);
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokens ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t.token);
    tokensByUser.set(t.user_id, list);
  }

  let sent = 0;
  let failed = 0;
  for (const d of deliveries) {
    const userTokens = tokensByUser.get(d.recipient_id) ?? [];
    if (userTokens.length === 0) {
      await supabase.from('notification_deliveries').update({ status: 'skipped', last_error: 'Sem token de push' }).eq('id', d.id);
      continue;
    }
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip' },
        body: JSON.stringify(userTokens.map((to) => ({
          to,
          title: 'Presença+',
          body: 'Você tem uma nova notificação da escola. Abra o app para ver.',
          sound: null,
          channelId: 'default',
          priority: 'default',
        }))),
      });
      const json = await res.json();
      const tickets: { status: string; details?: { error?: string }; message?: string }[] = json.data ?? [];
      const invalid = tickets
        .map((t, i) => (t.details?.error === 'DeviceNotRegistered' ? userTokens[i] : null))
        .filter((x): x is string => !!x);
      if (invalid.length) await supabase.from('push_tokens').delete().in('token', invalid);

      if (res.ok && tickets.some((t) => t.status === 'ok')) {
        await supabase.from('notification_deliveries')
          .update({ status: 'sent', attempts: d.attempts + 1, sent_at: new Date().toISOString(), last_error: null })
          .eq('id', d.id);
        sent++;
      } else {
        throw new Error(tickets.map((t) => t.message).filter(Boolean).join('; ') || `HTTP ${res.status}`);
      }
    } catch (e) {
      const attempts = d.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const delayMin = Math.min(60, 2 ** attempts);
      await supabase.from('notification_deliveries').update({
        status: giveUp ? 'failed' : 'pending',
        attempts,
        last_error: String((e as Error).message ?? e).slice(0, 500),
        next_attempt_at: giveUp ? null : new Date(Date.now() + delayMin * 60_000).toISOString(),
      }).eq('id', d.id);
      failed++;
    }
  }

  return Response.json({ processed: deliveries.length, sent, failed });
});
