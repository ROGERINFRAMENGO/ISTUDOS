// ============================================================
// IMAGENS E VIDEO: SO O QUE E REAL
// ------------------------------------------------------------
// Filtro unico de imagem/video do ISTUDOS.
//
// `src/data/lessons.js` ainda traz duas aulas como TEMPLATE de
// edicao, com `COLE_AQUI_LINK_IMAGEM_1`,
// `COLE_AQUI_O_LINK_EMBED_DO_YOUTUBE` e "COLE AQUI sua explicacao".
// Uma delas e a de Fracoes -- a que o painel oferece para retomar.
//
// Sem o filtro, a tela renderiza `<img src="COLE_AQUI_LINK_IMAGEM_1">`:
// imagem quebrada com legenda mintindo ("Visao geral: fracoes e
// decimais") sobre algo que nao existe.
//
// Regra: marcador de edicao nao e conteudo. Sem imagem real, a aula
// fica so textual -- melhor que imagem quebrada.
//
// Fica num modulo .js proprio (e nao dentro do .jsx) por dois motivos:
// e o unico caminho por onde passam aulas do cronograma, do cache e do
// gerador; e assim o tools/verificar-imagens.mjs importa e testa sem
// precisar compilar JSX.
// ============================================================

export const MARCADOR_EDICAO = /COLE[\s_]AQUI|SEU[\s_]LINK|TODO:|\{\{|\}\}/i;

/** Uma URL so vale se for http(s) de verdade e nao for marcador. */
export function urlReal(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';
  if (MARCADOR_EDICAO.test(texto)) return '';
  if (!/^https?:\/\//i.test(texto)) return '';
  return texto;
}

/**
 * Imagens reais de uma aula.
 *
 * Descarta placeholder, o que nao e URL e o que nao parece imagem --
 * o `videoUrl` entrava na lista e virava <img>.
 */
export function imagensReais(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((item) => {
      const src = urlReal(typeof item === 'string' ? item : item?.src);
      if (!src) return null;
      if (!/\.(jpe?g|png|webp|gif|avif|svg)(\?|#|$)/i.test(src)) return null;
      return { src, caption: String(item?.caption ?? '') };
    })
    .filter(Boolean);
}