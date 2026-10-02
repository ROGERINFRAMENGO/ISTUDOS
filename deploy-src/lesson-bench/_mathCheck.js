// ============================================================
// MATEMATICA DETERMINISTICA
// ------------------------------------------------------------
// A FASE B mediu um erro real que TODAS as heuristicas deixam
// passar: o modelo respondeu "Resolva 45 * (-9)" com "-5".
// O numero esta errado (-405), mas a resposta e a explicacao
// concordavam entre si, entao a checagem de coerencia via.
//
// Aqui a conta e refeita de verdade. O ponto central e SEGURANCA:
// nada de eval(), nada de Function(), nada de interpretador geral.
// Existe um parser proprio que so reconhece um subconjunto
// fechado de expressoes aritmeticas. Qualquer coisa fora desse
// subconjunto NAO e interpretada e NAO bloqueia a aula, porque
// reprovar uma aula correta por ser complexa seria pior que o
// erro que queremos pegar.
//
// Subconjunto aceito:
//   numeros inteiros ou decimais (ponto como separador)
//   + - * / ( ) e os operadores unicode × ÷ ·
//   sinal unario no inicio e apos "(" ou um operador
//
// Rejeitado de proposito (=> verificado = null, sem erro):
//   virgula decimal    "1.234,56" (ambiguo com separador de milhar)
//   potencia, raiz, log "2^3", "raiz"
//   porcentagem, moeda "10%", "R$ 5"
//   notacao cientifica "1e5"
//   unidades coladas   "45min", "18h"
//   texto do enunciado "de 3 a 5"
//
// Uso: verificarAula(aula) devolve uma lista de strings.
//      Lista vazia = nada a reclamar. Sem throw, sem I/O.
// ============================================================

// Alfabeto fechado do parser. Qualquer caractere fora daqui faz a
// expressao ser descartada em vez de interpretada.
const CARACTERES = /^[0-9+\-*/().\s\u00d7\u00f7\u00b7]+$/;

/**
 * Parser de expressao aritmetica por descendencia recursiva.
 * Nao aceita nada alem de numero, operador binario, sinal unario e
 * parenteses. Devolve number|null (null = nao suportado).
 */
export function avaliarExpressao(texto) {
  const src = String(texto ?? "").trim();
  if (!src || src.length > 60) return null;
  if (!CARACTERES.test(src)) return null;
  if (src.includes(",")) return null;                 // separador de milhar ambiguo
  if (/[eE^%]/.test(src)) return null;               // cientifica, potencia, porcento

  const s = src.replace(/\u00d7/g, "*").replace(/\u00f7/g, "/").replace(/\u00b7/g, "*");
  let i = 0;

  const pularEspaco = () => { while (i < s.length && /\s/.test(s[i])) i += 1; };
  const olhou = () => { pularEspaco(); return i < s.length ? s[i] : null; };

  function numero() {
    pularEspaco();
    const inicio = i;
    while (i < s.length && /\d/.test(s[i])) i += 1;
    if (s[i] === ".") {
      i += 1;
      while (i < s.length && /\d/.test(s[i])) i += 1;
    }
    if (i === inicio) return null;
    const bruto = s.slice(inicio, i);
    if (bruto === "." || (bruto.match(/\./g) ?? []).length > 1) return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  }

  function primario() {
    const c = olhou();
    if (c === null) return null;
    if (c === "(") {
      i += 1;
      const v = expressao();
      if (olhou() !== ")") return null;
      i += 1;
      return v;
    }
    if (c === "-" || c === "+") {                    // sinal unario
      i += 1;
      const v = primario();
      if (v === null) return null;
      return c === "-" ? -v : v;
    }
    if (/[0-9]/.test(c)) return numero();
    return null;
  }

  function termo() {
    let v = primario();
    if (v === null) return null;
    for (;;) {
      const c = olhou();
      if (c !== "*" && c !== "/") return v;
      i += 1;
      const d = primario();
      if (d === null) return null;
      if (c === "*") v *= d;
      else {
        if (d === 0) return null;                    // divisao por zero: nao verificavel
        v /= d;
      }
    }
  }

  function expressao() {
    let v = termo();
    if (v === null) return null;
    for (;;) {
      const c = olhou();
      if (c !== "+" && c !== "-") return v;
      i += 1;
      const d = termo();
      if (d === null) return null;
      v = c === "+" ? v + d : v - d;
    }
  }

  const resultado = expressao();
  pularEspaco();
  if (i !== s.length) return null;                   // sobrou caractere
  if (resultado === null || !Number.isFinite(resultado)) return null;
  return resultado;
}
// Numero "puro" do lado do resultado: -7, 24, 2.5, +3.
const RESULTADO_NUMERICO = /^[+-]?\d+(?:\.\d{1,2})?$/;
const CHARS_EXPR = /[0-9+\-*/().\s\u00d7\u00f7\u00b7]/;
const EH_OPERADOR = (c) => c === "+" || c === "-" || c === "*" || c === "/"
  || c === "\u00d7" || c === "\u00f7" || c === "\u00b7";
const PONCTUACAO_FINAL = /[.,;:!?)\]\s]/;
const TAMANHO_MAX_EXPR = 48;

/**
 * Scanner de expressoes. Devolve um array de CANDIDATOS crus, na ordem
 * em que aparecem no texto.
 *
 * A primeira versao usou regex com quantificador lazy e falhou: o
 * lazy parava no minimo e devolvia "45" em vez de "45 * (-9)", e o
 * sinal unario inicial ficava de fora, fazendo "-12 + 5" virar
 * "12 + 5". Um scanner por caractere nao sofre dos dois problemas e
 * deixa o comportamento explicavel.
 *
 * O inicio de um candidato pode ser "(", "-" ou um digito, para que
 * "(-12) + 5" e "-12 + 5" comecem no lugar certo.
 */
function acharCandidatos(texto) {
  const s = String(texto ?? "");
  const achados = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    // ate 2 caracteres de abertura: "(" seguido de "-" (ou o inverso).
    // Com apenas 1, "(-10) + 6" comecava no "-" e produzia "-10) + 6",
    // que nao fecha parenteses e ficava sem parse — a conta real da
    // FASE B escapava.
    let abertura = 0;
    while (j < s.length && (s[j] === "(" || s[j] === "-") && abertura < 2) { j += 1; abertura += 1; }
    if (!/\d/.test(s[j] ?? "")) { i += 1; continue; }
    const inicio = i;
    while (j < s.length && CHARS_EXPR.test(s[j]) && (j - inicio) < TAMANHO_MAX_EXPR) j += 1;
    achados.push(s.slice(inicio, j));
    i = j > inicio ? j : i + 1;
  }
  return achados;
}

/** Remove pontuacao do fim, que nunca faz parte da conta. */
function aparar(bruto) {
  let s = String(bruto ?? "").trim();
  while (s.length && PONCTUACAO_FINAL.test(s[s.length - 1])) s = s.slice(0, -1).trim();
  return s;
}

/**
 * Resolve um candidato: tenta avaliar e, se ainda nao parsear, vai
 * removendo um caractere do FIM ate conseguir — mas para assim que o
 * ultimo caractere for digito, para nunca comer digito da conta.
 *
 * A primeira versao cortava pontuacao de forma cega e destruia o
 * balanceamento: "45 * (-9)." virava "45 * (-9" e deixava de
 * parsear, entao o erro real passava. Aqui o ")" sobrevive porque a
 * tentativa completa ja funciona.
 */
function tentarAvaliar(bruto) {
  let s = String(bruto ?? "").trim();
  for (let k = 0; k < 10; k += 1) {
    if (!s) return null;
    const valor = avaliarExpressao(s);
    if (valor !== null) return { expressao: s, valor };
    if (/\d/.test(s[s.length - 1])) return null;   // acabou no digito: nao corta mais
    s = s.slice(0, -1).trim();
  }
  return null;
}

/** Tem operador BINARIO? O sinal inicial nao conta. */
const temOperadorBinario = (texto) =>
  String(texto ?? "").replace(/^[-+]\s*/, "").split("").some(EH_OPERADOR);

/**
 * Candidatos que SAO expressoes aritmeticas verificaveis.
 * "2026" sozinho e "de 3 a 5" nao entram: sem operador entre digitos.
 *
 * O sinal inicial nao conta como operador. Sem essa distincao, o
 * "x" de "(-2) x (-5)" — que fica FORA do subconjunto — quebrava a
 * expressao e sobrava o candidato "-5", que e um numero simples e
 * passing como se fosse conta. Resultado: a aula de matematica
 * correta era reprovada.
 *
 * LIMITACAO CONHECIDA E ACEITA: "Some 12 e 8" nao e verificavel, porque
 * a palavra "e" quebra a expressao e o scanner nao faz parsing de
 * linguagem natural. Sem conta reconhecida => nao bloqueia.
 */
function expressoesValidas(texto) {
  const achados = [];
  for (const bruto of acharCandidatos(texto)) {
    if (!temOperadorBinario(aparar(bruto))) continue;
    const resolvida = tentarAvaliar(bruto);
    if (resolvida) achados.push({ ...resolvida, bruto });
  }
  return achados;
}

/** A expressao ocupa o resto do texto, ignorando pontuacao e espaco? */
function terminaNoFim(texto, bruto) {
  const s = String(texto ?? "");
  const pos = s.lastIndexOf(bruto);
  if (pos < 0) return false;
  const resto = s.slice(pos + bruto.length).replace(/[\s.,;:!?)]/g, "");
  return resto === "";
}

/**
 * Extrai pares "expressao = resultado" de um texto.
 * O resultado e aceito so quando e numero limpo, o que mantem datas
 * e horas fora da fila.
 */
function paresComIgual(texto) {
  const s = String(texto ?? "");
  const achados = [];
  for (const bruto of acharCandidatos(s)) {
    const expr = aparar(bruto);
    if (!expr || !temOperadorBinario(expr)) continue;
    // o que vem logo depois da expressao?
    const resto = s.slice(s.indexOf(bruto, 0) + bruto.length);
    const igual = resto.match(/^\s*=\s*([+-]?\d+(?:\.\d{1,2})?)/);
    if (!igual) continue;
    // Virgula decimal brasileira: "18/4=4,5" leria "4" e acusaria
    // 18/4 de dar 4. O resultado de um numero com virgula NAO entra
    // na verificacao — e o limite de seguranca do avaliador.
    const depois = resto.slice(igual[0].length);
    if (/^,\d/.test(depois)) continue;
    achados.push({ expressao: expr, resultado: igual[1] });
  }
  return achados;
}

const iguais = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Verifica uma tripla {enunciado, resposta, explicacao}.
 * @returns {string|null} mensagem de erro, ou null se nada a reclamar
 */
function conferirConta({ at, enunciado = "", resposta = "", explicacao = "" }) {
  // (1) "(-12) + 5 = -7" escrito dentro de um dos textos.
  for (const texto of [enunciado, resposta, explicacao]) {
    for (const par of paresComIgual(texto)) {
      const obtido = avaliarExpressao(par.expressao);
      if (obtido === null) continue;                  // fora do subconjunto
      const declarado = Number(par.resultado);
      if (!iguais(obtido, declarado)) {
        return `${at}: a conta "${par.expressao}" vale ${obtido}, e nao ${par.resultado}`;
      }
    }
  }

  // (2) conta solta no enunciado + resposta numerica.
  //     "Resolva 45 * (-9)." com resposta "-5" => vale -405.
  //
  // As tres condicoes ja sao estreitas o bastante: UMA expressao no
  // enunciado, dentro do subconjunto seguro, e resposta que e um
  // numero puro. Nao ha guarda extra aqui de proposito. A primeira
  // versao pulava o erro quando a resposta aparecia na explicacao
  // ("o resultado e -5") — e era exatamente assim que o erro real
  // chegava ao site, entao o guarda nao protegia nada: so desligava
  // a regra.
  const limpo = String(resposta ?? "").trim();
  if (!RESULTADO_NUMERICO.test(limpo)) return null;
  const contas = expressoesValidas(enunciado);
  if (contas.length !== 1) return null;               // com varias, nao sabemos qual
  // A expressao precisa ser a ULTIMA coisa do enunciado. Caso
  // contrario, existe outra operacao depois dela que o scanner nao
  // viu, e comparar o resultado parcial com a resposta final da
  // errado. Medido numa aula real: "Calcule: (-6 + 2) x 2" com
  // resposta "-8". O "x" fica fora do subconjunto, o scanner achava
  // só "(-6 + 2)" = -4, e acusava -8 de errado — quando -8 esta
  // CERTO (-6+2 = -4, e -4 x 2 = -8).
  if (!terminaNoFim(enunciado, contas[0].bruto)) return null;
  const obtido = contas[0].valor;
  if (iguais(obtido, Number(limpo))) return null;
  return `${at}: "${contas[0].expressao}" vale ${obtido}, mas a resposta e "${limpo}"`;
}

/**
 * Ponto de entrada usado por validateLesson().
 * @param {object} aula  a aula normalizada
 * @returns {string[]}   lista de problemas encontrados
 */
export function verificarAula(aula) {
  const problemas = [];
  const secs = Array.isArray(aula?.sections) ? aula.sections : [];
  const gp = Array.isArray(aula?.guidedPractice) ? aula.guidedPractice : [];

  secs.forEach((s, si) => {
    (s?.examples ?? []).forEach((ex, ei) => {
      const msg = conferirConta({
        at: `sections[${si}].examples[${ei}]`,
        enunciado: ex?.problem, resposta: ex?.solution, explicacao: ex?.explanation,
      });
      if (msg) problemas.push(msg);
    });
  });

  gp.forEach((g, i) => {
    const msg = conferirConta({
      at: `guidedPractice[${i}]`,
      enunciado: g?.question, resposta: g?.answer, explicacao: g?.explanation,
    });
    if (msg) problemas.push(msg);
  });

  return problemas;
}