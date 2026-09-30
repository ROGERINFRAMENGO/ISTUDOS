// Mede o que o NAVEGADOR faz que o Node nao faz: saveChat roda a CADA
// delta (sincrono, no mesmo tick) e o useEffect de sync dispara a cada
// mudanca de messages. Mede o custo real disso.
console.log('=== Custo de saveChat a cada delta no navegador ===');
const DELTAS = 200;
let acumulado = 0;
const t0 = performance.now();
for (let i = 0; i < DELTAS; i += 1) {
  const mensagens = Array.from({ length: 20 }, (_, j) => ({
    role: j % 2 ? 'assistant' : 'user',
    content: 'x'.repeat(400),
    at: 1750000000000 + j,
  }));
  // saveChat: JSON.stringify de tudo + escrita no localStorage
  const s = JSON.stringify(mensagens.slice(-60));
  acumulado += s.length;
}
const ms = performance.now() - t0;
console.log(`${DELTAS} deltas -> ${ms.toFixed(1)}ms de stringify, ${(acumulado / 1024).toFixed(0)}KB escritos`);
console.log(`media por delta: ${(ms / DELTAS).toFixed(3)}ms`);

console.log('\n=== O efeito de sync dispara quantas vezes? ===');
console.log('Dependencia: [syncReady, messages].');
console.log('messages muda a cada delta ->', DELTAS, 'execucoes do efeito.');
console.log('Cada execucao agenda um setTimeout de 1500ms e CANCELA o anterior.');
console.log('Durante o streaming os deltas chegam a cada ~1-4ms, entao o timer');
console.log('de 1500ms NUNCA chega a disparar: e adiado infinitamente.');
console.log('Isso e o comportamento esperado (nao faz push a cada tecla).');

console.log('\n=== Cenario perigoso: o timer dispara entre deltas ===');
console.log('Se uma resposta demorar >1,5s entre um delta e o próximo,');
console.log('o pushShared roda e chama setMessages(mergeChat(...)).');
