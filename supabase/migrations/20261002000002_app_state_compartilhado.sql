-- ============================================================
-- app_state: volta ao estado compartilhado de linha unica
-- ------------------------------------------------------------
-- REVERSAO DE 20261002000001_app_state_fecha_bootstrap.sql
--
-- O QUE MUDA
--
-- A migrate anterior amarrou a linha `principal` a um owner_id, para
-- que o estado so pudesse ser lido pela conta da Anna. Essa conta NUNCA
-- foi criada: o produto voltou ao acesso por senha unica, sem cadastro
-- e sem conta permanente.
--
-- Resultado daquela escolha: com `owner_id IS NULL` e a politica
-- `owner_id = auth.uid()`, NINGUEM conseguia ler nem escrever o
-- estado. A sincronizacao entre celular e computador nao estava "em
-- risco": estava quebrada.
--
-- Este script devolve o funcionamento antigo: UMA linha compartilhada,
-- acessada pelo aparelho que tem a senha. E o que o src/services/sync.js
-- espera -- ele usa o cliente do Supabase com a anon key, sem sessao de
-- usuario, e le/escreve a linha `principal` diretamente.
--
-- ESCOPO DELIMITADO DE PROPOSITO
--
-- Isto abre a tabela `app_state` e SOMENTE ela. E a escolha do dono do
-- produto, com o risco assumido e conhecido: a senha unica fica no
-- JavaScript, entao quem abrir o site le a senha, e com `anon` liberado
-- aqui qualquer pessoa poderia ler e gravar a linha pelo cliente do
-- Supabase sem passar pela tela.
--
-- Isso NAO abre nada alem de app_state. As tabelas que guardam o que e
-- realmente sensivel e por usuario continuam fechadas por auth.uid():
--   - question_attempts, simulation_attempts (notas, historico)
--   - tutor_messages, tutor_conversations (conversas)
--   - generated_lessons, generated_quizzes, custom_lessons
-- Nenhuma delas e tocada aqui.
--
-- A coluna owner_id NAO e apagada e o backup NAO e tocado: e assim que
-- o dia em que existir conta de verdade (ou um proxy), o dado esta la.
-- Esta migracao so mexe em politica.
-- ============================================================

drop policy if exists app_state_read_own on public.app_state;
drop policy if exists app_state_write_own on public.app_state;
drop policy if exists app_state_public_read on public.app_state;
drop policy if exists app_state_public_write on public.app_state;
drop policy if exists app_state_public_update on public.app_state;

-- Leitura da linha compartilhada, para anon e autenticados.
--
-- O `id = 'principal'` limita a leitura a UMA linha. Se algum dia
-- aparecer outra linha nesta tabela, ela nao vira leitura publica.
create policy app_state_public_read
  on public.app_state
  for select
  to anon, authenticated
  using (id = 'principal');

-- Escrita da linha compartilhada.
--
-- O `id = 'principal'` no with_check impede que o aparelho crie linhas
-- novas: o estado compartilhado e uma so, por desenho.
create policy app_state_public_write
  on public.app_state
  for insert
  to anon, authenticated
  with check (id = 'principal');

create policy app_state_public_update
  on public.app_state
  for update
  to anon, authenticated
  using (id = 'principal')
  with check (id = 'principal');

-- Sem DELETE: nenhuma tela apaga o estado compartilhado, e assim nenhuma
-- porta de tras fica aberta.