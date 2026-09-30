// Extrai do bundle publicado o tratador de eventos SSE, para conferir
// se os handlers (onStart/onDelta/onDone) sao realmente invocados.
import https from 'node:https';

const url = process.argv[2] || 'https://rogerinframengo.github.io/ISTUDOS/assets/index-O77VHP5C.js';

https.get(url, (res) => {
  let c = '';
  res.on('data', (x) => { c += x; });
  res.on('end', () => {
    const i = c.indexOf('evento:start');
    if (i < 0) {
      console.log('NAO ACHEI o tratador de eventos no bundle');
      return;
    }
    console.log('--- tratador de eventos no bundle publicado ---\n');
    console.log(c.slice(i - 120, i + 900));
  });
}).on('error', (e) => console.log('erro', e.message));
