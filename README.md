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
- **Tutor IA dentro da lição** — botão `💬 Tirar dúvida com a IA` abre o chat na aula, no questionário e no resultado; ela recebe o tema, o resumo, os tópicos e as questões daquela aula
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


## 🤖 IA (NVIDIA) — aula de cada tópico + quiz + Tutora

A aula de **cada tópico do cronograma** é escrita pela IA na hora, e o quiz nasce do texto que ela acabou de escrever. São 3 Edge Functions (código em [`supabase/functions/`](supabase/functions/)):

| Função | O que faz | Quando o site chama |
| --- | --- | --- |
| `generate-lesson` | Escreve a aula do dia: objetivos, seções explicadas, prática guiada, erros comuns e resumo | ao abrir uma aula do cronograma |
| `generate-quiz` | Cria as 5 questões **do conteúdo realmente gerado** | logo depois da aula (e de novo se você clicar em "continuar" antes dela chegar) |
| `tutor` | A Tutora do chat, com contexto lido do banco e ferramentas **somente leitura** | a cada mensagem do chat |

- **Modelo:** `meta/muse-glimmer-30b` (`supabase/functions/_shared/nvidia.js`), com 1 retentativa em 429/503
- **A chave da NVIDIA fica só no servidor** (`NVIDIA_API_KEY` como secret) — nada de segredo no navegador
- **Validação antes de salvar:** `_shared/schemas.js` confere a estrutura (4 alternativas, índice da resposta correta válido, tamanho). Veio torto → a função manda a IA corrigir uma vez; se continuar torto, devolve erro e **nada é salvo**
- **Cache em 3 camadas:** ① `localStorage` (`istudos_ai_lessons`) ② a linha `app_state` da sincronização (o celular reaproveita a aula que o computador gerou) ③ tabelas `generated_lessons` / `generated_quizzes`. Reabrir a mesma aula custa zero
- **Sessão:** usa o login por e-mail se estiver aberto; senão abre uma sessão anônima num cliente paralelo (`aiSupabase`, storageKey `istudos_ai_auth`) que **não pisa** no login nem no progresso do aparelho
- **Se a IA falhar** (sem internet, secret ausente, cota): a aula continua na tela, aparece o motivo com o botão **Tentar de novo**, e o resto do app segue funcionando

Toda a integração do front passa por [`src/services/ai.js`](src/services/ai.js) (uma camada só — nenhuma tela chama `fetch` direto).

### Ligar a IA (feito uma vez)

```bash
npx supabase login
npx supabase link --project-ref ehuwpvgcmssxrafsmtfo
npx supabase functions deploy generate-lesson
npx supabase functions deploy tutor-chat
npx supabase secrets set NVIDIA_API_KEY=nvapi-xxxxxxxx
npx supabase secrets set GROQ_API_KEY=gsk_xxxxxxxx
```

Estas são **as duas funções que o frontend usa**. Não existem `generate-quiz` nem `tutor`: o quiz é montado localmente por `src/data/lessonQuiz.js` e o chat fala só com `tutor-chat`. Um `deploy` delas não deve ser feito — e nenhuma chamada no bundle aponta para essas rotas (confira com `node tools/conferir-rotas-legadas.mjs`).

E no **Dashboard** (não tem pela CLI): **Authentication → Sign In → Allow anonymous sign-ins = on**. Sem isso as funções devolvem `401` e o site mostra o aviso de "IA ainda não liberada" em vez de quebrar.

- A chave fica **só no servidor** (nunca no navegador nem no front-end)
- O site envia o contexto (XP, sequência, aulas de hoje) junto de cada pergunta
- **Dentro da lição**, envia também `context.lesson` (matéria, tema, objetivo, resumo, tópicos e as questões do questionário numeradas), então ela explica o conteúdo daquela aula passo a passo em vez de responder genérico
- **Se qualquer erro acontecer**, o chat mostra automaticamente a mensagem de desconexão combinada e o badge vira "○ IA desconectada" (o site ainda tenta 1 vez sozinho antes, em erro de servidor/rede)
- Ela também **cria simulados pelo chat** ("cria um simulado de matemática com 5 questões da semana 3") devolvendo uma ação estruturada

O chat é o mesmo componente nas duas telas ([`src/components/TutorChat.jsx`](src/components/TutorChat.jsx)): a aba "Tutor IA" e o painel que abre dentro da lição compartilham o mesmo histórico e a mesma sincronização.

Para trocar o modelo ou a chave: `NVIDIA_API_KEY` como secret (Dashboard → Edge Functions → Secrets) e `NVIDIA_MODEL` em [`supabase/functions/_shared/nvidia.js`](supabase/functions/_shared/nvidia.js). A função antiga `ai-tutor` (Gemini) ainda está implantada, mas **não é mais chamada** pelo site — pode ser apagada quando a nova estiver testada.

## Deploy (GitHub Pages)

1. Push na branch `main` → o workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) builda e publica
2. No repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. Site: `https://ROGERINFRAMENGO.github.io/ISTUDOS/`

## Estrutura

```
index.html            → entry do Vite
src/
  App.jsx             → estado global (progresso, sequência, telas)
  components/         → TutorChat (chat compartilhado), LessonPage, SchedulePage, AiChatPage, SimuladosPage
  data/               → lessons (aulas por data), schedule, simuladoBank, themes...
  services/           → auth, database, aiChat, simulados
  lib/supabase.js     → cliente Supabase
supabase/schema.sql   → banco + RLS
app.js, styles.css    → legado da 1ª versão (sem uso)
```
