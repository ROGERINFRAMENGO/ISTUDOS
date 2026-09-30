// Confere se o diagTutor (gs) foi de fato definido no bundle.
import https from 'node:https';
const url = 'https://rogerinframengo.github.io/ISTUDOS/assets/index-O77VHP5C.js';
https.get(url, (r) => {
  let c = '';
  r.on('data', (x) => { c += x; });
  r.on('end', () => {
    for (const nome of ['gs', 'Re']) {
      const defs = (c.match(new RegExp('function ' + nome + '\\(', 'g')) || []).length;
      const consts = (c.match(new RegExp('const ' + nome + '\\s*=', 'g')) || []).length;
      const usos = (c.match(new RegExp('[^A-Za-z0-9_$]' + nome + '\\(', 'g')) || []).length;
      console.log(nome + ': def=' + defs + ' const=' + consts + ' chamadas=' + usos);
    }
    const i = c.indexOf('function gs(');
    console.log(i >= 0 ? '\ncorpo de gs: ' + c.slice(i, i + 200) : '\nfunction gs NAO encontrada');
    const j = c.indexOf('function Re(');
    console.log(j >= 0 ? 'corpo de Re: ' + c.slice(j, j + 200) : '\nfunction Re NAO encontrada');
  });
});
