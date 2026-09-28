// Conteúdo completo da aula: explicação longa, imagens e quiz de 5 questões.

function hashSeed(text) {
  let hash = 0;
  const value = String(text || 'aula');
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 10000;
  }
  return Math.abs(hash);
}

export function getLessonImages(lesson) {
  const seed = hashSeed(lesson?.id || lesson?.topic);
  return [
    { src: `https://picsum.photos/seed/istudos-${seed}-1/900/520`, caption: `Visão geral: ${lesson?.topic || 'tema da aula'}` },
    { src: `https://picsum.photos/seed/istudos-${seed}-2/900/520`, caption: 'Exemplo visual passo a passo' },
    { src: `https://picsum.photos/seed/istudos-${seed}-3/900/520`, caption: 'Resumo ilustrado para revisar antes da prova' },
  ];
}

function baseSections(lesson) {
  const topic = lesson?.topic || 'este tema';
  const subject = lesson?.subject || 'Estudo';
  const objective = lesson?.objective || 'Compreender o conteúdo com segurança';
  const intro = lesson?.explanation || 'Nesta aula você vai construir a base do tema com calma.';

  return [
    {
      title: '1. Para começar: o que você vai aprender',
      paragraphs: [
        `${intro} O objetivo desta aula é: ${objective}. Vamos estudar "${topic}" de ${subject} como se fosse uma aula particular: primeiro a ideia geral, depois os detalhes, depois exemplos e por fim a revisão rápida.`,
        'Não tenha pressa. Leia cada parte, olhe as imagens e assista ao vídeo ao lado. O vídeo explica com voz e exemplos, e o texto abaixo aprofunda tudo o que o vídeo mostra.',
      ],
      bullets: [
        `Entender o que é ${topic} com palavras simples`,
        'Ver exemplos resolvidos passo a passo',
        'Evitar os erros mais comuns de prova',
        'Revisar tudo em 2 minutos antes do questionário',
      ],
    },
    {
      title: '2. Explicação completa do tema',
      paragraphs: [
        `Pense em "${topic}" como uma ferramenta que você vai usar em várias questões da prova da Etec. Tudo começa pela definição: trata-se de um conteúdo que conecta teoria e prática. Quando você entende o conceito central, as questões ficam previsíveis.`,
        'Vamos dividir em 3 ideias centrais. Primeira: o conceito — o que é, onde aparece e por que é cobrado. Segunda: a aplicação — como usar em exercícios, com números, textos ou situações do dia a dia. Terceira: a interpretação — como a banca costuma perguntar isso e como eliminar pegadinhas.',
        'Exemplo guiado: leia o enunciado com calma, sublinhe a pergunta final, volte ao texto ou aos dados, elimine duas alternativas absurdas e compare as duas restantes palavra por palavra.',
      ],
      bullets: [
        'Leia o enunciado até o fim antes de olhar as alternativas',
        'Sublinhe números, datas e palavras como "exceto" e "sempre"',
        'Elimine primeiro o que está claramente errado',
        'Confira sua resposta voltando ao texto ou ao cálculo',
      ],
    },
    {
      title: '3. Passo a passo com exemplos',
      paragraphs: [
        `Exemplo 1 — Nível básico: imagine uma questão direta sobre ${topic}. Você identifica o que foi pedido, busca a informação no lugar certo e responde sem rodeios.`,
        'Exemplo 2 — Nível intermediário: agora a questão mistura duas informações. Resolva em etapas: etapa A entende o contexto, etapa B faz a conta ou localiza o trecho, etapa C confere se a resposta faz sentido.',
        'Exemplo 3 — Nível prova Etec: a banca adora contextualizar com uma historinha do dia a dia. Sua tarefa é traduzir a historinha para o conteúdo.',
      ],
      bullets: [
        'Básico: identificar e responder direto',
        'Intermediário: dividir em 2 a 3 etapas',
        'Avançado/Etec: traduzir o contexto para o conteúdo',
      ],
    },
    {
      title: '4. Erros mais comuns (e como evitá-los)',
      paragraphs: [
        'Erro 1: responder rápido demais sem ler todas as alternativas. A letra A parece certa, mas a D pode estar mais completa.',
        'Erro 2: confundir conceitos parecidos. Anote lado a lado as diferenças: causa x consequência, fração x porcentagem, fato x opinião.',
        'Erro 3: errar conta boba por pressa. Refaça a conta de trás para frente quando sobrar tempo.',
      ],
      bullets: [
        'Sempre leia as 4 alternativas antes de marcar',
        'Anote a diferença entre conceitos parecidos',
        'Reserve 30 segundos para revisar a questão',
      ],
    },
    {
      title: '5. Resumo relâmpago para a prova',
      paragraphs: [
        `Se só restarem 2 minutos: lembre que "${topic}" cobra ${objective.toLowerCase()}. Volte às imagens desta página e releia os 3 passos (entender, aplicar, revisar).`,
        'Você consegue! Cada aula concluída mantém sua sequência e soma XP. O questionário a seguir tem 5 questões sobre exatamente o que você acabou de estudar.',
      ],
      bullets: [
        'Conceito central na ponta da língua',
        'Método: ler, sublinhar, eliminar, conferir',
        'Revisão final nas imagens e no vídeo',
      ],
    },
  ];
}

// Se a aula já tem texto manual (sections/images), usa ele.
// Senão, gera um modelo automático para não quebrar a página.

export function getLessonDetail(lesson) {
  if (!lesson) return null;
  if (lesson.sections?.length) {
    return { sections: lesson.sections, images: lesson.images || [] };
  }
  return { sections: baseSections(lesson), images: getLessonImages(lesson) };
}
