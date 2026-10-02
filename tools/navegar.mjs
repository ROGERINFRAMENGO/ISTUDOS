// ============================================================
// FINAL POLISH DEFINITIVO — automacao de navegador via CDP.
//
//   node tools/navegar.mjs <url> [--shots] [--mobile] [--passos=a,b,c]
//
// O MCP do Chrome esta com o WebSocket morto e nao reconecta, mas o
// proprio Chrome expoe a porta 9222. Este script fala CDP
// diretamente pelo WebSocket nativo do Node 22+ — sem dependencia.
//
// O que ele FAZ, e que e o que interessa:
//
//  - abre a pagina;
//  - COLETA console.error e excecoes nao tratadas (e o que produziu
//    a tela roxa: um ReferenceError na hora do render);
//  - confere se o app montou de verdade, olhando o DOM;
//  - tira capturas de tela;
//  - navega pelas telas.
//
// Um script que so diz "abriu" nao serve: aqui a verificacao e
// "quantos erros de runtime existem e o que a pagina mostra".
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const URL_ALVO = process.argv[2];
if (!URL_ALVO) { console.error('Uso: node tools/navegar.mjs <url> [--shots] [--mobile]'); process.exit(1); }

const QUER_SHOTS = process.argv.includes('--shots');
const MOBILE = process.argv.includes('--mobile');
const DIR_SHOTS = '.tmp-shots';
fs.mkdirSync(DIR_SHOTS, { recursive: true });

// ---------- CDP ----------
async function alvos() {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  const lista = await r.json();
  const pagina = lista.find((t) => t.type === 'page');
  if (!pagina) throw new Error('Nenhuma aba aberta no Chrome.');
  return pagina.webSocketDebuggerUrl;
}

function conectar(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pendentes = new Map();
    const ouvintes = [];
    ws.onopen = () => resolve({
      enviar(method, params = {}) {
        const meu = ++id;
        return new Promise((ok, falha) => {
          pendentes.set(meu, { ok, falha });
          ws.send(JSON.stringify({ id: meu, method, params }));
        });
      },
      aoEvento(fn) { ouvintes.push(fn); },
      fechar() { ws.close(); },
    });
    ws.onerror = (e) => reject(new Error(`WebSocket: ${e.message ?? 'falhou'}`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) {
        const { ok, falha } = pendentes.get(msg.id);
        pendentes.delete(msg.id);
        msg.error ? falha(new Error(msg.error.message)) : ok(msg.result);
      } else if (msg.method) {
        for (const fn of ouvintes) fn(msg);
      }
    };
  });
}

const cdp = await conectar(await alvos());
const erros = [];
const avisos = [];

await cdp.enviar('Runtime.enable');
await cdp.enviar('Log.enable');
await cdp.enviar('Page.enable');
await cdp.enviar('Network.enable');

cdp.aoEvento((m) => {
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    erros.push(`EXCECAO: ${d.exception?.description ?? d.text}`.slice(0, 300));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    erros.push(`CONSOLE.ERROR: ${(m.params.args ?? []).map((a) => a.description ?? a.value ?? '').join(' ')}`.slice(0, 300));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    erros.push(`LOG: ${m.params.entry.text}`.slice(0, 300));
  }
  if (m.method === 'Network.loadingFailed') {
    avisos.push(`REDE falhou: ${m.params.errorText} (${m.params.type})`);
  }
});

// Viewport antes de navegar, para o modo mobile nao chegar tarde.
await cdp.enviar('Emulation.setDeviceMetricsOverride', MOBILE
  ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

console.log(`abrindo ${URL_ALVO} (${MOBILE ? 'mobile 390x844' : 'desktop 1440x900'})`);
await cdp.enviar('Page.navigate', { url: URL_ALVO });
await new Promise((r) => setTimeout(r, 4500));

async function avaliar(expressao) {
  const r = await cdp.enviar('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

async function foto(nome) {
  if (!QUER_SHOTS) return;
  const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const arq = path.join(DIR_SHOTS, `${nome}.png`);
  fs.writeFileSync(arq, Buffer.from(data, 'base64'));
  console.log(`  captura: ${arq}`);
}

// ---------- verificacao de montagem ----------
// Criterio honesto: a tela esta CHEIA quando existe conteudo
// aproveitavel. A tela de login nao usa <main> — usa .auth-screen —
// entao pedir <main> daria falso negativo. O que define "quebrado"
// e o oposto do sintoma da tela roxa: raiz do React vazia, sem
// texto e sem botao.
const estado = await avaliar(`(() => {
  const texto = (document.body.innerText || '').trim();
  const botoes = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
  const inputs = [...document.querySelectorAll('input')].map(i => i.type + ':' + (i.id || i.name || i.placeholder || ''));
  return {
    texto,
    botoes,
    inputs,
    altura: document.body.scrollHeight,
    fundo: getComputedStyle(document.body).backgroundColor,
    filhosRaiz: document.getElementById('root')?.children.length ?? -1,
  };
})()`);

console.log('\n--- ESTADO INICIAL ---');
console.log(`  filhos na raiz React : ${estado.filhosRaiz}`);
console.log(`  altura               : ${estado.altura}px`);
console.log(`  fundo                : ${estado.fundo}`);
console.log(`  botoes               : ${estado.botoes.slice(0, 8).join(' | ') || '(nenhum)'}`);
console.log(`  campos               : ${estado.inputs.join(', ') || '(nenhum)'}`);
console.log(`  texto                : ${estado.texto.replace(/\s+/g, ' ').slice(0, 200)}`);

const quebrada = estado.filhosRaiz === 0 || (estado.texto.length < 20 && estado.botoes.length === 0);
console.log(`\n  TELA VAZIA? ${quebrada ? 'SIM — FALHOU' : 'NAO — app montou'}`);

await foto('01-inicial');

const PASSOS = process.argv.find(a => a.startsWith('--passos='))?.split('=')[1]
  ?.split(',') ?? ['Cronograma', 'Minhas aulas', 'Simulados', 'Tutor IA', 'Configurações'];

async function irPara(rotulo) {
  return avaliar(`(() => {
    const b = [...document.querySelectorAll('nav button, .menu button, button')]
      .find(x => x.textContent.trim() === ${JSON.stringify(rotulo)});
    if (!b) return 'botao nao encontrado';
    b.click();
    return 'ok';
  })()`);
}

if (!quebrada && !estado.inputs.length) {
  console.log('\n--- PERCORRENDO TELAS ---');
  for (const passo of PASSOS) {
    await irPara(passo);
    await new Promise((s) => setTimeout(s, 2600));
    const info = await avaliar(`(() => {
      const t = (document.body.innerText || '').replace(/\\s+/g, ' ');
      return {
        altura: document.body.scrollHeight,
        filhos: document.getElementById('root')?.children.length ?? -1,
        vazio: t.trim().length < 30,
        vazando: document.documentElement.scrollWidth > window.innerWidth + 2,
        larguraDoc: document.documentElement.scrollWidth,
        janela: window.innerWidth,
        texto: t.slice(0, 120),
      };
    })()`);
    const problemas = [];
    if (info.filhos === 0) problemas.push('RAIZ VAZIA');
    if (info.vazio) problemas.push('SEM CONTEUDO');
    if (info.vazando) problemas.push(`OVERFLOW ${info.larguraDoc}>${info.janela}`);
    console.log(`  ${problemas.length ? 'X' : 'ok'} ${passo.padEnd(16)} ${String(info.altura).padStart(5)}px  ${problemas.join(' / ')}`);
    console.log(`     ${info.texto}`);
    await foto(`${String(PASSOS.indexOf(passo) + 1).padStart(2, '0')}-${rotulo(passo)}`);
  }
}

function rotulo(s) { return s.toLowerCase().replace(/\s+/g, '-'); }

// ---------- exercicio funcional: criar simulado e responder ----------
if (!quebrada && !estado.inputs.length) {
  await irPara('Simulados');
  await new Promise((s) => setTimeout(s, 2000));

  const criou = await avaliar(`(() => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const titulo = document.querySelector('.sim-field-full input[type="text"]');
    const n = document.querySelector('input[type="number"]');
    if (!titulo || !n) return 'campos nao encontrados';
    set.call(titulo, 'Prova de fumaca'); titulo.dispatchEvent(new Event('input', { bubbles: true }));
    set.call(n, '4'); n.dispatchEvent(new Event('input', { bubbles: true }));
    return 'preenchido';
  })()`);
  console.log(`\n--- CRIANDO SIMULADO ---`);
  console.log(`  ${criou}`);
  await new Promise((s) => setTimeout(s, 500));
  await avaliar(`[...document.querySelectorAll('button')].find(b => /Criar simulado/i.test(b.textContent))?.click()`);
  await new Promise((s) => setTimeout(s, 2500));

  const lista = await avaliar(`({
    cartoes: document.querySelectorAll('.sim-card').length,
    chips: [...document.querySelectorAll('.sim-chip')].map(c => c.textContent.trim()),
    titulo: document.querySelector('.sim-item-title')?.textContent ?? null,
    vazio: Boolean(document.querySelector('.sim-empty')),
  })`);
  console.log(`  cartoes : ${lista.cartoes}`);
  console.log(`  titulo  : ${lista.titulo}`);
  console.log(`  chips   : ${lista.chips.join(' | ')}`);
  console.log(`  vazio   : ${lista.vazio}`);
  await foto('06-simulado-criado');

  // abrir a prova
  const abriu = await avaliar(`(() => {
    const b = [...document.querySelectorAll('.sim-card button')].find(x => /Iniciar/i.test(x.textContent));
    if (!b) return false; b.click(); return true;
  })()`);
  console.log(`\n--- ABRINDO A PROVA ---`);
  console.log(`  abriu: ${abriu}`);
  await new Promise((s) => setTimeout(s, 2500));
  const prova = await avaliar(`({
    head: document.querySelector('.sim-progress-head')?.innerText.replace(/\\s+/g,' ') ?? null,
    barra: document.querySelector('.sim-progress > i')?.style.width ?? null,
    questao: document.querySelector('.sim-question h4')?.textContent ?? null,
    opcoes: document.querySelectorAll('.quiz-option').length,
    vazando: document.documentElement.scrollWidth > window.innerWidth + 2,
  })`);
  console.log(`  cabecalho : ${prova.head}`);
  console.log(`  barra     : ${prova.barra}`);
  console.log(`  questao   : ${(prova.questao || '').slice(0, 80)}`);
  console.log(`  opcoes    : ${prova.opcoes}`);
  console.log(`  overflow  : ${prova.vazando}`);
  await foto('07-prova');
}

console.log(`\n--- ERROS DE RUNTIME (${erros.length}) ---`);
if (!quebrada && estado.inputs.length) {
  console.log('\n--- ENTRANDO (senha de dispositivo) ---');
  await avaliar(`(() => {
    const i = document.querySelector('input[type="password"], input:not([type])');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'teamo');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  const clicou = await avaliar(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /entrar/i.test(x.textContent));
    if (b) { b.click(); return 'botao'; }
    const f = document.querySelector('form');
    if (f) { f.requestSubmit(); return 'form'; }
    return 'nada';
  })()`);
  console.log(`  acao: ${clicou}`);
  await new Promise((r) => setTimeout(r, 4500));

  const depois = await avaliar(`({
    texto: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 300),
    menu: [...document.querySelectorAll('nav button')].map(b => b.textContent.trim()),
    altura: document.body.scrollHeight,
    filhos: document.getElementById('root')?.children.length ?? -1,
  })`);
  console.log(`  filhos na raiz : ${depois.filhos}`);
  console.log(`  altura        : ${depois.altura}px`);
  console.log(`  menu          : ${depois.menu.join(' | ') || '(sem menu)'}`);
  console.log(`  texto         : ${depois.texto}`);
  await foto('02-dashboard');
}

console.log(`\n--- ERROS DE RUNTIME (${erros.length}) ---`);
if (erros.length === 0) console.log('  nenhum');
else [...new Set(erros)].slice(0, 10).forEach((e) => console.log(`  ${e}`));

if (avisos.length) {
  console.log(`\n--- REDE (${avisos.length}) ---`);
  [...new Set(avisos)].slice(0, 6).forEach((e) => console.log(`  ${e}`));
}

cdp.fechar();
process.exit(quebrada || erros.length ? 1 : 0);