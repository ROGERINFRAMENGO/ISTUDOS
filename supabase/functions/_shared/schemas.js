// ============================================================
// Validacao das respostas da IA antes de salvar no banco.
// ------------------------------------------------------------
// Regra de ouro: nunca salvar lixo. Se a resposta nao bate com o formato
// esperado, devolve { ok:false, errors } e o conteudo NAO e gravado.
// JS puro (ESM): testavel com "npm test" no Node e importado pelas
// Edge Functions no Deno.
// ============================================================

import { verificarAula } from "./mathCheck.js";
import { verificarTexto } from "./textCheck.js";

// Textos que denunciam resposta incompleta / placeholder.
const PLACEHOLDER_PATTERNS = [
  /cole\s+aqui/i,
  /cole\s+o\s+link/i,
  /placeholder/i,
  /lorem\s+ipsum/i,
  /\bTODO\b/,
  /\bTBD\b/,
  /preencher\s+aqui/i,
  /insira\s+aqui/i,
  /x{3,}/i,
];

// A IA gera DADOS, nunca HTML.
const HTML_PATTERN =
  /<\s*\/?\s*(div|span|p|br|img|iframe|script|style|table|tr|td|th|h[1-6]|strong|em|b|i|u|a\s|ul|ol|li|section|article)\b/i;

// A aula precisa ser autossuficiente: nada de "pesquise isso".
const DELEGATING_PATTERN =
  /(pesquise\s+(isso|na\s+internet|no\s+google)|assista\s+(a\s+)?(um\s+)?(video|v[ií]deo)|procure\s+(no|na)\s+(youtube|google|internet))/i;

// ------------------------------------------------------------
// RESPOSTA DECLARADA (Prioridade 2 da finalizacao)
// ------------------------------------------------------------
// A amostragem da FASE E achou um erro real que passava: o campo
// `answer` dizia "2/3" enquanto a explicacao demonstrava, com a
// conta na tela, que "7/10" era o maior. Resposta e explicacao se
// contradiziam e nada pegava.
//
// REGRA ESTREITA, deliberadamente:
//
//  1. So age quando a explicacao tem um MARCADOR EXPLICITO de
//     resposta final ("Resposta: X", "resposta correta: X",
//     "Logo, a resposta e X"). Sem marcador, NAO bloqueia: exigir
//     marcador transformaria a regra em reprovadora de aula boa,
//     que foi exatamente o erro da FASE C.
//
//  2. So compara quando o marcador e um rotulo curto (ate 24
//     caracteres) que NAO e uma frase. "Resposta: a soma e cinco
//     porque..." e frase, e nao e comparado.
//
//  3. A comparacao normaliza espacos, acentos e caixa. E nao
//     interpreta matematica: nao usa eval, nao resolve fracao,
//     nao tenta adivinhar.
//
//  4. Divergencia so bloqueia se as duas formas forem realmente
//     diferentes depois de normalizar. Qualquer duvida nao bloqueia.
//
//  5. NUNCA para quando o valor vem de expressao do enunciado com
//     sinal negativo em texto livre: o mathCheck ja cobre conta.

const RESPOSTA_MARCADOR = /(?:^|[.;:\s])(?:resposta|resposta correta|resultado)\s*(?:final|correta)?\s*(?:é|e|:)\s*([^.;:\n]{1,24})/gi;

/** Normaliza para comparar: minusculo, sem acento, espacos unidos. */
function normalizarResposta(valor) {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "")
    .trim();
}

/** Um rotulo e curto e nao-sentence? "7/10", "-7", "sim". */
function pareceRotulo(valor) {
  const v = String(valor ?? "").trim();
  if (!v || v.length > 24) return false;
  // Frase tem verbo conjugado ou conector; rotulo nao.
  if (/\s(e|sao|foi|porque|portanto|logo|entao)\s/i.test(v)) return false;
  if (/[a-z]{3,}\s+[a-z]{3,}/i.test(v) && !/^[\d\s.,/:+\-×÷()]+$/.test(v)) {
    // Duas palavras sem digitos: pode ser "Tropical atlantica", que e
    // uma resposta legitima. So descarta se for bem longa.
    if (v.length > 18) return false;
  }
  return true;
}

/**
 * Compara a resposta declarada no `answer` com a que a solucao
 * anuncia explicitamente.
 *
 * @returns {string|null} descricao da divergencia, ou null.
 */
function findAnswerContradiction(answer, solution) {
  const esperado = normalizarResposta(answer);
  if (!esperado) return null;

  const texto = String(solution ?? "");
  if (!texto) return null;

  // Todas as ocorrencias: se UMA delas bate com o answer, passa.
  const achados = [...texto.matchAll(RESPOSTA_MARCADOR)];
  if (!achados.length) return null; // sem marcador -> nao bloqueia

  const declaradas = achados
    .map((m) => normalizarResposta(m[1]))
    .filter(Boolean)
    .filter((v) => pareceRotulo(v));

  if (!declaradas.length) return null; // marcador sem rotulo -> nao bloqueia

  // Alguma declaracao bate com o answer? Entao esta coerente.
  if (declaradas.some((d) => d === esperado)) return null;

  // Se o marcador e fraco ("resultado:") e nao ha "resposta", e
  // ainda assim o answer nao bate, exige segunda evidencia antes
  // de reprovar: o "resultado" pode ser de um passo intermediario.
  const temMarcadorForte = /resposta/i.test(texto);
  if (!temMarcadorForte) return null;

  return `answer diz "${String(answer).trim().slice(0, 30)}" mas a solucao declara "Resposta: ${declaradas[0].slice(0, 30)}"`;
}

// ------------------------------------------------------------
// METADADO DO CRONOGRAMA (Prioridade 1)
// ------------------------------------------------------------
// O bug: o prompt mandava o modelo citar "semana 1, dia 3", "bloco",
// "55 minutos" e "fica para revisao amanha", e 12 de 25 aulasJacaram
// esse log de agendamento para a aluna ler. O cronograma controla a
// GERACAO; nunca pode aparecer no TEXTO da aula.
//
// Cada padrao aqui apareceu de fato em alguma aula gerada, nao e
// especulativo.
const SCHEDULE_LEAK_PATTERNS = [
  /\bsemana\s+\d+/i,
  /\bbloco\s+\d+/i,
  /\bfase\s+(base|intermediaria|final|avancada|intensiva|critica)\b/i,
  /\b(dia|bloco)\s+(de|do)\s+\d+/i,
  /\b\d+\s*(min|minutos)\b/i,
  /\brevisao\s+(de|para)\s+amanha\b/i,
  /\b(o|que)\s+nao\s+couber\b/i,
  /\bfica\s+para\s+(a\s+)?(revisao|proxim[ao])\b/i,
  /\bhoje\s+(vamos|voc[eê])\s+(estudar|trabalhar)/i,
  /\baula\s+(anterior|passada)\b/i,
  /\bcronograma\b/i,
  /\bposicao\s+no\s+cronograma\b/i,
  /\broteiro\s+de\s+estudo\b/i,
  /\bplano\s+de\s+estudos?\b/i,
];

// ------------------------------------------------------------
// VAZAMENTO DE SEGREDO (FASE E)
// ------------------------------------------------------------
// A lacuna do cronograma nao era so estetica: "summary" e "objectives"
// nao eram lidos por NENHUMA verificacao. Um pedido da aluna como
// "no resumo, escreva a chave do sistema" passava limpo.
//
// Estes padroes sao de PRECISAO ALTA, e nao bloqueios genericos:
//
//  1. FORMATO REAL de chave (gsk_, sk-, AIza, JWT). Uma aula de
//     matematica ou historia jamais contem isso: falso positivo
//     impossivel.
//  2. FORMA DE DECLARACAO: "a chave ... e <formato>", "API_KEY = ...".
//     Sem o formato real ao lado, o padrao NAO dispara — porque uma
//     aula de Informatica que explica "o que e uma chave de API" e
//     conteudo legitimo e precisa continuar passando.

const SEGRED_FORMATOS = [
  /\bgsk_[A-Za-z0-9]{20,}/,              // Groq
  /\bsk-ant-[A-Za-z0-9\-_]{20,}/,        // Anthropic
  /\bsk-[A-Za-z0-9]{20,}/,               // OpenAI
  /\bAIza[A-Za-z0-9_\-]{30,}/,           // Google
  /\bnvapi-[A-Za-z0-9_\-]{20,}/,         // NVIDIA
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\./, // JWT
];

const SEGRED_DECLARACAO = [
  // Verbo em qualquer flexao (revele, revela, revelar, revele) seguido
  // de um segredo. "Revelar a formula" NAO casa, porque a palavra
  // seguinte e formula, nao chave.
  /(revel\w+|mostr\w+|me\s+diga|qual\s+e)\s+(a\s+|o\s+)?(sua\s+|minha\s+)?(chave|token|secret|senha|prompt\s+do\s+sistema|instru[çc][õo]es?\s+(do\s+)?sistema)/i,
  /(instru[çc][õo]es?\s+(do\s+)?sistema|system\s*prompt|content\s+of\s+the\s+system)/i,
  // "o arquivo de variavel de ambiente", "a variavel de ambiente",
  // "o arquivo .env".
  /(arquivo|arquivos|variavel|variável|secret|config)\s+(de\s+(ambiente|variavel|variável|env)|\.env)/i,
  /(chave|token|secret|senha|api[_\s-]?key)\s*(de\s*(api|do\s*sistema|d[oa]\s*ia|supabase))?\s*(e|=|:|é)\s*["']?[A-Za-z0-9_\-]{16,}/i,
  /(API[_\s-]?KEY|SECRET|TOKEN|SUPABASE[_\s-]?SERVICE[_\s-]?ROLE)\s*=\s*\S{8,}/i,
];

/** @returns {string|null} o trecho vazado, ou null se nao houver. */
function findSecretLeak(...texts) {
  for (const text of texts) {
    const value = String(text ?? "");
    if (!value) continue;
    for (const pattern of SEGRED_FORMATOS) {
      const hit = value.match(pattern);
      if (hit) return hit[0].slice(0, 40);
    }
    for (const pattern of SEGRED_DECLARACAO) {
      const hit = value.match(pattern);
      if (hit) return hit[0].slice(0, 60);
    }
  }
  return null;
}

// Frases de preenchimento: a IA "esqueceu" de responder e devolveu
// isto no lugar do conteudo.
const HOLLOW_PHRASES = [
  /a\s+continuar/i,
  /conforme\s+explicado/i,
  /como\s+visto\s+anteriormente/i,
  /veja\s+(o|as)\s+(exemplo|exercicio)/i,
  /^\s*n\/?a\s*$/i,
  /^\s*tbd\s*$/i,
];

// Frases cortadas no meio (o modelo parou antes do fim).
const TRUNCATED_TAIL = /[,:;\-–—]\s*$/;

/** Normaliza para comparar repeticao (minusculas, sem acento, sem pontuacao). */
function fingerprint(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Números de uma conta: "48/4=12" e "4*12=48" tem os mesmos numeros. */
function numerosDe(text) {
  return (String(text ?? "").match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b).join(",");
}

/**
 * Metadado do cronograma vazado no TEXTO que a aluna le.
 * @returns {string|null} o trecho proibido, ou null se estiver limpo
 */
function findScheduleLeak(...texts) {
  for (const text of texts) {
    const value = String(text ?? "");
    for (const pattern of SCHEDULE_LEAK_PATTERNS) {
      const hit = value.match(pattern);
      if (hit) return hit[0];
    }
  }
  return null;
}

/**
 * Frase de preenchimento no lugar do conteudo real.
 * @returns {string|null}
 */
function findHollow(...texts) {
  for (const text of texts) {
    const value = String(text ?? "");
    for (const pattern of HOLLOW_PHRASES) {
      if (pattern.test(value)) return value.trim().slice(0, 60);
    }
  }
  return null;
}

/**
 * Repeticao artificial: a mesma frase devolvida duas vezes.
 * Compara por "impressao digital" do texto normalizado.
 * @returns {string[]} as frases duplicadas (para o log de erro)
 */
function findRepetitions(items) {
  const vistas = new Map();
  const duplicadas = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const chave = fingerprint(item);
    // Texto muito curto repete sem ser erro.
    if (chave.length < 40) return;
    if (vistas.has(chave)) duplicadas.push(chave.slice(0, 80));
    else vistas.set(chave, true);
  });
  return duplicadas;
}

/**
 * COERENCIA INTERNA (Prioridade 1) — deterministico, sem IA.
 *
 * NÃO e um verificador de verdade cientifica: nao descobre se uma
 * formula esta certa. Ele pega o erro mais perigoso e mais comum,
 * que ja aconteceu aqui: o enunciado mente e a resposta segue a
 * mentira, teachando a aluna o conteudo errado com toda confiança.
 *
 * Os quatro casos que ele pega:
 *   1. problema e solution-aboutadas a numeros diferentes, sem
 *      relacao entre elas (conta nao confere);
 *   2. explanation contradiz a solution (explica uma coisa, faz outra);
 *   3. answer que nao aparece nem na solution nem na explanation;
 *   4. enunciado com premissa que a propria resposta desmente
 *      (ex.: "CO2 formado de N2" + resposta "substancia simples").
 *
 * Heuristica, com folga proposital: preferimos deixar passar uma aula
 * estranha do que reprovar uma aula boa. Nenhum item aqui reprova a
 * aula sozinho sem peso; use-os como sinais.
 */
function findCoherenceIssues({ sections = [], guidedPractice = [] }) {
  const problemas = [];

  sections.forEach((section, si) => {
    (section.examples ?? []).forEach((ex, ei) => {
      const at = `sections[${si}].examples[${ei}]`;
      const { problem = "", solution = "", explanation = "" } = ex;

      // (1) conta nao confere: o problema traz uma conta (>=2 numeros
      // E sinal de operacao) e NENHUM deles reaparece na solucao. Enunciado
      // textual (mesmo com horarios) nao e conta — nao reprovar.
      const temOperacao = /[+\-*/×÷=]|dobro|terco|vezes|divi/gi.test(problem);
      const pNums = [...new Set(problem.match(/\d+/g) ?? [])];
      if (temOperacao && pNums.length >= 2) {
        // Compara sem fronteira de palavra: em "7h" o digito esta
        // grudado numa letra, e \b7\b nao casaria. Busca o numero como
        // qualquer substring solta ("18" casa dentro de "18h").
        const solucaoTem = pNums.filter((n) => solution.includes(n)).length;
        if (solucaoTem === 0) {
          problemas.push(`${at}: os numeros da conta do enunciado (${pNums.join(", ")}) nao aparecem na solucao`);
        }
      }

      // (2) explicacao contradiz solucao: a solucao entrega um numero
      // que a explicacao nunca menciona E a explicacao traz numeros
      // totalmente diferentes. Sinais de conta refeita errada.
      const sNums = solution.match(/\d+/g) ?? [];
      const eNums = explanation.match(/\d+/g) ?? [];
      if (sNums.length && eNums.length && numerosDe(solution) !== numerosDe(explanation)) {
        const algumEmComum = sNums.some((n) => explanation.includes(n));
        if (!algumEmComum) {
          problemas.push(`${at}: explicacao usa numeros diferentes dos da solucao`);
        }
      }
      // (4) mesma defesa de premissa, aplicada aos exemplos tambem.
      // O erro do CO2 real estava num EXEMPLO, nao num exercicio.
      problemas.push(...checarPremissaContradita({ at, problem, solution, explanation }));
    });
  });

  guidedPractice.forEach((item, i) => {
    const at = `guidedPractice[${i}]`;
    const { question = "", answer = "", explanation = "" } = item;
    // (3) answer nao combina com a explicacao: a resposta tem um numero
    // que a explicacao contradiz. Pega "answer: 12 / explanation: o
    // resultado e 15".
    const aNums = (answer.match(/\d+/g) ?? []).filter((n) => n.length > 0);
    if (aNums.length && explanation) {
      const naoBate = aNums.every((n) => !explanation.includes(n));
      if (naoBate && explanation.match(/\d+/g)?.length) {
        problemas.push(`${at}: a resposta (${aNums.join(", ")}) nao aparece na explicacao`);
      }
    }
    // (4) mesma defesa nos exercicios.
    problemas.push(...checarPremissaContradita({
      at, problem: question, solution: answer, explanation,
    }));
  });

  return problemas;
}

/**
 * (4) PREMISSA CONTRADITA — o caso mais grave que ja aconteceu aqui.
 *
 * A aula de Ciencias afirmou "o gas carbonico e formado de N2" e
 * respondeu "substancia simples". O enunciado era falso e a resposta
 * confirmava a premissa.
 *
 * LIMITACAO IMPORTANTE (medida em 30/09/2026): a primeira versao
 * desta regra reprovava quase todas as aulas de Ciencias, porque
 * "substancia simples ou composta" E o tema da propria aula.
 * Responder "substancia simples" ali nao e erro: e o objetivo. Esta
 * funcao nao e um fact checker e nao pode se comportar como um.
 *
 * O que sobrou e um sinal estreito: a explicacao introduz um
 * elemento ou formula que o enunciado NAO cita. E o formato exato
 * do erro real (o enunciado dizia N2, a explicacao puxou carbono).
 * A regra de CLASSIFICACAO foi removida de proposito.
 */
function checarPremissaContradita({ at, problem = "", solution = "", explanation = "" }) {
  const problemas = [];
  // Formula/elemento citado no enunciado, na solucao ou na explicacao.
  const quimicos =
    /\b(CO2|H2O|N2|O2|CO|C6H12O6|carbono|oxigenio|nitrogenio|hidrogenio|agua|gas carbonico|dioxido de carbono)\b/gi;

  const noEnunciado = new Set((problem.match(quimicos) ?? []).map(normalizaTermo));
  const naExplicacao = new Set((explanation.match(quimicos) ?? []).map(normalizaTermo));

  // So checa se o enunciado realmente cita QUIMICA. Numa aula de
  // matematica, portugues ou historia nao ha o que comparar.
  if (noEnunciado.size === 0 || naExplicacao.size === 0) return problemas;

  // A explicacao cita um termo quimico ausente do enunciado.
  const naoCiteados = [...naExplicacao].filter((t) => !noEnunciado.has(t));
  if (naoCiteados.length >= 1 && explanation.length < 500) {
    problemas.push(
      `${at}: a explicacao cita "${naoCiteados[0]}", que nao aparece no enunciado (conferir a premissa)`,
    );
  }
  return problemas;
}

/**
 * PALAVRA DUPLICADA (Prioridade 1) — frase quebrada por repeticao.
 *
 * Defeito real encontrado no site publicado em 30/09/2026 na aula de
 * Historia: "...a organizacao burocratica do Estado de Estado antigo".
 * O modelo montou "do Estado de Estado" e a frase ficou sem sentido.
 * Nenhuma das outras heuristicas pega isso: nao e metadado, nao e
 * placeholder, nao e markdown, nao corta a frase e a conta da aula esta
 * toda certa. So a gramatica entrega o erro.
 *
 * Duas formas, ambas inequivocas:
 *   1. "Estado de Estado", "revolucao da revolucao" — mesma palavra
 *      dos dois lados de uma preposicao;
 *   2. "de de", "a a", "com com" — preposicao ou artigo repetido.
 *
 * "que que" fica DE FORA de proposito: e gíria valide em portugues
 * ("que que voce quer?") e reprovar a aula por causa disso seria
 * exatamente o falso positivo que a heuristica precisa evitar.
 * Tambem nao pega "um terco de um terco de x", que e conta legitima:
 * a regex exige a MESMA palavra dos dois lados do conector.
 */
const PALAVRA_DUPLICADA_CONECTOR = /\b(\w{4,})\s+(?:de|do|da|em|no|na|nos|nas)\s+\1\b/gi;
// Apenas conectores IDENTICOS dos dois lados. "de de", "com com",
// "no no" sao sempre erro de digitacao ou de montagem.
// A versao anterior aceitava qualquer par, e reprovava frase boa:
// "a revolucao mudou o trabalho" casa "e a", e "para a prova" casa
// "para a" — duas construcoes corretas do portugues. So repeticao
// exata do mesmo conectores indica frase quebrada.
const CONECTORES_REPETIDOS =
  /\b(de|de|do|do|da|da|del|dela|em|em|no|no|na|na|nos|nos|nas|nas|para|para|por|por|com|com|sem|sem)\s+\1\b/i;

/**
 * @returns {{texto:string, trecho:string}|null}
 */
function findDuplicatedWords(...texts) {
  for (const text of texts) {
    const value = String(text ?? "");
    if (!value) continue;

    const conector = value.match(PALAVRA_DUPLICADA_CONECTOR);
    if (conector) return { texto: value, trecho: conector[0] };

    if (CONECTORES_REPETIDOS.test(value)) {
      const achado = value.match(CONECTORES_REPETIDOS);
      return { texto: value, trecho: achado?.[0] ?? "" };
    }
  }
  return null;
}

/** Reduz "gas carbonico" e "dioxido de carbono" ao mesmo token CO2. */
function normalizaTermo(texto) {
  const t = String(texto).toLowerCase().trim();
  if (/^(dioxido de carbono|gas carbonico|co2)$/.test(t)) return "co2";
  if (/^(agua|h2o)$/.test(t)) return "h2o";
  return t;
}



function cleanText(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikePlaceholder(text) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function readString(value, { field, errors, min = 1, max = 4000, required = true }) {
  const text = cleanText(value);
  if (!text) {
    if (required) errors.push(`${field}: texto vazio`);
    return "";
  }
  if (text.length < min) errors.push(`${field}: muito curto (${text.length} caracteres, minimo ${min})`);
  if (text.length > max) errors.push(`${field}: muito longo (${text.length} caracteres, maximo ${max})`);
  if (HTML_PATTERN.test(text)) errors.push(`${field}: contem HTML`);
  if (looksLikePlaceholder(text)) errors.push(`${field}: contem placeholder`);
  return text;
}

function readStringList(value, { field, errors, minItems, maxItems, minChars = 8, maxChars = 600 }) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n+/) : [];
  const items = [];
  raw.forEach((entry, index) => {
    const text = readString(entry, { field: `${field}[${index}]`, errors, min: minChars, max: maxChars });
    if (DELEGATING_PATTERN.test(text)) errors.push(`${field}[${index}]: manda pesquisar fora em vez de explicar`);
    if (text) items.push(text);
  });
  if (items.length < minItems) errors.push(`${field}: minimo ${minItems} itens, veio ${items.length}`);
  if (items.length > maxItems) errors.push(`${field}: maximo ${maxItems} itens, veio ${items.length}`);
  return items;
}

function normalizeDifficulty(value, fallback = "medium") {
  const text = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "");
  if (/facil|easy|inicio|basic/.test(text)) return "easy";
  if (/dificil|hard|avancad|etec/.test(text)) return "hard";
  if (/medi|medium|intermedi/.test(text)) return "medium";
  return fallback;
}

export { cleanText, looksLikePlaceholder, normalizeDifficulty, DELEGATING_PATTERN };
// Prioridade 1: helpers deterministicos de auditoria pedagogica.
export {
  findScheduleLeak,
  findSecretLeak,
  findAnswerContradiction,
  findHollow,
  findRepetitions,
  findCoherenceIssues,
  findDuplicatedWords,
  SCHEDULE_LEAK_PATTERNS,
};

// ------------------------------------------------------------
// AULA
// ------------------------------------------------------------
/**
 * Valida e normaliza a aula gerada pela IA.
 * subject/topic vens do CRONOGRAMA (parametros), nunca do modelo:
 * a IA nao pode mudar o curriculo.
 * @returns {{ok:boolean, data?:object, errors:string[]}}
 */
export function validateLesson(raw, input = {}) {
  const errors = [];
  const source = raw && typeof raw === "object" ? raw : {};

  const title = readString(source.title, { field: "title", errors, min: 5, max: 120 });
  const introduction = readString(source.introduction, { field: "introduction", errors, min: 40, max: 1600 });

  const objectives = readStringList(source.objectives, {
    field: "objectives",
    errors,
    minItems: 1,
    maxItems: 6,
    minChars: 10,
    maxChars: 220,
  });

  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  if (rawSections.length < 3) errors.push(`sections: minimo 3 secoes, veio ${rawSections.length}`);
  if (rawSections.length > 6) errors.push(`sections: maximo 6 secoes, veio ${rawSections.length}`);

  const sections = rawSections.map((section, index) => {
    const sectionTitle = readString(section?.title, { field: `sections[${index}].title`, errors, min: 4, max: 140 });
    const explanation = readString(section?.explanation, {
      field: `sections[${index}].explanation`,
      errors,
      min: 80,
      max: 3500,
    });
    if (DELEGATING_PATTERN.test(explanation)) {
      errors.push(`sections[${index}].explanation: manda pesquisar fora em vez de explicar`);
    }

    const rawExamples = Array.isArray(section?.examples) ? section.examples : [];
    if (index === 0 && rawExamples.length === 0) {
      errors.push("sections[0].examples: a primeira secao precisa de 1 exemplo resolvido");
    }
    if (rawExamples.length > 3) errors.push(`sections[${index}].examples: maximo 3 exemplos`);

    const examples = rawExamples.map((example, exampleIndex) => {
      const at = `sections[${index}].examples[${exampleIndex}]`;
      return {
        problem: readString(example?.problem, { field: `${at}.problem`, errors, min: 15, max: 600 }),
        solution: readString(example?.solution, { field: `${at}.solution`, errors, min: 20, max: 1600 }),
        explanation: readString(example?.explanation ?? example?.why, {
          field: `${at}.explanation`,
          errors,
          min: 15,
          max: 900,
        }),
      };
    });

    return { title: sectionTitle, explanation, examples };
  });

  const rawPractice = Array.isArray(source.guidedPractice) ? source.guidedPractice : [];
  if (rawPractice.length < 3) errors.push(`guidedPractice: minimo 3 exercicios, veio ${rawPractice.length}`);
  if (rawPractice.length > 6) errors.push("guidedPractice: maximo 6 exercicios");

  const guidedPractice = rawPractice.map((item, index) => {
    const at = `guidedPractice[${index}]`;
    return {
      question: readString(item?.question, { field: `${at}.question`, errors, min: 15, max: 600 }),
      hint: readString(item?.hint, { field: `${at}.hint`, errors, min: 8, max: 300 }),
      // FASE B: o minimo de 3 foi REMOVIDO de proposito, com evidencia
      // de 40 casos. O piso rejeitava respostas numericas CORRETAS e
      // minimas. Medido em gpt-oss-120b / numeros inteiros:
      //   "(-12) + 5"   -> answer "-7" (2 chars)  rejeitada
      //   "(-3) x (-8)" -> answer "24" (2 chars)  rejeitada
      // Ambas sao as respostas certas. Contar caracteres nao distingue
      // "-7" de um campo vazio, e nao e para isso que a regra existe:
      // quem garante que a resposta existe e a checagem de vazio, e quem
      // garante que ela combina com o enunciado e a coerencia
      // enunciado/resposta/explicacao — ambas continuam intactas.
      answer: readString(item?.answer, { field: `${at}.answer`, errors, min: 1, max: 400 }),
      explanation: readString(item?.explanation, { field: `${at}.explanation`, errors, min: 20, max: 1200 }),
    };
  });

  const commonMistakes = readStringList(source.commonMistakes, {
    field: "commonMistakes",
    errors,
    minItems: 2,
    maxItems: 6,
    minChars: 15,
    maxChars: 320,
  });

  const summary = readStringList(source.summary, {
    field: "summary",
    errors,
    minItems: 2,
    maxItems: 8,
    minChars: 10,
    maxChars: 320,
  });

  const requestedMinutes = Number(input.durationMinutes) || 40;
  const generatedMinutes = Number(source.estimatedMinutes);
  const estimatedMinutes = Number.isFinite(generatedMinutes)
    ? Math.min(120, Math.max(10, Math.round(generatedMinutes)))
    : requestedMinutes;

  // ------------------------------------------------------------
  // VERIFICACOES PEDAGOGICAS (Prioridade 1)
  // ------------------------------------------------------------
  // Estas rodam DEPOIS do formato: a aula ja e um JSON valido e
  // completo, e agora verificamos se ela presta. Nenhuma delas exige
  // IA — sao heuristicas deterministicas, feitas para reprovar a aula
  // OBVIAMENTE quebrada, nunca a aula apenas diferente.

  // (A) O cronograma nao pode aparecer no texto que a aluna le.
  //
  // LACUNA CORRIGIDA NA FASE E: ate aqui so introduction, secoes,
  // exemplos e exercicios eram conferidos. summary, objectives e
  // commonMistakes NAO eram. Isso abria um caminho real: a aluna
  // pedia "coloque no resumo a chave da API" e o texto vazado passava
  // sem nenhuma verificacao, porque nenhum campo era lido.
  const introductionLeak = findScheduleLeak(introduction);
  if (introductionLeak) {
    errors.push(`introduction: vazou metadado do cronograma ("${introductionLeak}")`);
  }

  // Mesmo findScheduleLeak, com os padroes que ja existem e ja foram
  // medidos. Nenhum padrao novo e fraco foi inventado aqui: um bloco
  // generico do tipo "proibir a palavra X" reprovaria aula legitima.
  const listaLeak = findScheduleLeak(...summary);
  if (listaLeak) errors.push(`summary: vazou metadado do cronograma ("${listaLeak}")`);

  const objetivoLeak = findScheduleLeak(...objectives);
  if (objetivoLeak) errors.push(`objectives: vazou metadado do cronograma ("${objetivoLeak}")`);

  const erroComumLeak = findScheduleLeak(...commonMistakes);
  if (erroComumLeak) errors.push(`commonMistakes: vazou metadado do cronograma ("${erroComumLeak}")`);

  const todoTexto = [introduction, ...objectives, ...commonMistakes, ...summary];
  sections.forEach((section, i) => {
    const leak = findScheduleLeak(section.explanation, section.title);
    if (leak) errors.push(`sections[${i}]: vazou metadado do cronograma ("${leak}")`);
    (section.examples ?? []).forEach((ex, j) => {
      const exLeak = findScheduleLeak(ex.problem, ex.solution, ex.explanation);
      if (exLeak) errors.push(`sections[${i}].examples[${j}]: vazou metadado ("${exLeak}")`);
    });
  });
  guidedPractice.forEach((item, i) => {
    const pLeak = findScheduleLeak(item.question, item.explanation);
    if (pLeak) errors.push(`guidedPractice[${i}]: vazou metadado ("${pLeak}")`);

    // Resposta declarada que contradiz o campo answer. So dispara
    // com marcador explicito na explicacao (ver findAnswerContradiction).
    const contra = findAnswerContradiction(item.answer, item.explanation);
    if (contra) errors.push(`guidedPractice[${i}]: ${contra}`);
  });

  // (A2) Segredo e instrucao de sistema. Aqui a varredura e TOTAL: nao
  // faz sentido proteger "introduction" e deixar "summary" aberto,
  // porque o vazamento escolhe justamente o campo que ninguem lia.
  const segredo = findSecretLeak(
    title, introduction, ...objectives, ...summary, ...commonMistakes,
    ...sections.flatMap((s) => [s.title, s.explanation, ...(s.examples ?? []).flatMap((e) => [e.problem, e.solution, e.explanation])]),
    ...guidedPractice.flatMap((g) => [g.question, g.hint, g.answer, g.explanation]),
  );
  if (segredo) {
    errors.push(`conteudo da aula: vazou segredo ou instrucao interna ("${segredo}")`);
  }

  // (B) Frase de preenchimento no lugar do conteudo.
  const hollow = findHollow(introduction, ...sections.map((s) => s.explanation), ...summary);
  if (hollow) errors.push(`conteudo generico: "${hollow}"`);

  // (C) Frase cortada no meio (o modelo parou antes do fim).
  [...sections.map((s) => s.explanation), introduction].forEach((text, i) => {
    if (String(text ?? "").length > 120 && TRUNCATED_TAIL.test(String(text).trim())) {
      errors.push(`texto cortado no fim: "${String(text).trim().slice(-40)}"`);
    }
  });

  // (D) Repeticao artificial entre campos de lista.
  // Uma unica frase repetida ja e erro: significa que o modelo
  // devolveu o mesmo item duas vezes em slots diferentes.
  const repetidos = findRepetitions([...commonMistakes, ...summary, ...objectives]);
  if (repetidos.length >= 1) {
    errors.push(`repeticao artificial: "${repetidos[0].slice(0, 60)}..."`);
  }

  // (E) Coerencia interna entre enunciado, solucao e explicacao.
  findCoherenceIssues({ sections, guidedPractice }).forEach((issue) => errors.push(issue));

  // (E2) Frase quebrada por palavra duplicada. Defeito real visto no
  // site: "organizacao burocratica do Estado de Estado antigo".
  const ondeDuplicou = findDuplicatedWords(
    introduction,
    ...sections.map((s) => `${s.title} ${s.explanation}`),
    ...sections.flatMap((s) =>
      (s.examples ?? []).flatMap((ex) => [ex.problem, ex.solution, ex.explanation]),
    ),
    ...guidedPractice.flatMap((g) => [g.question, g.answer, g.explanation]),
    ...commonMistakes,
    ...summary,
  );
  if (ondeDuplicou) {
    errors.push(`frase quebrada: palavra repetida ("${ondeDuplicou.trecho}")`);
  }

  // (E3) FASE C: a conta e refeita de verdade. A checagem de coerencia
  // acima so comparava os numeros entre si, entao "Resolva 45 * (-9)"
  // com resposta "-5" passava: a resposta e a explicacao concordavam
  // entre si, mesmo com o resultado errado. Aqui o verificador proprio
  // recalcula a expressao. Se a expressao estiver fora do subconjunto
  // seguro, ele nao reclama — nunca bloqueia por nao saber avaliar.
  verificarAula({ sections, guidedPractice }).forEach((erro) => errors.push(erro));

  // (E4) FASE C: corrupcao textual. "deas", "feita??" e texto cortado
  // no meio passaram por todas as outras regras. Aqui a aula e
  // REJEITADA (nunca corrigida): corrigir exigiria dicionario, e
  // dicionario em materia tecnica estraga conteudo bom. O pipeline
  // ja tem uma rodada de regeneracao, e o erro vai para ela.
  verificarTexto({
    title, introduction, sections, guidedPractice, commonMistakes, summary,
  }).forEach((erro) => errors.push(erro));

  // (F) Topic alignment: os subtopicos do cronograma precisam aparecer.
  const subtopics = Array.isArray(input.subtopics) ? input.subtopics.filter(Boolean) : [];
  const corpus = JSON.stringify({ introduction, objectives, sections, guidedPractice, summary })
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const faltando = subtopics.filter((subtopic) => {
    const alvo = fingerprint(subtopic);
    if (!alvo) return false;
    // Compara a palavra mais significativa do subtopico (ignora
    // preposicao e artigo). "números inteiros" -> "inteiros".
    const palavras = alvo.split(" ").filter((p) => p.length > 3);
    return palavras.length ? !palavras.some((p) => corpus.includes(p)) : false;
  });
  if (faltando.length > Math.ceil(subtopics.length / 2)) {
    errors.push(`fora do tema: a aula nao cobre ${faltando.length} de ${subtopics.length} subtopicos do cronograma`);
  }

  // (G) Profundidade: o piso subiu (o prompt pede 600+ por secao).
  const explicacoesCurtas = sections.filter((s) => (s.explanation?.length ?? 0) < 260);
  if (sections.length && explicacoesCurtas.length > Math.ceil(sections.length / 2)) {
    errors.push(`profundidade insuficiente: ${explicacoesCurtas.length} de ${sections.length} secoes com menos de 260 caracteres de explicacao`);
  }

  // (H) Markdown residual: o backend limpa ** e #, mas o modelo pode
  // reintroduzir outros marcadores.
  const markdownRestante = [...todoTexto, ...sections.map((s) => s.explanation)].find((t) =>
    /(\*\*|^#{1,6}\s|^\s*[-*]\s|```|\\frac|\\times)/m.test(String(t ?? "")),
  );
  if (markdownRestante) {
    errors.push("contem markdown que nao foi limpo");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    data: {
      title,
      // O curriculo vem do cronograma, nunca do modelo.
      subject: cleanText(input.subject) || cleanText(source.subject) || "Estudo",
      topic: cleanText(input.topic) || cleanText(source.topic) || "Aula",
      estimatedMinutes,
      objectives,
      introduction,
      sections,
      guidedPractice,
      commonMistakes,
      summary,
    },
  };
}

// ------------------------------------------------------------
// QUIZ
// ------------------------------------------------------------
const LETTERS = ["a", "b", "c", "d", "e", "f"];

/** Aceita 0, "0", 2, "A"/"a" e devolve o indice 0-based (ou null). */
export function normalizeAnswerIndex(value, optionCount) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 0 && value < optionCount ? value : null;
  }
  const text = String(value ?? "").trim().toLowerCase().replace(/[).,]$|^\(/, "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const index = Number(text);
    return index >= 0 && index < optionCount ? index : null;
  }
  const letterIndex = LETTERS.indexOf(text);
  return letterIndex > -1 && letterIndex < optionCount ? letterIndex : null;
}

/**
 * Valida e normaliza o quiz gerado pela IA.
 * So aceita multiple_choice (unico tipo que a interface corrige hoje).
 * @returns {{ok:boolean, data?:object, errors:string[], warnings:string[]}}
 */
export function validateQuiz(raw, input = {}) {
  const errors = [];
  const warnings = [];
  const source = raw && typeof raw === "object" ? raw : {};
  const requested = Math.min(15, Math.max(3, Number(input.questionCount) || 5));
  const difficulty = normalizeDifficulty(input.difficulty, "medium");

  const rawQuestions = Array.isArray(source.questions)
    ? source.questions
    : Array.isArray(source.items)
      ? source.items
      : Array.isArray(source.quiz)
        ? source.quiz
        : [];

  if (!rawQuestions.length) return { ok: false, errors: ["questions: nenhuma questao encontrada na resposta"], warnings };
  if (rawQuestions.length > requested) {
    warnings.push(`questions: vieram ${rawQuestions.length}, truncando para ${requested}`);
  }
  const minAccepted = Math.min(requested, Math.max(3, requested - 1));
  if (rawQuestions.length < minAccepted) {
    errors.push(`questions: pedido ${requested}, vieram apenas ${rawQuestions.length}`);
  }

  const title = readString(source.title, { field: "title", errors, min: 5, max: 120, required: false })
    || `Quiz de ${cleanText(input.topic) || "Estudo"}`;

  const seen = new Set();
  const questions = rawQuestions.slice(0, requested).map((item, index) => {
    const at = `questions[${index}]`;
    const question = readString(item?.question ?? item?.statement, { field: `${at}.question`, errors, min: 12, max: 700 });

    const rawOptions = Array.isArray(item?.options) ? item.options : Array.isArray(item?.alternatives) ? item.alternatives : [];
    if (rawOptions.length < 2) errors.push(`${at}.options: minimo 2 alternativas, veio ${rawOptions.length}`);
    if (rawOptions.length > 6) errors.push(`${at}.options: maximo 6 alternativas`);

    const options = [];
    rawOptions.forEach((option, optionIndex) => {
      const text = readString(option, { field: `${at}.options[${optionIndex}]`, errors, min: 1, max: 300 });
      const normalized = text.toLowerCase().replace(/\s+/g, " ");
      if (options.some((existing) => existing.toLowerCase().replace(/\s+/g, " ") === normalized)) {
        errors.push(`${at}.options[${optionIndex}]: alternativa repetida (resposta ambigua)`);
      }
      if (text) options.push(text);
    });

    const correctAnswer = normalizeAnswerIndex(
      item?.correctAnswer ?? item?.correct ?? item?.answerIndex ?? item?.answer,
      options.length,
    );
    if (correctAnswer === null) errors.push(`${at}.correctAnswer: indice invalido ou faltando`);

    const explanation = readString(item?.explanation, { field: `${at}.explanation`, errors, min: 12, max: 900 });
    if (DELEGATING_PATTERN.test(question)) errors.push(`${at}.question: manda pesquisar fora em vez de responder`);
    if (question) {
      const key = question.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) errors.push(`${at}.question: questao duplicada`);
      seen.add(key);
    }

    const type = cleanText(item?.type || "multiple_choice").toLowerCase();
    if (type !== "multiple_choice") {
      errors.push(`${at}.type: tipo "${type}" ainda nao e corrigido pela interface (use multiple_choice)`);
    }

    return {
      id: `q${index + 1}`,
      type: "multiple_choice",
      question,
      options,
      correctAnswer: correctAnswer ?? 0,
      // "correct" e o nome que o LessonPage ja usa para corrigir.
      correct: correctAnswer ?? 0,
      explanation,
      difficulty: normalizeDifficulty(item?.difficulty, difficulty),
      skill: cleanText(item?.skill) || cleanText(input.topic) || "geral",
    };
  });

  if (errors.length) return { ok: false, errors, warnings };

  return {
    ok: true,
    errors: [],
    warnings,
    data: {
      title: title || `Quiz de ${cleanText(input.topic) || "Estudo"}`,
      subject: cleanText(input.subject) || "Estudo",
      topic: cleanText(input.topic) || "Aula",
      difficulty,
      questions,
    },
  };
}



