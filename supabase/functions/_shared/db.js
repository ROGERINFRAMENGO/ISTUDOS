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

/**
 * Chave logica da aula: abrir a mesma aula de novo nunca gera outra.
 * O BLOCO entra na chave porque cada dia do cronograma tem dois blocos
 * (55min + 55min) e eles sao aulas diferentes.
 */
export function lessonCacheKey({ curriculumVersion = "v1", week, day, dateKey, block, subject, topic }) {
  return [
    String(curriculumVersion || "v1"),
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
    async saveLesson({ userId, cacheKey, curriculumVersion, week, day, dateKey, subject, topic, lessonData, model }) {
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
        },
      });
      return rows?.[0] ?? null;
    },

    async findQuiz(lessonId, difficulty) {
      const rows = await select(QUIZZES_TABLE, "*", {
        lesson_id: `eq.${lessonId}`,
        difficulty: `eq.${difficulty}`,
        limit: "1",
      });
      return rows?.[0] ?? null;
    },

    async saveQuiz({ userId, lessonId, subject, topic, difficulty, quizData, model }) {
      const rows = await request(QUIZZES_TABLE, {
        method: "POST",
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

