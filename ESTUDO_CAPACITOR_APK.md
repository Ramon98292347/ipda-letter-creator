# Estudo de Implantacao: Web/PWA para APK de Teste com Capacitor

## Objetivo
Transformar o projeto `ipda-letter-creator` (React + Vite) em um APK Android de teste com interface embarcada localmente, sem depender de abrir URL externa como tela principal.

## Diagnostico do Projeto Atual
- Stack atual: React 18 + Vite 5 + TypeScript.
- Build de producao: `npm run build` gera pasta `dist`.
- O app ja usa Supabase e Edge Functions por HTTP(S), o que permanece igual no APK.
- Hoje existem fluxos orientados a PWA/Web:
  - Registro manual de Service Worker em `src/main.tsx`.
  - Hook de push baseado em `PushManager`/Web Push em `src/hooks/usePushNotifications.ts`.
  - Banner de onboarding para "instalar app" em `src/components/shared/PwaOnboarding.tsx`.

Conclusao de viabilidade: a migracao para Capacitor e totalmente viavel para APK de teste e atende exatamente o objetivo de "app instalado" sem abrir URL publica.

## Arquitetura Recomendada
- Frontend continua sendo buildado com Vite.
- Capacitor empacota os arquivos estaticos de `dist` dentro do app Android.
- O WebView interno abre os assets locais (servidor local interno do Capacitor), nao uma URL externa.
- Internet sera usada apenas para chamadas de API (Supabase/n8n etc).

Fluxo:
1. `npm run build`
2. `npx cap sync android`
3. `npx cap open android`
4. Build APK no Android Studio
5. Instalar APK no dispositivo

## Implementacao Proposta

### 1. Dependencias
Instalar no projeto:

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
```

### 2. Inicializacao do Capacitor
Executar:

```bash
npx cap init "SGE IPDA" "com.ipda.sistema"
```

Observacao:
- `appId`: use um id estavel (ex.: `com.ipda.sistema`).
- `appName`: nome exibido no Android.

### 3. Configuracao para build local (`dist`)
Garantir `capacitor.config.ts` com:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ipda.sistema',
  appName: 'SGE IPDA',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};

export default config;
```

Ponto-chave:
- `webDir: 'dist'` e obrigatorio para embutir o frontend local no app.

### 4. Adicionar plataforma Android

```bash
npx cap add android
```

### 5. Scripts NPM recomendados
Adicionar no `package.json`:

```json
{
  "scripts": {
    "build": "vite build",
    "cap:sync": "npx cap sync android",
    "cap:open": "npx cap open android",
    "android:dev": "npm run build && npx cap sync android && npx cap open android"
  }
}
```

### 6. Geracao do APK de teste
No Android Studio:
1. Abrir com `npx cap open android`.
2. Esperar sync do Gradle.
3. Menu: `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
4. Arquivo gerado em `android/app/build/outputs/apk/debug/app-debug.apk`.

Instalacao manual:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Ajustes Necessarios no Projeto Atual

### A. Service Worker no app Capacitor
Hoje o SW e registrado sempre (`src/main.tsx:7`). Em WebView, manter SW ativo pode causar cache agressivo, atualizacao confusa e comportamento diferente do navegador.

Recomendacao:
- Registrar SW apenas quando rodando no navegador web tradicional.
- Para APK de teste, desativar SW (ou condicionar por ambiente/plataforma).

### B. Push Notifications
O push atual e Web Push (`PushManager`, VAPID) e depende do stack de navegador (`src/hooks/usePushNotifications.ts:51-55`).

Impacto:
- Em app Capacitor, o caminho robusto e usar plugin nativo (`@capacitor/push-notifications`) com FCM.
- Para esta fase de APK de teste, pode:
  1. desativar temporariamente push web no app Android; ou
  2. iniciar migracao para push nativo.

### C. UX de "instalar como PWA"
`PwaOnboarding` incentiva instalar via navegador (`src/components/shared/PwaOnboarding.tsx:81-87`).

Recomendacao:
- Ocultar esse onboarding quando estiver rodando dentro do app Capacitor, para evitar mensagem contraditoria.

## Riscos e Mitigacoes
- Cache inconsistente por SW + assets locais.
  - Mitigar com SW desativado no modo app.
- Push deixar de funcionar no app (caso mantenha apenas Web Push).
  - Mitigar com fallback sem push na fase 1 e migracao para plugin nativo na fase 2.
- Plugins web que exigem contexto de navegador completo.
  - Mitigar com teste funcional em aparelho real apos cada sync.

## Checklist de Implantacao
1. Instalar dependencias do Capacitor.
2. Criar `capacitor.config.ts` com `webDir: dist`.
3. Adicionar plataforma Android.
4. Gerar build web (`npm run build`).
5. Sincronizar (`npx cap sync android`).
6. Abrir Android Studio (`npx cap open android`).
7. Buildar APK debug.
8. Instalar em celular Android.
9. Validar login, rotas, chamadas Supabase, upload e camera (se aplicavel).
10. Validar que app abre localmente sem URL externa.

## Cronograma Estimado
- Setup Capacitor inicial: 30-60 min.
- Ajustes SW/PWA para modo app: 30-90 min.
- Build Android + primeiro APK: 20-40 min.
- Rodada de testes no dispositivo: 1-2 h.

Total tipico: 1 dia util para primeira versao de teste.

## Estrategia em Fases (Recomendada)
- Fase 1 (rapida): APK funcional com frontend local, sem migrar push nativo.
- Fase 2 (estabilizacao): ajustar SW/plataforma, tratar UX especifica de app.
- Fase 3 (mobile completo): push nativo (FCM), permissao nativa e refinamentos Android.

## Criterio de Pronto
O objetivo estara cumprido quando:
- O app abrir no Android direto pelo icone instalado.
- A UI carregar dos arquivos locais embarcados (nao de URL externa).
- O backend continuar sendo acessado via internet para Supabase/APIs.
- O APK debug puder ser instalado e testado sem Play Store.
