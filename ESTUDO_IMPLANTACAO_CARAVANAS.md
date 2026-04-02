# Estudo de Implantação: Gestão de Caravanas

Este documento detalha o plano para integrar a funcionalidade de Gestão de Caravanas ao projeto `ipda-letter-creator`, baseando-se no protótipo existente no projeto `remix-of-caravana-connect`.

## Visão Geral

A funcionalidade permitirá que voluntários registrem caravanas através de um link público e que administradores/pastores gerenciem esses registros em uma nova aba na página de Igrejas.

## Análise de Requisitos e Fluxos

### 1. Fluxo de Registro Público (Voluntários)
-   **Acesso:** Link público no sistema principal (ex: `/caravanas/registrar`), sem necessidade de login.
-   **Formulário:**
    -   Seleção da Igreja (Idealmente com autocomplete buscando da base existente ou opção manual).
    -   Dados do Líder da Caravana (Nome, WhatsApp com máscara).
    -   Dados do Transporte (Placa do veículo, Quantidade de passageiros).
-   **Feedback:** Confirmação visual de sucesso e possivelmente envio de webhook/notificação.

### 2. Fluxo de Gestão (Administradores/Pastores)
-   **Acesso:** Dentro do dashboard do sistema, na seção de Igrejas.
-   **Visualização:**
    -   **Administradores:** Veem todas as caravanas cadastradas no sistema.
    -   **Pastores/Líderes Locais:** Veem apenas as caravanas referentes à sua jurisdição (filtrado via Row Level Security - RLS).
-   **Ações:**
    -   Aprovar/Confirmar caravanas.
    -   Visualizar detalhes.
    -   Filtrar por status (Recebidas, Confirmadas), data ou igreja.

---

## Propostas Técnicas de Implantação

### 1. Banco de Dados (Supabase)

Precisamos criar uma tabela `caravanas` no banco de dados e configurar as políticas de acesso.

```sql
CREATE TABLE caravanas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_code TEXT,       -- Código TOTVS ou ID da igreja selecionada
  church_name TEXT NOT NULL,
  city_state TEXT NOT NULL,
  pastor_name TEXT,
  vehicle_plate TEXT,
  leader_name TEXT NOT NULL,
  leader_whatsapp TEXT,
  passenger_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Recebida', -- 'Recebida', 'Confirmada'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) -- Opcional, caso um usuário logado faça o registro
);

-- Configuração de RLS (Row Level Security) estimadas:
-- 1. Insert público (qualquer um pode inserir)
-- 2. Select para Admins (podem ver tudo)
-- 3. Select para Pastores (podem ver apenas as que têm church_code compatível com sua jurisdição).
```

### 2. Desenvolvimento Frontend - Páginas Públicas

-   **Nova Página (`src/pages/CaravanaPublicPage.tsx`):**
    -   Página acessível sem autenticação.
    -   Deve seguir a estética visual premium do `ipda-letter-creator` (fontes Inter, estilo dark/light mode, sombras, cards).
    -   Utilizar componentes existentes como `Input`, `Button`, e possivelmente integrar com `react-hook-form` e `zod` para validação (como as máscaras de WhatsApp e Placa feitas no projeto base).

### 3. Desenvolvimento Frontend - Área Logada

Para integrar de forma fluida sem criar muitas rotas novas, a melhor abordagem é adicionar Abas (Tabs) nas páginas de gestão de igrejas.

-   **`src/pages/AdminIgrejasPage.tsx` e `src/pages/PastorIgrejasPage.tsx`:**
    -   Implementar o componente `Tabs` (shadcn/ui).
    -   **Aba "Igrejas":** Mantém exatamente a listagem e gestão atual de igrejas.
    -   **Aba "Caravanas":** Renderiza um novo componente `CaravanasDashboard`.
    -   O `CaravanasDashboard` terá estatísticas rápidas (Cards com total recebidas, confirmadas) e uma tabela/lista com os registros e botão de confirmar.

### 4. Integração de Webhooks / Notificações

-   Se necessário, o webhook existente no projeto antigo pode ser portado para uma Edge Function do Supabase ou disparado diretamente pelo client pós-submissão.

---

## Decisões Pendentes (Para definição do usuário)

1.  **Seleção da Igreja no Registro:** O voluntário poderá digitar livremente o nome da igreja ou será forçado a escolher de uma lista preexistente no banco de dados do sistema? (A busca preexistente evita duplicatas e facilita filtros depois).
2.  **Notificações Automáticas:** Devemos incluir o disparo de mensagens via WhatsApp/Webhook ao confirmar uma caravana?

## Conclusão e Próximos Passos

O `ipda-letter-creator` já possui grande parte da estrutura necessária de UI e de serviços base conectados ao Supabase. A implantação desta feature será direta e consistirá principalmente em:

1.  Aplicar a migração SQL no Supabase.
2.  Criar os serviços no arquivo de comunicação do frontend (ex: `saasService.ts`).
3.  Construir as telas (pública e as abas na administrativa) aproveitando o código lógico do `remix-of-caravana-connect` e adaptando-o para usar os componentes e padrões visuais do `ipda-letter-creator`.
