// ============================================================
// CONVERSA REAL COM A TUTORA
// ------------------------------------------------------------
//   node tools/testar-tutora.mjs [--porta=9230] [--url=...]
//
// Nao testa a existencia do prompt: testa a RESPOSTA. A persona pode
// estar no system prompt e mesmo assim nao aparecer, se o modelo
// ignora a instrucao, se o contexto sobrescreve ou se a funcao
// implantada esta antiga. Aqui a aluna fala e a gente le o que volta.
// ============================================================

const arg = (n, p) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : p;
};
const PORTA = Number(arg('porta', '9230'));
const URL_BASE = arg('url', 'http://localhost:4185/ISTUDOS/');
const SENHA = 'teamo';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
const pagina = lista.find((p) => p.type === 'page');
if (!pagina) { console.log('Sem pagina no Chrome.'); process.exit(1); }

const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
};
const cdp = (method, params = {}) => new Promise((res) => {
  const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
const avaliar = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

await cdp('Page.enable');
await cdp('Page.navigate', { url: URL_BASE });
await dormir(3500);

// Entra.
await avaliar(`(() => {
  const c = document.querySelector('input[type=password]');
  if (!c) return 'sem campo';
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(c, ${JSON.stringify(SENHA)});
  c.dispatchEvent(new Event('input',{bubbles:true}));
  c.closest('form').requestSubmit();
  return 'ok';
})()`);
await dormir(3500);

// Abre o Tutor IA.
const abriu = await avaliar(`(() => {
  const semAcento = (t) => (t||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
  const b = [...document.querySelectorAll('button,a,[role=button]')].find(el => semAcento(el.innerText).includes('tutor'));
  if (!b) return 'sem botao Tutor';
  b.click();
  return 'clicou';
})()`);
console.log('Tutor:', abriu);
await dormir(2500);

// Envia uma mensagem e espera a resposta da tutora aparecer.
async function perguntar(texto, esperaMs = 26000) {
  const enviado = await avaliar(`(() => {
    const semAcento = (t) => (t||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
    const campo = [...document.querySelectorAll('textarea, input[type=text]')].find(el => semAcento(el.placeholder || '').includes('pergunte') || semAcento(el.getAttribute('aria-label') || '').includes('pergunte'));
    const alvo = campo || [...document.querySelectorAll('textarea')][0] || [...document.querySelectorAll('input[type=text]')][0];
    if (!alvo) return 'sem campo de mensagem';
    const proto = alvo.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(alvo, ${JSON.stringify(texto)});
    alvo.dispatchEvent(new Event('input',{bubbles:true}));
    alvo.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    return 'enviou';
  })()`);

  await dormir(esperaMs);

  const resposta = await avaliar(`(() => {
    // Seletor medido no DOM real do TutorChat: a bolha da tutora e
    // .chat-message.assistant .chat-bubble. Pegar por texto solto
    // trazia os botoes "Enviar"/"Limpar" e dava falso negativo.
    const bolhas = [...document.querySelectorAll('.chat-message.assistant .chat-bubble')];
    if (!bolhas.length) return '(sem bolha da tutora)';
    return bolhas[bolhas.length - 1].innerText || '(vazia)';
  })()`);
  return { enviado, resposta };
}

const casos = [
  ['Oi', 'saudacao'],
  ['Nao entendi fracoes', 'didatica'],
  ['Qual a capital da Franca?', 'fora da materia'],
];

for (const [msg, rotulo] of casos) {
  const { enviado, resposta } = await perguntar(msg);
  const temAnna = /\bAnna\b/i.test(resposta);
  const temEmoji = /\p{Extended_Pictographic}/u.test(resposta);
  console.log(`\n=== ${rotulo}: "${msg}" ===`);
  console.log(`  envio: ${enviado}`);
  console.log(`  Anna : ${temAnna ? 'SIM' : 'NAO'}`);
  console.log(`  emoji: ${temEmoji ? 'SIM' : 'NAO'}`);
  console.log(`  resposta: ${resposta.replace(/\s+/g, ' ').slice(0, 420)}`);
}

process.exit(0);