-- ============================================================
-- app_state: vincula o estado a conta correta.
--
-- QUANDO USAR
-- -----------
-- Depois que a conta permanente da Anna existir e ela entrar uma
-- unica vez pelo proprio dispositivo.
--
-- COMO ACHAR O ID
-- ---------------
--   select id, email, created_at
--   from auth.users
--   where email = 'o-email-real-da-anna@...';
--
-- COMO VERIFICAR ANTES
-- --------------------
-- Confirme que o e-mail e o dela. Um id errado aqui entrega o
-- estado da Anna (XP, streak, historico da Tutora, simulados,
-- aulas personalizadas) para a conta errada.
--
-- ESTA OPERACAO SO MUDA owner_id. O campo `data` nao e tocado,
-- reordered, filtrado nem reconstruido: e um UPDATE de coluna.
-- ============================================================

begin;

-- Trava a linha para ninguem mexer enquanto vinculamos.
update public.app_state
   set owner_id = (select id from auth.users where email = 'TROCAR-PELO-EMAIL-REAL-DA-ANNA')::uuid
 where id = 'principal'
   and owner_id is null;

-- Trava o resultado: se a linha nao existia ou ja tinha dono,
-- o update nao afetou nada e o ROLLBACK abaixo desfaz.
do $$
begin
  if (select count(*) from public.app_state where id = 'principal' and owner_id is not null) <> 1 then
    raise exception 'vinculo nao aplicado: a linha principal nao ficou com owner_id';
  end if;
end $$;

commit;

-- CONFIRME DEPOIS:
--   select owner_id = (select id from auth.users where email = '...') as ok,
--          octet_length(data::text) as bytes
--     from public.app_state where id = 'principal';
--
-- `bytes` tem que continuar 104998 e o md5 igual ao backup:
--   select md5(data::text) from public.app_state where id = 'principal';
--   select md5(data::text) from public.app_state_backup_20261002;
--
-- ROLLBACK (se algo parecer errado):
--   update public.app_state set owner_id = null where id = 'principal';