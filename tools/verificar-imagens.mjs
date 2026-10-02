// ============================================================
// VERIFICA NO NAVEGADOR: NENHUMA IMAGEM QUEBRADA OU PLACEHOLDER
// ------------------------------------------------------------
//   node tools/verificar-imagens.mjs [--porta=9222]
//
// Faz a pergunta que o grep no bundle nao responde: o que REALMENTE
// chega a tela. O bundle ainda contem os marcadores COLE_AQUI (sao
// dados em src/data/lessons.js, o template do autor) -- o que importa
// e se algum deles vira <img> ou <iframe>.
//
// Entrar pela senha e navegar ate a aula, porque so renderizando a
// pagina o React monta os <img>.
// ============================================================

const PORTA = Number((process.argv.find((a) => a.startsWith('--porta=')) ?? '').split('=')[1] || 9222);
// SÃ³ o primeiro argumento que NAO Ã© flag e NAO parece um executÃ¡vel.
// Sem este filtro o proprio `node` e o caminho do node.exe entram
// como URL e o teste mede uma pagina em branco, dando um "CONFORME"
// que nao mediu nada.
const ALVO = process.argv.slice(2).find((a) => !a.startsWith('--') && !/\.exe$/i.test(a) && !/node$/i.test(a))
  || 'http://localhost:4180/ISTUDOS/';
const SENHA = 'teamo';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let falhas = 0;
const ok = (cond, rotulo, detalhe = '') => {
  if (cond) console.log(`  OK    | ${rotulo}${detalhe ? ` (${detalhe})` : ''}`);
  else { falhas += 1; console.log(`  FALHA | ${rotulo}${detalhe ? ` (${detalhe})` : ''}`); }
};

const lista = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
const pagina = lista.find((p) => p.type === 'page');
if (!pagina) { console.log('sem pagina no Chrome'); process.exit(1); }

const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pendentes = new Map();
ws.onmessage = (evento) => {
  const msg = JSON.parse(evento.data);
  if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg.result); pendentes.delete(msg.id); }
};
const cdp = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  pendentes.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});

const avaliar = async (expressao) => {
  const r = await cdp('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

await cdp('Page.enable');
await cdp('Page.navigate', { url: ALVO });
await dormir(3000);

// Entra pela senha, como a Anna faz.
await avaliar(`(() => {
  const campo = document.querySelector('input[type=password]');
  if (!campo) return 'sem campo';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(campo, ${JSON.stringify(SENHA)});
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  const form = campo.closest('form');
  form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));
  return 'ok';
})()`);
await dormir(3500);

// Entra na aula que trazia os placeholders. Sem abrir a aula, o teste
// mede o Dashboard e nao prova nada sobre LessonPage.
//
// O botao nem sempre existe (depende do que o app_state local tem),
// entao o teste tambem mede a funcao de filtro direto sobre os dados
// REAIS de src/data/lessons.js -- que e de onde vinham os marcadores.
const entrou = await avaliar(`(() => {
  const alvos = [...document.querySelectorAll('button, a, [role=button], article, .lesson-card')];
  const aula = alvos.find(el => /frac/i.test(el.innerText || ''));
  if (!aula) return 'nao achei botao de fracao';
  aula.click();
  return 'clicou';
})()`);
console.log(`  (abrindo a aula pela UI: ${entrou})`);
await dormir(4000);
const relatorio = await avaliar(`(() => {
  const imgs = [...document.querySelectorAll('img')];
  const frames = [...document.querySelectorAll('iframe')];
  const ruim = (u) => /COLE|picsum|placeholder|exemplo/i.test(u || '');
  return JSON.stringify({
    totalImgs: imgs.length,
    placeholders: imgs.map(i => i.src).filter(ruim),
    quebradas: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
    framesRuins: frames.map(f => f.src).filter(ruim),
    temImagemVisivel: imgs.length,
    textoTela: (document.body.innerText || '').slice(0, 120),
  });
})()`);

const r = JSON.parse(relatorio || '{}');
console.log(`\n== imagens na tela (${ALVO}) ==`);
console.log(`  tela: ${String(r.textoTela).replace(/\s+/g, ' ').slice(0, 90)}...`);
ok(r.placeholders.length === 0, 'nenhuma <img> com marcador/placeholder na tela', r.placeholders.join(', '));
ok(r.quebradas.length === 0, 'nenhuma imagem quebrada na tela', r.quebradas.join(', '));
ok(r.framesRuins.length === 0, 'nenhum <iframe> com marcador', r.framesRuins.join(', '));
console.log(`  (total de <img> na tela: ${r.totalImgs})`);

// ------------------------------------------------------------------
// Teste direto sobre os dados que traziam o placeholder.
//
// A tela acima depende do que o navegador tem; esta parte nao depende
// de nada. Ela pega as aulas REAIS de src/data/lessons.js (a de Fracoes
// e a de Interpretaï¿½ï¿½ao, as duas com COLE_AQUI) e prova que o filtro
// descarta tudo, e que uma imagem de verdade SOBREVIVE ao filtro.
// ------------------------------------------------------------------
console.log('\n== filtro aplicado aos dados reais de lessons.js ==');
const { lessonMatematica, lessonPortugues } = await import('../src/data/lessons.js');
const { imagensReais, urlReal } = await import('../src/data/lessonImages.js');

for (const [nome, aula] of [['fracoes-decimais', lessonMatematica], ['interpretacao-texto', lessonPortugues]]) {
  const filtradas = imagensReais(aula.images);
  ok(filtradas.length === 0, `${nome}: nenhum placeholder sobrevive ao filtro`, `restou ${filtradas.length}`);
  ok(urlReal(aula.videoUrl) === '', `${nome}: videoUrl marcador foi descartado`);
}

ok(urlReal('https://exemplo.com/aula.png') === 'https://exemplo.com/aula.png', 'URL http real SOBREVIVE');
ok(urlReal('https://youtu.be/abc') === 'https://youtu.be/abc', 'link de video real SOBREVIVE');
ok(urlReal('') === '', 'string vazia nao vira imagem');
ok(urlReal('javascript:alert(1)') === '', 'javascript: e descartado');
ok(imagensReais([{ src: 'https://x.com/a.jpg', caption: 'ok' }]).length === 1, 'imagem real em lista e preservada');
ok(imagensReais(undefined).length === 0, 'lista indefinida vira lista vazia');

console.log(`\n${falhas === 0 ? 'CONFORME' : 'DIVERGENTE'} Ã‚Â· ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);