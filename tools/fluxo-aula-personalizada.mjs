// ============================================================
// FLUXO COMPLETO DE AULA PERSONALIZADA EM PRODUCAO
// ------------------------------------------------------------
// Cria, confere a resposta da funcao no Network, recarrega para
// provar persistencia e exclui no fim.
//
// Cada etapa imprime o que observou. Um passo que nao roda e um
// passo que NAO foi validado.
// ============================================================

const arg = (n, p) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : p;
};
const PORTA = Number(arg('porta', '9240'));
const URL_BASE = arg('url', 'https://rogerinframengo.github.io/ISTUDOS/');
const TEMA = arg('tema', 'Fotossintese');
const PROPOSTA = arg('proposta', 'Explique fotossintese: a equacao da fotossintese, o papel da clorofila, da luz e da glicose.');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, rotulo, detalhe = '') => {
  if (cond) console.log(`  OK    | ${rotulo}${detalhe ? ` :: ${detalhe}` : ''}`);
  else { falhas += 1; console.log(`  FALHA | ${rotulo}${detalhe ? ` :: ${detalhe}` : ''}`); }
};

const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
const pagina = lista.find((p) => p.type === 'page');
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pend = new Map();
const chamadas = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Network.responseReceived') {
    const u = m.params.response.url;
    if (/functions\/v1\//.test(u)) chamadas.push({ fn: u.split('/').pop().split('?')[0], status: m.params.response.status });
  }
};
const cdp = (method, params = {}) => new Promise((res) => {
  const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};
const clicar = (txt) => ev(`(() => {
  const sem = (t) => (t||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim();
  const alvo = [...document.querySelectorAll('button,a,[role=button]')].find(el => sem(el.innerText).includes(sem(${JSON.stringify(txt)})));
  if (!alvo) return 'nao achei: ' + ${JSON.stringify(txt)};
  alvo.click(); return 'clicou';
})()`);
const digitar = (sel, valor) => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return 'sem campo';
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(valor)});
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return 'digitou';
})()`);
const tela = () => ev(`(document.body.innerText||'').replace(/\\s+/g,' ')`);
const tem = (re) => ev(`${re}.test(document.body.innerText||'')`);

await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.enable');
await cdp('Page.navigate', { url: URL_BASE }); await dormir(3500);

console.log('\n== 1. login ==');
await digitar('input[type=password]', 'teamo');
await ev(`document.querySelector('input[type=password]').closest('form').requestSubmit()`);
await dormir(4000);
ok(await tem('Estudo de hoje'), 'entrou no app');

console.log('\n== 2. a frase antiga nao aparece ==');
ok(!(await tem('Criar conta')), 'sem "Criar conta"');
ok(!(await tem('entrarEOuCriar')), 'sem fluxo de e-mail');
ok(!(await tem('picsum')), 'sem picsum');

console.log('\n== 3. criar aula personalizada ==');
await clicar('Minhas aulas'); await dormir(2000);
ok(await ev(`Boolean(document.querySelector('.custom-form'))`), 'formulario visivel');
await digitar('#custom-request', PROPOSTA); await dormir(300);
await ev(`document.querySelector('.custom-form').requestSubmit()`);

let gerou = false;
for (let i = 0; i < 36; i += 1) {
  await dormir(5000);
  if (await tem('Fotoss|clorofila|glicose')) { gerou = true; break; }
}
console.log('  respostas:', JSON.stringify(chamadas.filter((c) => /lesson|quiz/.test(c.fn))));
ok(await tem('clorofila'), 'conteudo sobre fotossintese na tela');

console.log('\n== 4. Network: resposta real ==');
const gl = chamadas.filter((c) => c.fn === 'generate-lesson');
ok(gl.length > 0 && gl[gl.length - 1].status === 200, 'generate-lesson 200 no envio',
   JSON.stringify(gl.map((c) => c.status)));

console.log('\n== 5. persistencia apos refresh ==');
await cdp('Page.reload'); await dormir(4500);
await clicar('Minhas aulas'); await dormir(2500);
ok(await tem('clorofila|Fotoss'), 'aula voltou depois do refresh');

console.log('\n== 6. imagens ==');
const imgs = await ev(`(() => {
  const todas = [...document.querySelectorAll('img')];
  return JSON.stringify({
    total: todas.length,
    ruins: todas.filter(i => /picsum|COLE|placeholder/i.test(i.src)).map(i => i.src),
    quebradas: todas.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
  });
})()`);
const im = JSON.parse(imgs);
ok(im.ruins.length === 0, 'nenhuma imagem aleatoria/placeholder', im.ruins.join(', '));
ok(im.quebradas.length === 0, 'nenhuma imagem quebrada', im.quebradas.join(', '));
console.log(`  (total de <img>: ${im.total})`);

console.log('\n== 7. abrir a aula salva ==');
console.log('  ' + await clicar('Abrir'));
await dormir(4000);
const abriu = await ev(`document.body.innerText.length > 400 && !/Escreva o que voce quer aprender/.test(document.body.innerText)`);
ok(abriu, 'a aula abriu com conteudo');
ok(await tem('clorofila|glicose|Fotoss'), 'conteudo da aula na tela');

console.log('\n== 8. simulado ==');
console.log('  ' + await clicar('Simulados'));
await dormir(2500);
ok(await ev(`/Simulad/i.test(document.body.innerText)`), 'painel de simulados abriu');

console.log('\n== 9. excluir ==');
await clicar('Minhas aulas'); await dormir(2000);
const temBotaoExcluir = await ev(`Boolean([...document.querySelectorAll('button')].find(b => /excluir|remover|apagar/i.test(b.innerText)))`);
ok(temBotaoExcluir, 'existe botao de excluir na aula salva');
const e1 = await clicar('Excluir'); await dormir(1200);
const e2 = await clicar('Excluir'); console.log(`  excluir: ${e1} / confirmar: ${e2}`);
await dormir(3000);
ok(!(await tem('Fotossintese: Como a Luz')), 'aula removida da biblioteca');

console.log(`\n${falhas === 0 ? 'CONFORME' : 'DIVERGENTE'} · ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);