# ISTUDOS 💗

Plataforma de estudos para o **Vestibulinho Etec** — sequência estilo Duolingo, XP, cronograma de 10 semanas, aulas com vídeo + questionário, **simulados/mini-provas** e **Tutor IA** com chat.

## Stack

- **Front:** React 18 + Vite 5 (CSS puro com temas)
- **Back:** Supabase (Auth + Postgres + RLS) — opcional, funciona offline
- **Deploy:** GitHub Pages automático (GitHub Actions)

## Rodando localmente

```bash
npm install
npm run dev
# abra http://localhost:5173/ISTUDOS/
```

Outros comandos: `npm run build` (gera `dist/`) · `npm run preview` (serve o build).

## Funcionalidades

- **Estudo de hoje** — aulas por data, vídeo, conteúdo completo e questionário de 5 questões (mín. 10s na aula)
- **Sequência estilo Duolingo** — quebra se faltar 1 dia; meta diária de 1 lição
- **XP, nível, progresso geral, tempo estudado** — salvos no `localStorage` **e** no Supabase (não zeram no refresh)
- **Cronograma** — plano oficial 28/09 a 05/12 com status por dia
- **Simulados e mini-provas** — crie provas (matéria, dificuldade, 2–30 questões) com banco de 36 questões estilo Etec; XP por acerto; histórico de melhor resultado
- **Tutor IA** — chat com contexto do site (XP, sequência, aulas de hoje); **pede para ela criar simulados** ("cria um simulado de matemática com 10 questões")
- **7 temas de cor** (Configurações)

## Variáveis de ambiente (`.env`)

```bash
VITE_SUPABASE_URL=            # URL do projeto Supabase
VITE_SUPABASE_PUBLISHABLE_KEY= # chave publishable/anon
VITE_AI_API_URL=              # URL da Edge Function do Tutor IA (opcional)
```

Sem `.env` o app funciona: Supabase cai no fallback do código e a IA fica em modo demonstração.

## Banco de dados

Rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no **SQL Editor** do Supabase. São 12 tabelas com RLS (cada usuário só enxerga os próprios dados).

## Tutor IA — como conectar de verdade

A Edge Function **`ai-tutor` já está implantada** no projeto Supabase. Falta só:

```bash
# 1. Guardar a chave da IA como segredo do servidor (nunca no navegador)
supabase secrets set OPENAI_API_KEY=sk-...

# 2. Apontar o site para a função (no .env)
VITE_AI_API_URL=https://ehuwpvgcmssxrafsmtfo.supabase.co/functions/v1/ai-tutor

# 3. Reconstruir
npm run build
```

O badge do chat vira **● IA conectada**. Ela recebe o contexto do site (XP, sequência, aulas de hoje) e pode devolver **ações estruturadas** — por enquanto `create_simulado`, que abre um botão "Abrir simulado" no chat.

## Deploy (GitHub Pages)

1. Push na branch `main` → o workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) builda e publica
2. No repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. Site: `https://ROGERINFRAMENGO.github.io/ISTUDOS/`

## Estrutura

```
index.html            → entry do Vite
src/
  App.jsx             → estado global (progresso, sequência, telas)
  components/         → LessonPage, SchedulePage, AiChatPage, SimuladosPage
  data/               → lessons (aulas por data), schedule, simuladoBank, themes...
  services/           → auth, database, aiChat, simulados
  lib/supabase.js     → cliente Supabase
supabase/schema.sql   → banco + RLS
app.js, styles.css    → legado da 1ª versão (sem uso)
```
