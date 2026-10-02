// ============================================================
// IMAGENS DE AULA — nenhuma.
//
// Havia aqui um getLessonImages() que montava tres URLs do picsum.photos
// com seed derivada do id da aula e legendas como "Exemplo visual passo
// a passo". Isso NAO era imagem da aula: era uma foto aleatoria de
// qualquer coisa. Para a aluna da para entender matematicamente e
// apareciam tres fotos que so ela sabia que nao tinham relacao com
// fracao, decimal, "as vegas do Amazonas" ou historia do Brasil.
//
// Um servico que devolve imagem aleatoria nao melhora a aula: confunde.
// Fotos inventadas:
//
//   Aula gerada por IA ....... images: [] (já era assim)
//   Aula manual .............. só com imagem real e declarada
//   Sem imagem relevante .... nenhuma
//
// Nao existe mais nenhuma origem de imagem sintetica aqui. Se um dia
// houver uma imagem realmente utile, ela entra como asset do projeto
// ou vem dentro do lesson_data gerado — nunca por seed.
// ============================================================


// Se a aula já tem texto manual (sections/images), usa ele.
// Senão, gera um modelo automático para não quebrar a página.

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// --- Traducao da aula gerada pela IA para o formato da tela -----------------
// O generate-lesson devolve exatamente isto (validateLesson em
// supabase/functions/_shared/schemas.js):
//   sections: [{ title, explanation, examples: [{ problem, solution, explanation }] }]
//   guidedPractice: [{ question, hint, answer, explanation }]
//   objectives / commonMistakes / summary: ["texto", ...]
// A tela (GeneratedStudy, em LessonPage.jsx) le { title, paragraphs[], bullets[], examples[] }.
// Estes helpers sao a unica ponte entre as duas pontas: padronizam as chaves e nao
// deixam null, objeto ou string vazia chegar no JSX - inclusive quando o cache local
// ou o app_state de outro aparelho guarda um formato mais antigo.

function textList(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return [item.mistake, item.fix, item.text, item.point, item.title]
          .filter((part) => typeof part === 'string' && part.trim())
          .join(' — ');
      }
      return '';
    })
    .filter(Boolean);
}

function normalizeExamples(examples) {
  return (Array.isArray(examples) ? examples : [])
    .map((raw) => {
      const example = raw && typeof raw === 'object' ? raw : {};
      const problem = firstText(example.problem, example.question, example.statement);
      const solution = firstText(example.solution, example.resolution, example.answer);
      const explanation = firstText(example.explanation, example.why);
      if (!problem && !solution) return null;
      return { problem, solution, explanation };
    })
    .filter(Boolean);
}

function normalizeGeneratedSections(sections, lesson) {
  const list = (Array.isArray(sections) ? sections : [])
    .map((raw) => {
      const section = raw && typeof raw === 'object' ? raw : {};
      // A IA manda "explanation"; "paragraphs"/"content" sao variantes de cache antigo.
      const paragraphs = []
        .concat(Array.isArray(section.paragraphs) ? section.paragraphs : [])
        .concat(section.explanation ? [section.explanation] : [])
        .concat(section.content ? [section.content] : [])
        .map((paragraph) => (typeof paragraph === 'string' ? paragraph.trim() : ''))
        .filter(Boolean);
      return {
        title: firstText(section.title) || 'Parte da aula',
        paragraphs,
        bullets: textList(section.bullets === undefined ? section.keyPoints : section.bullets),
        examples: normalizeExamples(section.examples),
      };
    })
    .filter(
      (section) => section.paragraphs.length || section.bullets.length || section.examples.length,
    );
  // Veio sem nenhuma secao aproveitavel? Nao inventamos substituto.
  // Uma secao vazia e o que diz a interface para mostrar o estado de
  // "aula ainda nao disponivel" com o botao Tentar novamente. Texto
  // generico aqui fazia uma aula que a IA nao escreveu parecer
  // inteira — com o titulo certo e o conteudo errado.
  return list;
}

function normalizeGeneratedPractice(practice) {
  return (Array.isArray(practice) ? practice : [])
    .map((raw) => {
      const item = raw && typeof raw === 'object' ? raw : {};
      const question = firstText(item.question, item.prompt);
      if (!question) return null;
      return {
        question,
        hint: firstText(item.hint, item.tip),
        answer: firstText(item.answer),
        explanation: firstText(item.explanation),
      };
    })
    .filter((item) => Boolean(item) && Boolean(item.answer || item.explanation));
}

export function getLessonDetail(lesson) {
  if (!lesson) return null;
  // 0. Aula escrita pela IA (generate-lesson): ela ja vem pronta, nada de texto generico.
  if (lesson.generated) {
    return {
      generated: true,
      lessonId: lesson.lessonId ?? null,
      model: lesson.model ?? null,
      title: firstText(lesson.title),
      objectives: textList(lesson.objectives),
      introduction: firstText(lesson.introduction),
      sections: normalizeGeneratedSections(lesson.sections, lesson),
      guidedPractice: normalizeGeneratedPractice(lesson.guidedPractice),
      commonMistakes: textList(lesson.commonMistakes),
      summary: textList(lesson.summary),
      images: [],
    };
  }
  // 1. Aula com texto cadastrado a mao.
  if (lesson.sections?.length) {
    // Imagem so entra se veio declarada e for de verdade: aqui nao ha
    // mais nenhuma geracao de URL.
    const imagens = Array.isArray(lesson.images)
      ? lesson.images.filter((img) => img && typeof img.src === "string" && img.src.trim())
      : [];
    return { sections: lesson.sections, images: imagens };
  }
  // 2. Sem conteudo real. `generated: false` + secoes vazias e o
  // sinal para a LessonPage mostrar o estado de indisponibilidade em
  // vez de um texto generico com o titulo da aula em cima.
  return { generated: false, sections: [], images: [] };
}
