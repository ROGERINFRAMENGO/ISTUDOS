// ============================================================
// Mede quanto tempo cada modelo leva com o prompt ATUAL da aula.
// Prioridade 1: o prompt cresceu e a geracao passou a bater no
// limite de 150s do gateway (HTTP 546). Este script isola o tempo
// por modelo, sem validacao, para saber onde esta o tempo.
//
// Uso: node tools/medir-tempo-aula.mjs
// ============================================================

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://ehuwpvgcmssxrafsmtfo.supabase.co';
const KEY = 'sb_publishable_bdkos3yStQsBGuPDFuuKcQ_jKO71nf3';

const { createClient: mk } = { createClient };
const cliente = createClient(BASE, KEY, { auth: { persistSession: false } });
const { data, error } = await cliente.auth.signInAnonymously();
if (error || !data?.session) throw new Error('sem sessao');
const token = data.session.access_token;

const CASOS = [
  {
    nome: 'Ciencias / materia',
    payload: {
      subject: 'Ciências',
      topic: 'matéria',
      subtopics: ['matéria', 'substância simples e composta', 'misturas homogêneas e heterogêneas', 'estados físicos'],
      durationMinutes: 55,
    },
  },
  {
    nome: 'Portugues / informacao explicita',
    payload: {
      subject: 'Português',
      topic: 'informação explícita',
      subtopics: ['informação explícita', 'informação implícita', 'compreensão e interpretação'],
      durationMinutes: 55,
    },
  },
];

for (const caso of CASOS) {
  for (const modelo of [undefined, 'meta/muse-glimmer-30b']) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/functions/v1/generate-lesson`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        Authorization: `Bearer ${token}`,
        Origin: 'https://rogerinframengo.github.io',
      },
      body: JSON.stringify({
        ...caso.payload,
        curriculumVersion: 'v2',
        week: 1, day: 3, block: 1,
        dateKey: `sonda-${Date.now()}`,
        force: true,
        noFallback: !modelo,
        ...(modelo ? { forceModel: modelo } : {}),
      }),
    });
    const ms = Date.now() - t0;
    const texto = await r.text();
    let resumo = texto.slice(0, 90).replace(/\s+/g, ' ');
    try {
      const j = JSON.parse(texto);
      if (j.lesson) {
        const s = j.lesson.sections?.length ?? 0;
        const med = Math.round((j.lesson.sections ?? []).reduce((n, x) => n + (x.explanation?.length ?? 0), 0) / Math.max(1, s));
        resumo = `OK ${j.model} secoes=${s} medExpl=${med} chars=${JSON.stringify(j.lesson).length}`;
      } else if (j.errors) {
        resumo = `REPROVADA: ${j.errors.slice(0, 2).join(' | ')}`;
      } else if (j.detail) {
        resumo = `ERRO ${j.error}: ${j.detail.slice(0, 70)}`;
      }
    } catch { /* nao-JSON */ }
    console.log(`${caso.nome.padEnd(34)} ${(modelo ?? 'principal').padEnd(24)} ${String(ms).padStart(7)}ms  ${resumo}`);
  }
}
