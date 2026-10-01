// ============================================================
// TEXTO CORROMPIDO
// ------------------------------------------------------------
// A FASE B mediu, em producao, quatro corrupcoes que passaram por
// TODO o validateLesson():
//
//   "os eletletoes"         -> "eletrons"  (silaba repetida)
//   "as cargas deas"        -> "delas"     (tokens colados)
//   "naquela molecula espec"-> "especifica" (palavra cortada no fim)
//   "ela e feita??"         -> "?"         (pontuacao quebrada)
//
// REGRA DE PROJETO DESTA FASE: DETECTAR E REJEITAR, NUNCA CORRIGIR.
//
// Corrigir exigiria dicionario, e dicionario em materia tecnica e
// receita de desastre: "co2" viraria "coz", simbolo de elemento
// seria reescrito, nome proprio seria trocado. O risco de estragar
// conteudo bom e maior que o de recusar uma aula com um erro de
// grafia — e o custo de recusar e so um retry, que o pipeline ja
// faz de qualquer jeito.
//
// Cada padrao aqui e INQUIVOCO: nao ha palavra portuguesa legitima
// que satisfaca. Se um dia duvidar de um padrao, ele nao entra.
// ============================================================

/**
 * 1. SILABA REPETIDA — "eletletoes", "posspossivel".
 *
 * Exige a mesma sequencia repetida IMEDIATAMENTE. Tres condicoes,
 * todas necessarias, porque cada uma sozinha gera falso positivo:
 *
 *   - miolo de 4+ caracteres: sem isso, "tartar" ("tar"+"tar") e
 *     "arara" ("ar"+"ar") caem, e as duas sao palavras reais;
 *   - match total de 7+ caracteres: segunda trava contra "tartar";
 *   - sem \b no fim: em "eletletoes" a repeticao e seguida de "oes",
 *     e o \b final impedia o casamento — foi o bug da 1a versao, que
 *     deixava passar exatamente o caso medido em producao.
 */
const SILABA_REPETIDA = /(?<![a-zA-Zà-ú])([a-zà-ú]{4,})\1{1,}/gi;

/**
 * 2. COLISAO DE TOKENS — "deas", "parase", "entreas".
 *
 * Diferente do (1): aqui dois tokens PORTUGUESES distintos foram
 * colados sem espaco. Nao ha palavra valida com esse formato.
 *
 * A lista foi auditada contra as aulas REAIS do benchmark depois de
 * montada, e dois itens foram removidos por serem palavra de verdade:
 * "nossas" (feminino plural de "nosso") e "nesses" (plural de
 * "nesse") apareceram em texto legitimo de Portugues e teriam
 * reprovado a aula. Cada entrada precisa sobreviver a esse teste.
 */
const COLISOES = [
  "deas", "daas", "nosas", "pelasas", "pelasa", "parase", "deele",
  "deedele", "neleas", "eele", "essea", "entreas", "cadaas", "todases",
];

/**
 * 3. TEXTO CORTADO — o modelo acaba no meio da frase.
 *
 * LIMITACAO DECLARADA: o caso medido em producao foi "...naquela
 * molecula espec." — palavra truncada MAS com ponto final. Isso
 * nao e detectavel com seguranca sem dicionario: "espec", "logic",
 * "music" e "public" sao todos iguais para uma regra sem lexicon, e
 * uma heuristica que tentasse differentiate rejeitaria palavra
 * legitima. Conforme a regra da FASE C ("nao invente regra fragil"),
 * esse caso NAO e coberto e fica registrado como limitacao.
 *
 * O que fica coberto e o sinal inequivoco do mesmo defeito: texto
 * que termina SEM pontuacao final nenhuma, ou seja, a geracao
 * realmente parou no meio. A ultima palavra ainda e conferida: uma
 * cauda consoantica longa e rara em portugues reforça o diagnostico.
 */
const TERMINO_SEM_PONTUACAO = /[.!?:;"')\]]\s*$/;
const CAUDA_CONSONANTICA = /[bcdfghjklmnpqrstvwxyzç]{3,}$/i;

/**
 * 4. PONTUACAO QUEBRADA — "feita??", "valor!!!", "sim...".
 *
 * Dois sinais seguidos ou quatro pontos. Sinais UNICOS ("?!", "!!")
 * sao mantidos: podem ser legitimos e nao ha ganho em rejeitar.
 */
const PONTUACAO_QUEBRADA = /[?!]{2,}|\.{4,}/;

/** Normaliza para comparacao: minusculo e sem acento. */
const chave = (s) => String(s ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "");

/**
 * @param {string} texto
 * @param {{tamanhoMinimo?:number, exigirFimDeFrase?:boolean}} opcoes
 *        `exigirFimDeFrase` fica FALSO nos campos que sao frases
 *        curtas por natureza (commonMistakes, summary, title, answer).
 *        A 1a versao aplicava a regra em todo lugar e reprovava itens
 *        de lista legitimos que simplesmente nao levam ponto final.
 * @returns {string|null} descricao do problema, ou null
 */
export function detectarCorrupcao(texto, opcoes = {}) {
  const { tamanhoMinimo = 40, exigirFimDeFrase = true } = opcoes ?? {};
  const s = String(texto ?? "");
  if (s.length < tamanhoMinimo) return null;

  // (1) silaba repetida
  const silaba = s.match(SILABA_REPETIDA);
  if (silaba && silaba[0].length >= 7) {
    return `palavra corrompida (silaba repetida): "${silaba[0]}"`;
  }

  // (2) colisao de tokens
  const normal = chave(s);
  for (const colisao of COLISOES) {
    if (new RegExp(`\\b${colisao}\\b`).test(normal)) {
      return `palavra corrompida (tokens colados): "${colisao}"`;
    }
  }

  // (3) texto cortado no meio: nao ha pontuacao final nenhuma. E o
  // sinal mais direto de que a geracao parou antes da hora. So se
  // aplica a campos que DEVEM ser paragrafo fechado.
  if (exigirFimDeFrase && !TERMINO_SEM_PONTUACAO.test(s)) {
    const ultima = (s.trim().split(/\s+/).pop() ?? "");
    return `texto cortado no fim (sem pontuacao de fechamento): "${ultima}"`;
  }

  // (4) pontuacao quebrada
  const pont = s.match(PONTUACAO_QUEBRADA);
  if (pont) return `pontuacao quebrada: "${pont[0]}"`;

  return null;
}

/**
 * Varre a aula inteira e devolve a lista de problemas encontrados.
 * @param {object} aula
 * @returns {string[]}
 */
export function verificarTexto(aula) {
  const problemas = [];
  const secs = Array.isArray(aula?.sections) ? aula.sections : [];
  const gp = Array.isArray(aula?.guidedPractice) ? aula.guidedPractice : [];

  // PARAGRAFO: deve terminar com pontuacao, entao corte e sinal de
  // que a geracao parou no meio.
  const paragrafo = { tamanhoMinimo: 80, exigirFimDeFrase: true };
  // FRASE CURTA: item de lista, titulo ou resposta. Nao se exige
  // ponto final — "elemento e o tipo de atomo" sem ponto e normal.
  const curta = { tamanhoMinimo: 40, exigirFimDeFrase: false };

  const checar = (at, texto, opcoes) => {
    const achado = detectarCorrupcao(texto, opcoes);
    if (achado) problemas.push(`${at}: ${achado}`);
  };

  if (aula?.title) checar("title", aula.title, curta);
  if (aula?.introduction) checar("introduction", aula.introduction, paragrafo);
  secs.forEach((s, si) => {
    if (s?.title) checar(`sections[${si}].title`, s.title, curta);
    if (s?.explanation) checar(`sections[${si}].explanation`, s.explanation, paragrafo);
    (s?.examples ?? []).forEach((ex, ei) => {
      const at = `sections[${si}].examples[${ei}]`;
      if (ex?.problem) checar(`${at}.problem`, ex.problem, paragrafo);
      if (ex?.solution) checar(`${at}.solution`, ex.solution, paragrafo);
      if (ex?.explanation) checar(`${at}.explanation`, ex.explanation, paragrafo);
    });
  });
  gp.forEach((g, i) => {
    if (g?.question) checar(`guidedPractice[${i}].question`, g.question, paragrafo);
    if (g?.answer) checar(`guidedPractice[${i}].answer`, g.answer, curta);
    if (g?.explanation) checar(`guidedPractice[${i}].explanation`, g.explanation, paragrafo);
  });
  (aula?.commonMistakes ?? []).forEach((m, i) => checar(`commonMistakes[${i}]`, m, curta));
  (aula?.summary ?? []).forEach((m, i) => checar(`summary[${i}]`, m, curta));

  return problemas;
}