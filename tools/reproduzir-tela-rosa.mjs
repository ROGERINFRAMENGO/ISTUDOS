// ============================================================
// REPRODUZ A TELA ROSA E CAPTURA O ERRO REAL
// ------------------------------------------------------------
//   node tools/reproduzir-tela-rosa.mjs [--porta=9230] [--url=...]
//
// Faz o caminho que a estudante faz: entra com a senha, abre o
// Dashboard, clica em "Comecar" e, se aparecer, entra na aula. A cada
// passo, recolhe console.error e excecoes nao tratadas COM STACK.
//
// O ponto e nao adivinhar a causa pelo codigo: a tela rosa ja esteve
// ligada a ReferenceError na hora do render, e isso so aparece em
// execucao.
// ============================================================

const arg = (nome, padrao) => {
  const achado = process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=').slice(1).join('=') : padrao;
};
const PORTA = Number(arg('porta', '9230'));
const URL_BASE = arg('url', 'https://rogerinframengo.github.io/ISTUDOS/');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const problemas = [];
const registrar = (onde, texto) => {
  if (!texto) return;
  const limpo = String(texto).trim();
  if (!limpo) return;
  // Erro de rede 401/404 do Supabase nao e a tela rosa: e esperado.
  if (/status of (401|404)/.test(limpo)) return;
  problemas.push({ onde, texto: limpo.slice(0, 600) });
};

const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
const pagina = lista.find((p) => p.type === 'page');
if (!pagina) { console.log('Nao ha pagina no Chrome.'); process.exit(1); }

const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pendentes = new Map();
ws.onmessage = (evento) => {
  const msg = JSON.parse(evento.data);
  if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg.result); pendentes.delete(msg.id); return; }
  // Console e excecoes chegam como evento.
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
    registrar('console.error', (msg.params.args ?? []).map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params?.exceptionDetails ?? {};
    registrar('exception', `${d.text} ${d.exception?.description ?? ''}`);
  }
};
const cdp = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  pendentes.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const avaliar = async (expressao) => {
  const r = await cdp('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) registrar('evaluate', r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r?.result?.value;
};

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Page.navigate', { url: URL_BASE });
await dormir(4000);

// ---- 1. entrar com a senha -------------------------------------
await avaliar(`(() => {
  const c = document.querySelector('input[type=password]');
  if (!c) return 'sem campo de senha';
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(c,'teamo');
  c.dispatchEvent(new Event('input',{bubbles:true}));
  const f = c.closest('form'); f.requestSubmit();
  return 'ok';
})()`);
await dormir(4000);
console.log('1. apos entrar:', String(await avaliar(`document.body.innerText.slice(0,70)`)).replace(/\s+/g,' '));

// ---- 2. clicar em "Comecar" -------------------------------------
const comecou = await avaliar(`(() => {
  // Compara o texto SEM acento: o literal com cedilha nao sobrevive as
  // varias codificacoes entre o editor e o Node, e o teste acabaria
  // clicando em nada e "passando" sem medir nada.
  const alvos = [...document.querySelectorAll('button, a, [role=button]')];
  const b = alvos.find(el => {
    const t = (el.innerText || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.trim().startsWith('comecar');
  });
  if (!b) return 'sem botao Comecar';
  b.click();
  return 'clicou';
})()`);
await dormir(6000);
console.log('2. apos Comecar:', comecou);

// ---- 3. medir a tela --------------------------------------------
const estado = await avaliar(`(() => {
  const root = document.getElementById('root');
  const html = root ? root.innerHTML : '';
  // A tela rosa e o error boundary do React pintando o erro.
  const temVermelho = /rgb\\(\\s*(2[0-9]{2}|1[5-9][0-9])\\s*,\\s*(1[0-9]{2}|[0-9]{1,2})\\s*,\\s*(1[3-9][0-9]|[0-9]{1,2})/.test(
    getComputedStyle(document.body).backgroundColor + ' ' + html.slice(0, 4000)
  );
  const imgsQuebradas = [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src);
  return JSON.stringify({
    filhosRaiz: root ? root.children.length : -1,
    altura: document.body.scrollHeight,
    fundo: getComputedStyle(document.body).backgroundColor,
    texto: (document.body.innerText || '').replace(/\\s+/g,' ').slice(0, 260),
    htmlVazio: html.trim().length < 40,
    temVermelho,
    imgsQuebradas,
  });
})()`);
const s = JSON.parse(estado || '{}');
console.log('\n--- estado da tela apos "Comecar" ---');
console.log('  filhos na raiz :', s.filhosRaiz);
console.log('  altura         :', s.altura, 'px');
console.log('  fundo          :', s.fundo);
console.log('  html vazio     :', s.htmlVazio);
console.log('  imgs quebradas :', s.imgsQuebradas.length);
console.log('  texto          :', s.texto);

// ---- 4. erros coletados ----------------------------------------
console.log('\n--- erros de runtime capturados ---');
if (!problemas.length) {
  console.log('  NENHUM');
} else {
  for (const p of problemas) console.log(`  [${p.onde}] ${p.texto}`);
}

console.log(`\n${problemas.length === 0 ? 'SEM ERRO DE RUNTIME' : 'ERRO REPRODUZIDO'}`);
process.exit(0);