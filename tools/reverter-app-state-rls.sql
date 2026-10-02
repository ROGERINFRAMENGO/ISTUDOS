-- ============================================================================
-- FINALIZACAO 2 — como DESFAZER o travamento do app_state.
--
-- Use isto se a aluna, em algum momento, ficar sem acesso aos dados
-- dela. Rodar este arquivo devolve exatamente o comportamento
-- anterior (aberto), sem tocar em nenhum dado.
--
-- Nao apague nada: e so sobre a politica de acesso.
-- ============================================================================

-- 1. Remove as politicas por dono.
drop policy if exists app_state_read_own   on public.app_state;
drop policy if exists app_state_write_own  on public.app_state;
drop policy if exists app_state_update_own on public.app_state;

-- 2. Devolve as politicas abertas originais.
create policy app_state_select_all on public.app_state
  for select to public using (true);
create policy app_state_insert_all on public.app_state
  for insert to public with check (true);
create policy app_state_update_all on public.app_state
  for update to public using (true) with check (true);

-- ============================================================================
-- INCIDENTE REGISTRADO (02/10/2026)
--
-- Durante o teste de isolamento, um script de teste sobrescreveu a
-- coluna `data` da linha 'principal' com {}. A causa foi simples e
-- boba: o SELECT de confirmacao do proprio script pediu apenas
-- `select=id`, e a "restauracao" posterior gravou esse resultado
-- parcial no lugar do estado real.
--
-- O que salvou: o backup app_state_backup_20261002, feito ANTES de
-- qualquer mudanca. A restauracao foi feita a partir dele e o
-- resultado confere byte a byte (102.292 bytes, dados_intactos = 1).
--
-- Licao levada para o codigo: um teste NUNCA restaura um objeto
-- Having read it back from uma consulta parcial. Restaurar so com a
-- leitura completa, ou com o backup, nunca com um SELECT reduzido.
-- ============================================================================