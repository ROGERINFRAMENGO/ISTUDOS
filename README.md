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
- **Sincronização celular ↔ computador** — mesmo XP, sequência, aulas, simulados e chat nos dois aparelhos, sem login (detalhes abaixo)
- **7 temas de cor** (Configurações)

## Variáveis de ambiente (`.env`)

```bash
VITE_SUPABASE_URL=            # URL do projeto Supabase
VITE_SUPABASE_PUBLISHABLE_KEY= # chave publishable/anon
VITE_AI_API_URL=              # URL da Edge Function do Tutor IA (opcional)
```

Sem `.env` o app funciona: Supabase cai no fallback do código e a IA fica em modo demonstração.

## Banco de dados

Rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no **SQL Editor** do Supabase. São 14 tabelas: 13 com RLS por usuário + a `app_state`, usada pela sincronização entre aparelhos.

## 📱 Sincronização celular ↔ computador (sem login)

O site é de **um único usuário**, então o estado compartilhado fica em **uma linha** da tabela `public.app_state` (`id = 'principal'`, conteúdo em `jsonb`). Não precisa de login: você entra com a senha do app e o estado vem do servidor.

- **O que sincroniza:** XP/nível/sequência/questões/tempo, aulas concluídas, datas de estudo, meta diária, simulados (com histórico de tentativas), chat do Tutor IA, tema e a lição que parou no meio
- **Regras de merge** (para nada se perder): contadores pegam o **maior** valor, aulas/datas/simulados são **unidos**, tentativas de simulado são **somadas** e chat/tema/lição retomada vence o **mais recente**
- **Quando sincroniza:** ao abrir o site, ~1,2s depois de cada mudança (envio) e a cada 60s + ao voltar para a aba (leitura)
- **Indicador:** no rodapé da lateral aparece `☁️ Sincronizado às HH:MM`, `☁️ Sincronizando...` ou `⚠️ Sem sincronizar agora`
- O envio sempre **lê antes de escrever** (read-merge-write): um aparelho nunca apaga o que o outro gravou

Lógica completa em [`src/services/sync.js`](src/services/sync.js).


## Tutor IA — Gemini (já conectada ✅)

A Edge Function `ai-tutor` (v5) está implantada e **conectada ao Gemini** (API nativa do Google): tenta primeiro `gemini-3.8-flash` e, se der 429 (cota) ou 5xx, cai automaticamente para `gemini-flash-lite-latest` (cota separada).

- A chave fica **só no servidor** (nunca no navegador nem no front-end)
- O site envia o contexto (XP, sequência, aulas de hoje) junto de cada pergunta
- **Se qualquer erro acontecer**, o chat mostra automaticamente a mensagem de desconexão combinada e o badge vira "○ IA desconectada"
- Ela também **cria simulados pelo chat** ("cria um simulado de matemática com 5 questões da semana 3") devolvendo uma ação estruturada

Para trocar o modelo ou a chave, defina os segredos `AI_MODEL` / `AI_FALLBACK_MODEL` / `GEMINI_API_KEY` na função (Supabase Dashboard → Edge Functions → ai-tutor → Secrets). Opcionalmente você pode apontar outra URL com `VITE_AI_API_URL` no `.env`.

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
