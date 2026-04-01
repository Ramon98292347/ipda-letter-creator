#!/bin/bash

# Script de deploy das Edge Functions para Supabase
# Este script deploy as funções atualizadas de notificações

set -e

echo "═══════════════════════════════════════════════════════════"
echo "🚀 Deploy das Edge Functions - Notificações"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Verificar se supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado!"
    echo "📦 Instale com: npm install -g supabase"
    exit 1
fi

echo "✅ Supabase CLI encontrado"
echo ""

# Verificar se está autenticado
if ! supabase projects list &> /dev/null; then
    echo "❌ Não autenticado no Supabase!"
    echo "🔐 Faça login com: supabase login"
    exit 1
fi

echo "✅ Autenticado no Supabase"
echo ""

# Listar projetos para o usuário escolher
echo "📋 Projetos disponíveis:"
supabase projects list

echo ""
echo "💡 Qual é seu Project ID? (Cole acima ou use a variável SUPABASE_PROJECT_ID)"
echo ""

# Tentar usar variável de ambiente ou pedir ao usuário
if [ -z "$SUPABASE_PROJECT_ID" ]; then
    read -p "📝 Digite seu Project ID: " PROJECT_ID
else
    PROJECT_ID="$SUPABASE_PROJECT_ID"
    echo "✅ Usando Project ID: $PROJECT_ID"
fi

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Nenhum Project ID fornecido!"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📦 Deployando functions para: $PROJECT_ID"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Deploy das functions
echo "1️⃣  Deployando: notifications-api"
if supabase functions deploy notifications-api --project-id "$PROJECT_ID"; then
    echo "✅ notifications-api deployado com sucesso!"
else
    echo "❌ Erro ao deployar notifications-api"
    exit 1
fi

echo ""
echo "2️⃣  Deployando: set-user-registration-status"
if supabase functions deploy set-user-registration-status --project-id "$PROJECT_ID"; then
    echo "✅ set-user-registration-status deployado com sucesso!"
else
    echo "❌ Erro ao deployar set-user-registration-status"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🎉 Deploy concluído com sucesso!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 Próximos passos:"
echo "  1. Acessar https://app.supabase.com → seu projeto → Functions"
echo "  2. Clicar em 'notifications-api' e verificar aba 'Logs'"
echo "  3. Aguardar próximo aniversário (06:00 Brasília) ou testar manualmente"
echo ""
echo "📞 Ver logs em tempo real:"
echo "  supabase functions logs notifications-api --project-id '$PROJECT_ID'"
echo ""
