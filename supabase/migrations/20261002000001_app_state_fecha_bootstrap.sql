-- ============================================================
-- app_state: fecha a janela de bootstrap
--
-- Por que agora
-- -------------
-- As politicas criadas em 2026-10-02 usavam
--
--     owner_id IS NULL OR owner_id = auth.uid()
--
-- para permitir a vinculacao inicial da conta da estudante. Isso
-- abriu uma janela: enquanto `principal` estivesse sem dono,
-- QUALQUER conta autenticada podia ler os 104.998 bytes de estado da
-- Anna, sobrescrever a linha e se declarar proprietaria. Havia 365
-- contas no projeto (356 anonimas) e nenhuma era da Anna.
--
-- Decisao
-- -------
-- A conta da Anna ainda nao existe, entao nao ha como vincular o
-- estado a ninguem hoje. Deixar a janela aberta nao "preserva" nada:
-- ela mantem a linha exposta a qualquer conta que aparecer antes do
-- vinculo. Fechar e o que protege o dado.
--
-- O vinculo passa a ser feito pelo ADMIN, em uma unica operacao,
-- depois que a conta existir (ver tools/vincular-dono-app-state.sql).
-- A partir dai as politicas abaixo ja sao as definitivas.
--
-- O dado NAO e tocado aqui: esta migracao so mexe em politica.
-- ============================================================

drop policy if exists app_state_read_own on public.app_state;
drop policy if exists app_state_update_own on public.app_state;
drop policy if exists app_state_write_own on public.app_state;
drop policy if exists app_state_owner_update on public.app_state;
drop policy if exists app_state_public_read on public.app_state;
drop policy if exists app_state_public_write on public.app_state;

-- Leitura: somente a propria conta. Sem excecao para linha sem dono.
create policy app_state_read_own
  on public.app_state
  for select
  to authenticated
  using (owner_id = auth.uid());

-- Escrita: o dono escreve, e so pode continuar sendo o dono.
-- O `with_check` e o que impede o proprio dono de repassar a linha
-- para outra conta depois de gravada.
create policy app_state_write_own
  on public.app_state
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Sem sessao anonima nao ha leitura nem escrita.
revoke all on public.app_state from anon;