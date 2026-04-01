@echo off
REM Script de deploy das Edge Functions para Supabase (Windows)

setlocal enabledelayedexpansion

echo.
echo ===================================================
echo  Deploy das Edge Functions - Notificacoes
echo ===================================================
echo.

REM Verificar se supabase CLI está instalado
where supabase >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Supabase CLI nao encontrado!
    echo.
    echo Instale com: npm install -g supabase
    echo.
    pause
    exit /b 1
)

echo [OK] Supabase CLI encontrado
echo.

REM Verificar autenticação
supabase projects list >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Nao autenticado no Supabase!
    echo.
    echo Faca login com: supabase login
    echo.
    pause
    exit /b 1
)

echo [OK] Autenticado no Supabase
echo.

REM Listar projetos
echo Projetos disponíveis:
echo.
supabase projects list
echo.

REM Obter Project ID
if defined SUPABASE_PROJECT_ID (
    set "PROJECT_ID=%SUPABASE_PROJECT_ID%"
    echo [OK] Usando Project ID: %PROJECT_ID%
) else (
    set /p PROJECT_ID="Digite seu Project ID: "
)

if "!PROJECT_ID!"=="" (
    echo [ERRO] Nenhum Project ID fornecido!
    pause
    exit /b 1
)

echo.
echo ===================================================
echo  Deployando functions para: %PROJECT_ID%
echo ===================================================
echo.

REM Deploy notifications-api
echo [1/2] Deployando: notifications-api
supabase functions deploy notifications-api --project-id %PROJECT_ID%
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao deployar notifications-api
    pause
    exit /b 1
)
echo [OK] notifications-api deployado com sucesso!
echo.

REM Deploy set-user-registration-status
echo [2/2] Deployando: set-user-registration-status
supabase functions deploy set-user-registration-status --project-id %PROJECT_ID%
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao deployar set-user-registration-status
    pause
    exit /b 1
)
echo [OK] set-user-registration-status deployado com sucesso!
echo.

echo ===================================================
echo  Deploy concluido com sucesso!
echo ===================================================
echo.
echo [PROX] Proximos passos:
echo  1. Acessar https://app.supabase.com - seu projeto - Functions
echo  2. Clicar em 'notifications-api' e verificar aba 'Logs'
echo  3. Aguardar proximo aniversario (06:00 Brasilia) ou testar manualmente
echo.
echo [LOGS] Ver logs em tempo real:
echo  supabase functions logs notifications-api --project-id %PROJECT_ID%
echo.
pause
