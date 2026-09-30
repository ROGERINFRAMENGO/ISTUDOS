// ============================================================
// Testa a PERSONA da Tutora depois da mudanca de prompt.
// ------------------------------------------------------------
// Nao testa codigo: chama a Edge Function real (Groq) e avalia o
// texto que volta. Os cenarios sao os que a Anna realmente faz.
//
// Uso: node tools/testar-persona.mjs
// ============================================================

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';
const ORIGEM = 'https://rogerinframengo.github.io';

// Bloco de emoji: evita contagem errada por emoji composto.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;
// Palavras de romance que a persona proibe explicitamente.
const ROMANCE = /meu amor|minha princesa|princesa|queridinha|querido|seu amor|te amo|amo voce|bebe|gatinha/i;
const ROBOTICO = /com certeza, ficarei feliz|excelente pergunta|vou explicar detalhadamente|estou a disposicao|como posso ajudar/i;
const INFANTIL = /coitadinho|florzinha|docinho|queridinho|minha estrela/i;

async function sessao() {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(BASE, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data?.session) throw new Error(error?.message ?? 'sem sessao anonima');
  return data.session.access_token;
}

// Uma unica sessao para o teste inteiro: o projeto limita criacoes de
// sessao anonima, e trocar de token no meio derrubaria a avaliacao.
// O texto dessa nota fica junto do loop, na secao de execucao.

async function perguntar(token, messages) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/functions/v1/tutor-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token}`, Origin: ORIGEM },
    body: JSON.stringify({
      stream: false,
      messages,
      context: { student: { name: 'Anna', xp: 260, level: 1, streak: 1, questionsAnswered: 28, questionsCorrect: 8 } },
    }),
  });
  const ms = Date.now() - t0;
  const bruto = await r.text();
  if (!r.ok) {
    let erro = `HTTP ${r.status}`;
    try { erro += ` ${JSON.parse(bruto).error ?? ''}`; } catch { /* nao-JSON */ }
    return { erro, ms };
  }
  return { reply: JSON.parse(bruto).reply, ms };
}

function avaliar(reply) {
  return {
    nome: (reply.match(/Anna/gi) || []).length,
    emojis: (reply.match(EMOJI) || []).length,
    romance: ROMANCE.test(reply),
    robotico: ROBOTICO.test(reply),
    infantil: INFANTIL.test(reply),
    markdown: /\*\*|^#{1,3} /m.test(reply),
    tamanho: reply.length,
  };
}

const CENARIOS = [
  { rotulo: '1. "Nao entendi DNA."', msgs: [{ role: 'user', content: 'NÃ£o entendi DNA.' }] },
  { rotulo: '2. "E gene?" (continuidade)', msgs: [
    { role: 'user', content: 'NÃ£o entendi DNA.' },
    { role: 'assistant', content: 'DNA Ã© o material que guarda as informaÃ§Ãµes genÃ©ticas das cÃ©lulas, como um manual de instruÃ§Ãµes.' },
    { role: 'user', content: 'E gene?' },
  ] },
  { rotulo: '3. "explica como se nunca tivesse estudado"', msgs: [{ role: 'user', content: 'Explica como se eu nunca tivesse estudado isso.' }] },
  { rotulo: '4. "Eu errei essa questÃ£o."', msgs: [{ role: 'user', content: 'Eu errei essa questÃ£o.' }] },
  { rotulo: '5. "Me da um exemplo."', msgs: [{ role: 'user', content: 'Me dÃ¡ um exemplo.' }] },
  { rotulo: '6. "Faz uma questÃ£o parecida."', msgs: [{ role: 'user', content: 'Faz uma questÃ£o parecida.' }] },
  { rotulo: '7. "Me ajuda sem dar a resposta."', msgs: [{ role: 'user', content: 'Me ajuda sem dar a resposta. Quanto Ã© 3/4 + 1/8?' }] },
  { rotulo: '8. "Acertei!"', msgs: [
    { role: 'user', content: 'Quanto Ã© 3/4 + 1/8?' },
    { role: 'assistant', content: 'Vamos pensar juntas! 3/4 = 6/8. E 6/8 + 1/8 = ?' },
    { role: 'user', content: 'Acertei!' },
  ] },
  { rotulo: '9. "Nao consegui entender ainda."', msgs: [
    { role: 'user', content: 'O que Ã© mitocÃ´ndria?' },
    { role: 'assistant', content: 'A mitocÃ´ndria Ã© uma parte da cÃ©lula que produz energia.' },
    { role: 'user', content: 'NÃ£o consegui entender ainda.' },
  ] },
  { rotulo: '11. Pergunta SIMPLES', msgs: [{ role: 'user', content: 'O que significa explÃ­cito?' }] },
  { rotulo: '12. Pergunta COMPLEXA', msgs: [{ role: 'user', content: 'Qual a diferenÃ§a entre compreensÃ£o e interpretaÃ§Ã£o?' }] },
  { rotulo: '10. Contextual na aula', msgs: [{ role: 'user', content: 'O que Ã© uma fraÃ§Ã£o?' }] },
];

// Uma unica sessao para o teste inteiro: o projeto limita criacoes de
// sessao anonima, e trocar de token no meio derrubaria a avaliacao.
const token = await sessao();
console.log('sessao anonima ok\n');
const resumo = [];

for (const c of CENARIOS) {
  // Pausa entre cenarios: 12 mensagens em rajada batem no rate limit
  // do provider e devolvem 502, o que mascara a avaliacao da persona.
  await new Promise((s) => setTimeout(s, 6000));
  const r = await perguntar(token, c.msgs);
  if (r.erro) {
    console.log(`${c.rotulo}\n  ERRO: ${r.erro}\n`);
    resumo.push({ caso: c.rotulo, erro: r.erro });
    continue;
  }
  const a = avaliar(r.reply);
  const ok = a.nome > 0 && a.emojis > 0 && !a.romance && !a.robotico && !a.infantil && !a.markdown;
  console.log(c.rotulo);
  console.log(`  "${r.reply.replace(/\n/g, ' ').slice(0, 200)}"`);
  console.log(`  nome=${a.nome} emojis=${a.emojis} tamanho=${a.tamanho} ${r.ms}ms -> ${ok ? 'OK' : '***'}`);
  console.log(`  romance=${a.romance} robotico=${a.robotico} infantil=${a.infantil} markdown=${a.markdown}`);
  console.log('');
  resumo.push({ caso: c.rotulo, ...a, ms: r.ms, ok });
}

console.log('\n=== RESUMO ===');
const ok = resumo.filter((r) => !r.erro);
const media = Math.round(ok.reduce((a, r) => a + r.ms, 0) / (ok.length || 1));
const problemas = ok.filter((r) => r.romance || r.robotico || r.infantil || r.markdown || (r.nome === 0 && r.emojis === 0));
console.log(`respondeu: ${ok.length}/${CENARIOS.length}`);
console.log(`citou Anna: ${ok.filter((r) => r.nome > 0).length}/${ok.length}`);
console.log(`usou emoji: ${ok.filter((r) => r.emojis > 0).length}/${ok.length}`);
console.log(`media de emojis: ${(ok.reduce((a, r) => a + r.emojis, 0) / (ok.length || 1)).toFixed(1)}`);
console.log(`media de tempo: ${media}ms`);
console.log(`problemas: ${problemas.length}${problemas.length ? ' -> ' + problemas.map((p) => p.caso).join(' | ') : ''}`);
process.exit(problemas.length === 0 ? 0 : 1);
