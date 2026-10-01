// ============================================================
// Limpa do app_state as aulas que casarem com um regex, nas DUAS
// camadas de cache que o app usa (sections.aiCache e meta.aiCache).
// Nao toca em progresso, XP, chat, tema ou qualquer outro estado:
// apaga SOMENTE a entrada de aula pedida.
//
// Motivo de existir: o app tem cache em 3 camadas e a aula volta
// pelo servidor mesmo depois de limpar o localStorage. Sem isso nao
// da para provar que uma regeneracao aconteceu de verdade.
//
// Uso: node tools/limpar-cache-aula.mjs <regex, ex: hist>
// ============================================================
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const alvo = new RegExp(process.argv[2] ?? 'hist', 'i');

const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
await cliente.auth.signInAnonymously();

const { data, error } = await cliente
  .from('app_state')
  .select('data')
  .eq('id', 'principal')
  .single();
if (error) throw error;

const estado = data.data;
const removidas = [];

for (const caminho of ['sections', 'meta']) {
  const cache = estado[caminho]?.aiCache;
  if (!cache || typeof cache !== 'object') continue;
  for (const chave of Object.keys(cache)) {
    if (alvo.test(chave)) {
      delete cache[chave];
      removidas.push(`${caminho}: ${chave}`);
    }
  }
}

const { error: e } = await cliente
  .from('app_state')
  .update({ data: estado, updated_at: new Date().toISOString() })
  .eq('id', 'principal');

removidas.forEach((r) => console.log(`removida ${r}`));
console.log(e ? `ERRO: ${e.message}` : 'app_state atualizado');
console.log('meta preservada:', Object.keys(estado.meta ?? {}).join(', '));
