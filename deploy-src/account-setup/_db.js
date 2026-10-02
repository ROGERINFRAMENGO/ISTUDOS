// ============================================================
// Acesso ao banco DENTRO das Edge Functions.
// ------------------------------------------------------------
// Usa SEMPRE o JWT de quem chamou (via PostgREST), entao o RLS continua
// valendo: cada usuario enxerga apenas as proprias linhas. service_role
// nao e usado em lugar nenhum.
// ============================================================

export class DbError extends Error {
  constructor(message, { status = 0, detail = "" } = {}) {
    super(message);
    this.name = "DbError";
    this.status = status;
    this.detail = detail;
  }
}

const LESSONS_TABLE = "generated_lessons";
const QUIZZES_TABLE = "generated_quizzes";
// FINALIZACAO 2: o estado compartilhado (a linha unica que a aluna
// usa para sincronizar computador e celular).
const STATE_TABLE = "app_state";
const TUTOR_CONVERSATIONS_TABLE = "tutor_conversations";
const TUTOR_MESSAGES_TABLE = "tutor_messages";
export { STATE_TABLE };

/**
 * Chave logica da aula: abrir a mesma aula de novo nunca gera outra.
 * O BLOCO entra na chave porque cada dia do cronograma tem dois blocos
 * (55min + 55min) e eles sao aulas diferentes.
 */
/**
 * Versao do CONTEUDO gerado pela IA. Entra na chave do cache junto com
 * a versao do curriculo.
 *
 * Prioridade 1 (30/09/2026): o prompt da aula e o validateLesson()
 * mudaram (proibicao de metadado do cronograma, defesa de coerencia,
 * profundidade maior). As 25 aulas ja gravadas foram feitas com o
 * prompt antigo e contem erros conhecidos. Bump nesta constante faz
 * TODAS elas serem tratadas como cache miss e regeradas, sem apagar
 * nada: progresso, conclusao, respostas, XP e historico ficam intactos,
 * porque nao vivem em generated_lessons.
 *
 * O CLIENTE (src/services/ai.js) tem a MESMA constante. Se as duas
 * divergirem, o app pede uma aula com a chave antiga, a Edge Function
 * responde com a chave nova e o cache local fica inutil.
 */
export const LESSON_CONTENT_VERSION = "p1-aulas-2026-09-30";

/**
 * Chave logica da aula: abrir a mesma aula de novo nunca gera outra.
 * O BLOCO entra na chave porque cada dia do cronograma tem dois blocos
 * (55min + 55min) e eles sao aulas diferentes.
 */
export function lessonCacheKey({ curriculumVersion = "v1", week, day, dateKey, block, subject, topic }) {
  return [
    String(curriculumVersion || "v1"),
    LESSON_CONTENT_VERSION,
    String(week ?? "?"),
    String(dateKey ?? day ?? "?"),
    `b${Number(block) || 1}`,
    String(subject ?? "").toLowerCase().trim(),
    String(topic ?? "").toLowerCase().trim(),
  ].join("|");
}

export function createDb({ url, anonKey, token }) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function request(path, { method = "GET", query = "", body, prefer } = {}) {
    let response;
    try {
      response = await fetch(`${url}/rest/v1/${path}${query}`, {
        method,
        headers: prefer ? { ...headers, Prefer: prefer } : headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new DbError("db_network_error", { detail: String(error?.message ?? error) });
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // resposta vazia
      }
    }
    if (!response.ok) {
      throw new DbError(`db_${response.status}`, {
        status: response.status,
        detail: String(data?.message ?? text).slice(0, 300),
      });
    }
    return data;
  }

  const select = (table, columns, filters) =>
    request(table, { query: `?${new URLSearchParams({ select: columns, ...filters }).toString()}` });

  return {
    /** Aula ja gerada para esta chave do curriculo. */
    async findLesson(cacheKey) {
      const rows = await select(LESSONS_TABLE, "*", { cache_key: `eq.${cacheKey}`, limit: "1" });
      return rows?.[0] ?? null;
    },

    /** Aula pelo id (o RLS so deixa achar a aula do proprio usuario). */
    async findLessonById(id) {
      const rows = await select(LESSONS_TABLE, "*", { id: `eq.${id}`, limit: "1" });
      return rows?.[0] ?? null;
    },

    /** Grava a aula. O user_id e o do token, nunca o do body. */
    async saveLesson({ userId, cacheKey, curriculumVersion, week, day, dateKey, subject, topic, lessonData, model, kind = "curriculum", customPrompt = null, customSubject = null, customLevel = null, customStyle = null }) {
      const rows = await request(LESSONS_TABLE, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        body: {
          user_id: userId,
          cache_key: cacheKey,
          curriculum_version: curriculumVersion,
          week: week ?? null,
          day: day ?? null,
          date_key: dateKey ?? null,
          subject,
          topic,
          lesson_data: lessonData,
          model,
          // FASE D: o discriminador que separa aula personalizada de
          // aula do cronograma. Default 'curriculum' mantem o
          // comportamento antigo sem tocar nas linhas existentes.
          kind,
          custom_prompt: customPrompt,
          custom_subject: customSubject,
          custom_level: customLevel,
          custom_style: customStyle,
        },
      });
      return rows?.[0] ?? null;
    },

    /**
     * FASE D: "Minhas aulas".
     *
     * O RLS ja restringe a auth.uid() = user_id, entao a lista so
     * pode devolver linhas da propria estudante — nao ha filtro de
     * user_id aqui de proposito: seria redundante e passaria a
     * impressao de que o isolamento depende do codigo, quando quem
     * garante e o banco.
     */
    async listCustomLessons(limit = 100) {
      const rows = await select(LESSONS_TABLE, "id,subject,topic,lesson_data,model,custom_prompt,custom_level,custom_style,created_at", {
        kind: "eq.custom",
        order: "created_at.desc",
        limit: String(limit),
      });
      return rows ?? [];
    },

    /** FASE FINALIZACAO 2: exclui uma aula personalizada. */
    async deleteLesson(id) {
      const rows = await request(`${LESSONS_TABLE}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        prefer: "return=representation",
      });
      return rows?.[0] ?? null;
    },

    /**
     * Vincula a linha de estado a uma conta permanente.
     *
     * O `.is(owner_id, null)` e o que torna isto SEGURO: so escreve
     * se a linha AINDA nao tem dono. Duas contas tentandoclaimed ao
     * mesmo tempo — uma ganha, a outra recebe 0 linhas e sabe que
     * perdeu. Sem esse filtro, a segunda conta sobrescreveria o dono
     * e passaria a ler o estado da outra.
     *
     * @returns {"vinculado"|"ja_e_meu"|"nao_existe"|"ja_tem_outro_dono"}
     */
    async vincularDono(rowId, userId) {
      const rows = await request(
        `${STATE_TABLE}?id=eq.${encodeURIComponent(rowId)}&owner_id=is.null`,
        {
          method: "PATCH",
          prefer: "return=representation",
          body: { owner_id: userId },
        },
      );
      if (rows?.length) return "vinculado";

      // Nao vinculou. Descobre se ja e meu, ou se e de outra conta.
      const atual = await request(`${STATE_TABLE}?id=eq.${encodeURIComponent(rowId)}&select=owner_id`, {
        method: "GET",
      });
      if (!atual?.length) return "nao_existe";
      return atual[0].owner_id === userId ? "ja_e_meu" : "ja_tem_outro_dono";
    },

    async findQuiz(lessonId, difficulty) {
      const rows = await select(QUIZZES_TABLE, "*", {
        lesson_id: `eq.${lessonId}`,
        difficulty: `eq.${difficulty}`,
        limit: "1",
      });
      return rows?.[0] ?? null;
    },

    /**
     * Grava o quiz de (aula, dificuldade).
     *
     * FASE A: o `on_conflict` passou a ser explicito. Sem ele, o
     * `Prefer: resolution=merge-duplicates` nao tem como saber qual
     * coluna causa o conflito e o PostgREST devolve 409 "duplicate key
     * value violates unique constraint". Na pratica, isso fazia a
     * gravacao falhar sempre que ja existia um quiz para a mesma
     * aula e dificuldade — ou seja, justamente no caso em que o
     * quiz precisa ser regerado depois de um bump de versao. A
     * aula continuava funcionando, mas nada era gravado e a aluna
     * pagava uma nova geracao toda vez que abria a mesma aula.
     *
     * Sobrescrever aqui e seguro: a versao do conteudo ja foi
     * conferida antes de gerar, e as tentativas antigas da aluna nao
     * vivem nesta tabela (vivem em question_attempts).
     */
    async saveQuiz({ userId, lessonId, subject, topic, difficulty, quizData, model }) {
      const rows = await request(QUIZZES_TABLE, {
        method: "POST",
        query: "?on_conflict=lesson_id,difficulty",
        prefer: "resolution=merge-duplicates,return=representation",
        body: { user_id: userId, lesson_id: lessonId, subject, topic, difficulty, quiz_data: quizData, model },
      });
      return rows?.[0] ?? null;
    },

    /** Tentativas de questao mais recentes (base do desempenho real). */
    async recentAttempts(limit = 400) {
      const rows = await select("question_attempts", "subject,topic,difficulty,correct,created_at,question_id", {
        order: "created_at.desc",
        limit: String(limit),
      });
      return rows ?? [];
    },

    async progressRow() {
      const rows = await select("student_progress", "*", { limit: "1" });
      return rows?.[0] ?? null;
    },

    async completedLessonIds(limit = 500) {
      const rows = await select("lesson_progress", "lesson_id", {
        completed: "eq.true",
        order: "completed_at.desc",
        limit: String(limit),
      });
      return (rows ?? []).map((row) => row.lesson_id);
    },

    // -------------------------------------------------------
    // Tutor IA (FASE 2) — historico do chat
    // -------------------------------------------------------

    /**
     * Conversa ativa do usuario para (materia, tema). O indice unique
     * garante uma so: reabrir o chat na mesma aula nao duplica. Fora
     * da aula, subject/topic vazios = conversa geral.
     */
    async findOrCreateConversation({ userId, subject = "", topic = "", title, lessonId = null }) {
      const filtros = {
        user_id: `eq.${userId}`,
        subject: subject ? `eq.${subject}` : "is.null",
        topic: topic ? `eq.${topic}` : "is.null",
        limit: "1",
      };
      const existente = (await select(TUTOR_CONVERSATIONS_TABLE, "id,title,subject,topic", filtros))?.[0];
      if (existente) return existente;

      // Duas abas podem chegar juntas: o unique index segura, entao
      // tentamos inserir e, se falhar, releemos a que ficou.
      //
      // CUIDADO com o Prefer: "ignore-duplicates" faz o PostgREST
      // devolver 201 com corpo VAZIO quando a linha ja existe. Por isso
      // o insert usa "return=representation" SEM ignore-duplicates: se
      // duplicar, o proprio banco responde 409 e a gente releem a linha
      // que ficou - que e exatamente o que o teste de contexto exige.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        let criadas = null;
        try {
          criadas = await request(TUTOR_CONVERSATIONS_TABLE, {
            method: "POST", prefer: "return=representation",
            body: {
              user_id: userId,
              title: String(title || topic || subject || "Conversa com a Tutora").slice(0, 90),
              subject: subject || null,
              topic: topic || null,
              lesson_id: lessonId ?? null,
            },
          });
        } catch (error) {
          // 409 = ja existia (indice unico). Nao e falha: seguimos.
          if (error?.status !== 409) throw error;
        }
        if (criadas?.[0]) return criadas[0];
        const again = (await select(TUTOR_CONVERSATIONS_TABLE, "id,title,subject,topic", filtros))?.[0];
        if (again) return again;
      }
      return null;
    },

    async listConversations(userId, limit = 20) {
      const rows = await select(TUTOR_CONVERSATIONS_TABLE, "id,title,subject,topic,updated_at", {
        user_id: `eq.${userId}`, order: "updated_at.desc", limit: String(limit),
      });
      return rows ?? [];
    },

    async recentMessages(conversationId, limit = 40) {
      const rows = await select(TUTOR_MESSAGES_TABLE, "id,role,content,model,created_at", {
        conversation_id: `eq.${conversationId}`, order: "created_at.asc", limit: String(limit),
      });
      return rows ?? [];
    },

    /** Grava a mensagem. O user_id vem do token, nunca do body. */
    async saveMessage({ userId, conversationId, role, content, model = null }) {
      const rows = await request(TUTOR_MESSAGES_TABLE, {
        method: "POST", prefer: "return=representation",
        body: { user_id: userId, conversation_id: conversationId, role, content, model },
      });
      // Mantem a conversa no topo do historico.
      await request(TUTOR_CONVERSATIONS_TABLE, {
        method: "PATCH", query: `?id=eq.${conversationId}`,
        body: { updated_at: new Date().toISOString() },
      });
      return rows?.[0] ?? null;
    },

    async deleteConversation({ userId, conversationId }) {
      return request(TUTOR_CONVERSATIONS_TABLE, {
        method: "DELETE", query: `?id=eq.${conversationId}&user_id=eq.${userId}`,
      });
    },
  };
}

function accuracy(rows) {
  if (!rows.length) return null;
  return rows.filter((row) => row.correct).length / rows.length;
}

/**
 * Transforma tentativas reais em contexto de desempenho para a IA.
 * Nunca inventa numero: quando nao ha dado, devolve null.
 */
export function buildPerformance(attempts, { subject, topic } = {}) {
  const sameText = (a, b) => String(a ?? "").toLowerCase().trim() === String(b ?? "").toLowerCase().trim();
  const topicRows = topic ? attempts.filter((row) => sameText(row.topic, topic)) : [];
  const subjectRows = subject ? attempts.filter((row) => sameText(row.subject, subject)) : [];

  const byTopic = new Map();
  attempts.forEach((row) => {
    if (!row.topic) return;
    const key = `${row.subject ?? "?"} :: ${row.topic}`;
    const bucket = byTopic.get(key) ?? { subject: row.subject, topic: row.topic, total: 0, correct: 0 };
    bucket.total += 1;
    if (row.correct) bucket.correct += 1;
    byTopic.set(key, bucket);
  });

  const scored = [...byTopic.values()]
    .filter((bucket) => bucket.total >= 2)
    .map((bucket) => ({ ...bucket, accuracy: bucket.correct / bucket.total }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const bySubject = new Map();
  attempts.forEach((row) => {
    if (!row.subject) return;
    const bucket = bySubject.get(row.subject) ?? { subject: row.subject, total: 0, correct: 0 };
    bucket.total += 1;
    if (row.correct) bucket.correct += 1;
    bySubject.set(row.subject, bucket);
  });

  return {
    topicAccuracy: accuracy(topicRows),
    subjectAccuracy: accuracy(subjectRows),
    weakAreas: scored.slice(0, 4).filter((bucket) => bucket.accuracy < 0.7).map((bucket) => bucket.topic),
    strongAreas: scored.slice(-4).filter((bucket) => bucket.accuracy >= 0.8).map((bucket) => bucket.topic),
    weakTopics: scored.slice(0, 6),
    subjectPerformance: [...bySubject.values()].map((bucket) => ({
      subject: bucket.subject,
      total: bucket.total,
      accuracy: bucket.total ? bucket.correct / bucket.total : 0,
    })),
    recentMistakes: attempts
      .filter((row) => !row.correct)
      .slice(0, 8)
      .map((row) => ({ subject: row.subject, topic: row.topic, questionId: row.question_id })),
  };
}

