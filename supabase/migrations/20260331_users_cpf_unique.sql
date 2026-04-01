-- Adiciona constraint UNIQUE na coluna cpf da tabela users
-- Garante que cada CPF so pode ser cadastrado uma unica vez no sistema
ALTER TABLE users
  ADD CONSTRAINT users_cpf_unique UNIQUE (cpf);
