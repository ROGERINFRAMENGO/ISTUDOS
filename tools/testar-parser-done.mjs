// Reproduz o BUG REAL do parser SSE: quando o stream fecha, o codigo faz
// `if (done) break` e sai do laco ANTES de processar o que sobrou no
// buffer. Se o proxy/keep-alive cortou o SSE no meio de um evento, esse
// texto e descartado para sempre e a resposta nunca chega na tela.
//
// No Node os testes passavam porque a leitura devolvia tudo de uma vez.
// No navegador, com keep-alive, o corte no meio do evento acontece.
//
// Uso: node tools/testar-parser-done.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(raiz, 'src/services/ai.js'), 'utf8');
const corpo = src.slice(src.indexOf('export async function streamTutor'));
const trataResto = /processarBuffer|finalizarBuffer|drenar/.test(corpo);

console.log('=== o parser processa o buffer ao fechar o stream? ===');
console.log(trataResto ? 'SIM (corrigido)' : 'NAO (descarta o resto)');

/**
 * Copia da logica de streamTutor. Cada item de `leituras` e uma leitura
 * de rede; ao fim delas o reader devolve done:true (stream fechado).
 */
function rodar(leituras) {
  let buffer = '';
  let evento = null;
  let acumulado = '';
  let encerrou = false;
  const recebidos = [];

  for (const pedaco of leituras) {
    if (encerrou) break;
    buffer += pedaco;
    const blocos = buffer.split('\n\n');
    buffer = blocos.pop() ?? '';
    for (const bloco of blocos) {
      for (const linha of bloco.split('\n')) {
        const limpa = linha.trim();
        if (limpa.startsWith('event:')) { evento = limpa.slice(6).trim(); continue; }
        if (!limpa.startsWith('data:')) continue;
        let dados;
        try { dados = JSON.parse(limpa.slice(5).trim()); } catch { continue; }
        recebidos.push(evento);
        if (evento === 'delta') acumulado += dados.text ?? '';
        else if (evento === 'done') { encerrou = true; break; }
      }
    }
  }
  // aqui o reader devolve done:true e o codigo real faz `break`
  return { recebidos, acumulado, sobrou: buffer };
}

const casos = [
  {
    nome: 'resposta inteira em UMA leitura',
    leituras: [
      'event: start\ndata: {"conversationId":"x"}\n\n' +
      'event: delta\ndata: {"text":"Uma celula "}\n\n' +
      'event: delta\ndata: {"text":"e viva."}\n\n' +
      'event: done\ndata: {"reply":"Uma celula e viva."}\n\n',
    ],
    precisa: ['Mariana'],
  },
  {
    nome: 'evento CORTADO no meio + stream fecha logo depois',
    leituras: [
      'event: start\ndata: {"conversationId":"x"}\n\n' +
      'event: delta\ndata: {"text":"Uma celula "}\n\n' +
      'event: delta\ndata: {"text":"e viva de verdade, como a ',
      'Mariana"}\n\n' +
      'event: done\ndata: {"reply":"Uma celula e viva de verdade, como a Mariana"}\n\n',
    ],
    precisa: ['Mariana'],
  },
  {
    nome: 'ultimo delta sozinho, sem o done (keep-alive cortou)',
    leituras: ['event: delta\ndata: {"text":"PARTE FINAL"}\n\n'],
    precisa: ['PARTE FINAL'],
  },
];

let todosOk = true;
for (const caso of casos) {
  const r = rodar(caso.leituras);
  const faltou = caso.precisa.filter((p) => !r.acumulado.includes(p));
  const ok = faltou.length === 0;
  if (!ok) todosOk = false;
  console.log(`\n=== ${caso.nome} ===`);
  console.log('  eventos :', r.recebidos.join(', ') || '(nenhum)');
  console.log('  texto   :', JSON.stringify(r.acumulado));
  console.log('  sobrou  :', JSON.stringify(r.sobrou));
  console.log('  faltou  :', faltou.length ? faltou.join(', ') : 'nada');
  console.log('  resultado:', ok ? 'OK' : 'FALHOU  <-- texto perdido');
}

if (!todosOk) {
  console.log('\n>>> CAUSA RAIZ CONFIRMADA: ao fechar o stream o parser faz');
  console.log('>>> `if (done) break` e nunca processa o buffer restante.');
  console.log('>>> Se o SSE veio cortado no meio, esse texto nunca aparece.');
}
process.exit(todosOk ? 0 : 1);
