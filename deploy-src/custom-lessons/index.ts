// ============================================================
// FASE D — "Minhas aulas": listar e excluir.
//
// Esta funcao NAO tem chave de IA nenhuma. Ela so le e apaga linhas
// de generated_lessons onde kind = 'custom', e quem garante que a
// linha e da própria estudante e o RLS do banco (auth.uid() =
// user_id), nao nenhum filtro aqui.
//
// Nao ha como apagar aula do cronograma: o filtro kind='custom'
// impede, mesmo que o front mande o id de uma aula oficial.
// ============================================================

import { authenticate, handleOptions, json } from "./_http.js";
import { createDb } from "./_db.js";

/** UUID estrito: barra qualquer coisa que nao seja um id real. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const auth = await authenticate(req);
  if (!auth) {
    return json(
      { error: "unauthorized", message: "Precisa estar conectada para ver suas aulas." },
      401,
      req,
    );
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const db = createDb({ url, anonKey, token: auth.token });

  // GET: lista
  if (req.method === "GET") {
    try {
      const rows = await db.listCustomLessons(100);
      return json({ lessons: rows }, 200, req);
    } catch (error) {
      console.error("[custom-lessons] falha ao listar", String(error?.message ?? error).slice(0, 160));
      return json({ error: "list_failed", message: "Nao consegui carregar suas aulas agora." }, 502, req);
    }
  }

  // DELETE: exclui uma
  if (req.method === "DELETE") {
    let id = "";
    try {
      const body = await req.json();
      id = String(body?.id ?? "").trim();
    } catch {
      return json({ error: "invalid_body" }, 400, req);
    }
    if (!UUID.test(id)) {
      return json({ error: "invalid_id" }, 400, req);
    }

    try {
      // Confere que a linha e 'custom' ANTES de apagar. Sem isso, um
      // id de aula do cronograma poderia ser removido.
      const row = await db.findLessonById(id);
      if (!row) {
        return json({ error: "not_found", message: "Aula nao encontrada." }, 404, req);
      }
      if (row.kind !== "custom") {
        return json({ error: "not_custom", message: "Essa aula nao e uma aula personalizada." }, 400, req);
      }
      await db.deleteLesson(id);
      return json({ deleted: true, id }, 200, req);
    } catch (error) {
      console.error("[custom-lessons] falha ao excluir", String(error?.message ?? error).slice(0, 160));
      return json({ error: "delete_failed", message: "Nao consegui excluir agora." }, 502, req);
    }
  }

  return json({ error: "method_not_allowed" }, 405, req);
});