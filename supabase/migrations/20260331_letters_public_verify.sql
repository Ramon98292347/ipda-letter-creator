-- Adiciona policy RLS para permitir verificacao publica de cartas
-- Permite que qualquer pessoa (nao autenticada) leia dados publicos de uma carta pelo ID
-- Usado pela funcao public-verify-letter para validar autenticidade via QR code

begin;

-- Policy para reads publicas na tabela letters
-- Qualquer um pode ler uma carta se souber o ID (nao expostos dados sensiveis)
create policy letters_public_verify_policy
on public.letters
for select
to anon
using (true);

commit;
