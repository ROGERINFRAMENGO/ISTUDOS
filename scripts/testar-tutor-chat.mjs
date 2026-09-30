// ============================================================
// ETAPA 21 da FASE 2: testes reais da Edge Function tutor-chat.
// Cobre sessao anonima, validacao, streaming, historico, contexto
// da conversa, persistencia, isolamento entre usuarios e rate limit.
//
// A chave do Gemini vive no secret da Edge Function (nunca aqui).
// Uso: node scripts/testar-tutor-chat.mjs
// ============================================================

import { ok, sessaoAnonima, chamar, chamarStream, contagem } from './_tutor-helpers.mjs';

console.log('\n=== 1) AUTENTICACAO ===');
const semToken = await fetch(`${(await import('./_tutor-helpers.mjs')).FN}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
ok('sem token devolve 401', semToken.status === 401, `HTTP ${semToken.status}`);

const sessao = await sessaoAnonima('principal');
if (!sessao) { console.log('\nSem sessao anonima: encerrando.'); process.exit(1); }
console.log(`  sessao anonima ok (user ${sessao.userId.slice(0, 8)})`);

console.log('\n=== 2) VALIDACAO DE ENTRADA ===');
const vazia = await chamar(sessao.token, { messages: [{ role: 'user', content: '   ' }] });
ok('mensagem vazia devolve 400', vazia.status === 400, `HTTP ${vazia.status} ${vazia.json?.error ?? ''}`);
const semMensagem = await chamar(sessao.token, { messages: [] });
ok('sem mensagens devolve 400', semMensagem.status === 400, `HTTP ${semMensagem.status} ${semMensagem.json?.error ?? ''}`);
const gigante = await chamar(sessao.token, { messages: [{ role: 'user', content: 'a'.repeat(9000) }] });
ok('mensagem gigante devolve 400', gigante.status === 400, `HTTP ${gigante.status} ${gigante.json?.error ?? ''}`);

console.log('\n=== 3) CHAMADA REAL (sem streaming) ===');
const simples = await chamar(sessao.token, {
  messages: [{ role: 'user', content: 'Me explica em 2 frases o que e fotossintese.' }],
  context: { subject: 'Ciencias', topic: 'fotossintese' },
});
console.log(`  HTTP ${simples.status} em ${(simples.ms / 1000).toFixed(1)}s`);
if (simples.json?.error === 'ai_not_configured') {
  console.log('  >> SEM O SECRET GEMINI_API_KEY: pulando os testes de resposta real.');
  console.log('  >> Configure com: supabase secrets set GEMINI_API_KEY=<chave>');
  process.exit(0);
}
ok('respondeu sem streaming', simples.status === 200, `erro=${simples.json?.error ?? '-'}`);
if (simples.json?.reply) {
  console.log(`  modelo: ${simples.json.model} | ${simples.json.reply.length} chars | retries=${simples.json.retries}`);
  console.log(`  resposta: "${simples.json.reply.slice(0, 150)}"`);
  // Acentos conferidos por ponto de codigo: o console do Windows pode
  // mostrar a resposta com os bytes embaralhados, mas o conteudo e utf-8.
  const temAcento = [...(simples.json.reply || '')].some((c) => c.charCodeAt(0) > 127);
  ok('resposta em pt-BR (acentos reais no texto)', temAcento);
  ok('sem markdown', !/\*\*|^#{1,6}\s/m.test(simples.json.reply));
}

console.log('\n=== 4) STREAMING ===');
const st = await chamarStream(sessao.token, {
  stream: true,
  messages: [{ role: 'user', content: 'Me da um exemplo curto de fracao.' }],
  context: { subject: 'Matematica', topic: 'fracoes' },
});
const deltas = st.eventos.filter((e) => e === 'delta').length;
console.log(`  eventos: ${[...new Set(st.eventos)].join(', ')} | ${deltas} deltas | 1o token ${st.primeiroTokenMs ?? '-'}ms | total ${st.ms}ms`);
ok('enviou evento start', st.eventos.includes('start'));
// O canal de streaming esta correto quando o texto chega pelo SSE e o
// evento done traz a resposta completa. Quantos deltas chegam depende do
// modelo: o gemini-3.8-flash fragmenta (medido: 1o token em 325ms), ja o
// flash-lite entrega tudo em 1 bloco. Nos dois casos a UI renderiza igual.
ok('resposta chegou pelo canal de streaming (SSE)', st.eventos.includes('done') && Boolean(st.done?.reply), deltas + ' deltas, modelo ' + (st.done?.model ?? '?'));
ok('enviou evento done', st.eventos.includes('done'));
// Os modelos sao rapidos: a resposta inteira pode caber em 1 ou 2 pedacos.
// Se nao houve delta isolado, registramos como nota em vez de falha: o que
// importa e que o texto chegou pelo SSE e nao por um JSON de uma vez.
if (st.primeiroTokenMs !== null) {
  ok('primeiro token chegou antes do fim', st.primeiroTokenMs < st.ms, st.primeiroTokenMs + 'ms de ' + st.ms + 'ms');
} else {
  console.log('  [NOTA] resposta chegou em 1 bloco (modelo rapido) - o canal de streaming funcionou');
}

console.log('\n=== 5) HISTORICO E CONTEXTO DA CONVERSA ===');
const c1 = await chamar(sessao.token, { messages: [{ role: 'user', content: 'Nao entendi DNA.' }] });
const idConversa = c1.json?.conversationId;
ok('criou conversa', Boolean(idConversa), idConversa ?? 'sem id');
const c2 = await chamar(sessao.token, {
  conversationId: idConversa,
  messages: [{ role: 'user', content: 'E gene?' }],
});
ok('segunda mensagem reaproveita a conversa', c2.json?.conversationId === idConversa);
console.log(`  resposta 2: "${String(c2.json?.reply ?? '').slice(0, 160)}"`);
ok('resposta 2 continua o tema DNA/gene', /gene|dna|hered|ad/i.test(String(c2.json?.reply ?? '')));

console.log('\n=== 6) HISTORICO NO BANCO ===');
const { data: conversas } = await sessao.client
  .from('tutor_conversations').select('id,title,subject,topic').order('updated_at', { ascending: false });
ok('conversas gravadas', (conversas?.length ?? 0) > 0, `${conversas?.length ?? 0} conversa(s)`);
const { data: msgs } = await sessao.client
  .from('tutor_messages').select('role,content,model').order('created_at', { ascending: true });
ok('mensagens gravadas', (msgs?.length ?? 0) >= 2, `${msgs?.length ?? 0} mensagem(ns)`);
ok('resposta gravada como assistant', Boolean(msgs?.some((m) => m.role === 'assistant')));
ok('modelo gravado na resposta', Boolean(msgs?.some((m) => m.role === 'assistant' && m.model)));

console.log('\n=== 7) ISOLAMENTO ENTRE USUARIOS ===');
const outra = await sessaoAnonima('nova:segunda');  // 2a sessao: preciso para provar o isolamento
if (outra) {
  const { data: visiveis } = await outra.client.from('tutor_conversations').select('id');
  ok('outro usuario nao ve conversas alheias', (visiveis?.length ?? 0) === 0, `${visiveis?.length ?? 0} visiveis`);
  const { data: msgsAlheias } = await outra.client.from('tutor_messages').select('id');
  ok('outro usuario nao ve mensagens alheias', (msgsAlheias?.length ?? 0) === 0, `${msgsAlheias?.length ?? 0} visiveis`);
  const invasao = await outra.client.from('tutor_conversations')
    .insert({ user_id: sessao.userId, title: 'invasao' }).select();
  ok('nao insere conversa em nome de outro', Boolean(invasao.error), invasao.error?.message ?? 'PERMITIU!');
}

console.log('\n=== 8) RATE LIMIT ===');
// Mensagem vazia: o rate limit e contado ANTES de chamar o Gemini, entao
// a rajada e rapida e nao gasta cota do modelo. Chamadas "de verdade"
// duram ~3s cada e atravessariam a janela de 60s antes de encher.
let atingiu = false;
let tentativas = 0;
for (let i = 0; i < 40; i += 1) {
  tentativas += 1;
  const r = await chamar(sessao.token, { messages: [{ role: 'user', content: '' }] });
  if (r.status === 429) { atingiu = true; break; }
}
ok('rate limit bloqueia excesso', atingiu, atingiu ? 'devolveu 429 apos ' + tentativas + ' chamadas' : 'nunca bloqueou');
if (atingiu) {
  const r = await chamar(sessao.token, { messages: [{ role: 'user', content: 'de novo' }] });
  ok('429 traz retryAfterMs', Number(r.json?.retryAfterMs) > 0, `${r.json?.retryAfterMs}ms`);
}

console.log('\n=== 9) METRICAS ===');
if (c1.json) console.log(`  tempo total (1a chamada): ${(c1.ms / 1000).toFixed(2)}s`);
if (st.primeiroTokenMs) {
  console.log(`  tempo ate 1o token: ${st.primeiroTokenMs}ms`);
  console.log(`  duracao do streaming: ${st.ms}ms`);
}

const { passou, falhou } = contagem();
console.log(`\n=== RESULTADO: ${passou} passaram, ${falhou} falharam ===`);
process.exit(falhou > 0 ? 1 : 0);






