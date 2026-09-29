// Mede quanto tempo o modelo NVIDIA leva para responder uma aula.
// NAO usa a chave: mede so o tempo de rede ate a porta 443 da NVIDIA
// para separar "modelo lento" de "chamada nao chegou".
import https from 'node:https';

const t0 = Date.now();
const req = https.request(
  {
    host: 'integrate.api.nvidia.com',
    port: 443,
    path: '/v1/models',
    method: 'GET',
    headers: { Authorization: 'Bearer teste-sem-chave' },
    timeout: 20000,
  },
  (res) => {
    console.log(`resposta em ${Date.now() - t0}ms -> HTTP ${res.statusCode}`);
    res.resume();
    res.on('end', () => console.log('(sem chave, o esperado e 401/403: a rede funciona)'));
  },
);
req.on('error', (e) => console.log(`ERRO DE REDE em ${Date.now() - t0}ms: ${e.message}`));
req.on('timeout', () => { console.log(`TIMEOUT em ${Date.now() - t0}ms`); req.destroy(); });
req.end();
