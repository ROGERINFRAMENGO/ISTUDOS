// Confere se o bundle publicado tem a instrumentacao DENTRO do handler
// onDelta do React (e nao apenas a string solta no arquivo).
import https from 'node:https';

const url = process.argv[2] || 'https://rogerinframengo.github.io/ISTUDOS/assets/index-O77VHP5C.js';

https.get(url, (res) => {
  let c = '';
  res.on('data', (x) => { c += x; });
  res.on('end', () => {
    const marcador = ' chars';
    const i = c.indexOf(marcador);
    console.log('bundle:', url.split('/').pop(), `(${c.length} bytes)`);
    console.log('contem o diag " chars"      :', i > 0);
    console.log('contem "onDone reply="      :', c.includes('onDone reply='));
    console.log('contem "sessao:inicio"      :', c.includes('sessao:inicio'));
    if (i > 0) {
      console.log('\n--- contexto do handler onDelta ---');
      console.log(c.slice(Math.max(0, i - 300), i + 80));
    }
  });
}).on('error', (e) => console.log('erro', e.message));
