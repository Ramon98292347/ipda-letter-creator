# Guia de Publicação na Google Play Store

## ✅ O que foi feito

### Ícones
- ✓ `public/app-icon-192.png` — 192×192px (cone do app nas configurações)
- ✓ `public/app-icon-512.png` — 512×512px (ícone padrão para banner, splash screens)
- ✓ `public/app-icon-maskable-512.png` — 512×512px com padding transparente (tema adaptativo do Android 12+)

### Manifesto WebManifest
- ✓ Atualizado em `public/manifest.webmanifest`
  - Referencia correta dos 3 ícones
  - Adicionados campos obrigatórios: `scope`, `id`, `orientation`, `screenshots`
  - Linguagem: `pt-BR`
  - Display: `standalone` (modo fullscreen, sem barra de navegador)

### Digital Asset Links
- Arquivo: `public/.well-known/assetlinks.json`
- Status: **Precisa do SHA256 real** (depois que criar o app no Play Console)

---

## 🚀 Próximos Passos (Manual)

### 1️⃣ Criar Conta no Google Play Console
- Acesse: https://play.google.com/console
- Pague $25 USD (taxa única de cadastro)
- Crie uma nova aplicação com package name: `com.ipda.gestao.twa`

### 2️⃣ Usar PWABuilder para Gerar o APK/AAB
1. Acesse: https://www.pwabuilder.com/
2. Cole a URL do seu site (ex: `https://seu-dominio.com`)
3. Deixe o PWABuilder fazer o "upload" — ele vai ler:
   - `manifest.webmanifest` ✓
   - `sw.js` (Service Worker) ✓
   - Ícones ✓
4. Clique em "Generate Package" → Android
5. Selecione "Build" para gerar o `.aab` (Android App Bundle)
6. Baixe o arquivo `.aab` gerado

**⚠️ Nota:** O PWABuilder pode pedir um certificado de assinatura. Se não tiver:
- Deixe ele gerar um novo (recomendado para primeira vez)
- Guarde o certificado e senha em local seguro
- Será necessário para atualizações futuras

### 3️⃣ Upload do AAB no Play Console
1. No Play Console, vá para **Release → Production**
2. Clique em **Create new release**
3. Faça upload do arquivo `.aab`
4. Preencha os dados da versão (versão number, release notes em português)
5. Adicione detalhes:
   - **Ícone**: Use `app-icon-512.png`
   - **Screenshot (480×800 ou 540×720)**: Tire screenshots da aplicação em um Pixel 4 ou usar emulador
   - **Feature graphic (1024×500)**: Banner promocional
   - **Descrição curta**: "Sistema de gestão eclesiástica completo"
   - **Descrição longa**: Descreva funcionalidades (membros, cartas, notificações, etc)
   - **Categoria**: `Productivity`
   - **Público**: Maiores de 3 anos
   - **Conteúdo**: Sem conteúdo sensível

### 4️⃣ Atualizar assetlinks.json com Certificado Real
1. No Play Console, vá para **Settings → App signing**
2. Copie o **SHA256 certificate fingerprint**
3. No arquivo `public/.well-known/assetlinks.json`, substitua:
   ```json
   "sha256_cert_fingerprints": [
     "SEU_SHA256_REAL_AQUI"
   ]
   ```
   Exemplo:
   ```json
   "sha256_cert_fingerprints": [
     "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
   ]
   ```

### 5️⃣ Teste com Grupo Fechado (Opcional mas Recomendado)
1. Crie um **Closed track** (ex: "Testing")
2. Adicione 20 testadores via email
3. Deixe testando por 14 dias
4. Recolha feedback e corrija bugs
5. Depois faça **Promote to Production**

### 6️⃣ Submeter para Revisão
1. Preencha **App content rating** (questionário sobre conteúdo)
2. Revise **Privacy policy** — **OBRIGATÓRIO** se coletar dados pessoais (membros, emails, etc)
3. Clique em **Submit**
4. Google aprova em 2-4 horas normalmente

---

## 📋 Checklist Pré-Publicação

### Código & PWA
- [ ] HTTPS habilitado em produção
- [ ] manifest.webmanifest válido (confira em: https://www.pwabuilder.com/validate)
- [ ] Service Worker (sw.js) funcionando
- [ ] Lighthouse score ≥ 90 (PWA category)
- [ ] Ícones nos tamanhos corretos ✓
- [ ] Testes funcionando em device real (Android 7+)

### Política & Legal
- [ ] Privacy policy em português
- [ ] Terms of service (se aplicável)
- [ ] LGPD compliance (Lei Geral de Proteção de Dados - Brasil)
  - Consentimento para coletar fotos, CPF, emails
  - Data retention policy clara
  - Direito de deletar dados do usuário

### Assets
- [ ] Icon 512×512 pronto
- [ ] 2-4 Screenshots (480×800 ou 540×720)
- [ ] Feature graphic 1024×500
- [ ] Descrição em português
- [ ] Release notes em português

### Segurança
- [ ] Nenhuma chave secreta/token hardcoded no código
- [ ] Certificado de assinatura seguro (guarde backup)
- [ ] assetlinks.json com SHA256 correto

---

## 🐛 Troubleshooting

### "App não aparece na Play Store"
- Aguarde 2-4 horas após aprovação
- Procure por "IPDA Gestão" em: https://play.google.com/store
- Verifique filtros de idioma (pt-BR é Brasil, não aparece em en-US)

### "Certificado expirado/inválido"
- Se o certificado gerado pelo PWABuilder expirou (raro em 25 anos), gere novo
- Mude o `versionCode` no `build.gradle` e reupload

### "Service Worker não registra"
- Verifique se está em HTTPS
- Console do navegador deve mostrar: `Service Worker registration successful`
- Limpe cache do navegador

### "Notificações não chegam no app instalado"
- Confirmei que `userVisibleOnly: false` está correto em `usePushNotifications.ts`
- Validação de escopo está em `public/sw.js` (admin vê tudo, outros veem escopo)
- Teste enviando push via **Firebase Cloud Messaging** ou **Edge Function**

---

## 📞 Suporte Adicional

**Ferramentas úteis:**
- PWABuilder: https://www.pwabuilder.com/
- Manifest Validator: https://manifest-validator.appspot.com/
- Lighthouse: https://developers.google.com/web/tools/lighthouse
- Android Asset Studio (Ícones): https://romannurik.github.io/AndroidAssetStudio/

**Docs:**
- Google Play Console Help: https://support.google.com/googleplay/android-developer/
- PWA on Google Play: https://web.dev/install-criteria/#criteria
- LGPD Brasil: https://www.gov.br/cidadania/pt-br/acesso-a-informacao/lgpd

---

## ⚡ Cronograma Recomendado

| Etapa | Tempo | Descrição |
|-------|-------|-----------|
| 1. Setup Play Console | 1 hora | Criar conta, pagar $25 |
| 2. PWABuilder + Gerar AAB | 1-2 horas | Pode levar se internet lenta |
| 3. Submeter para review | 15 min | Preencher dados |
| 4. Aguardar aprovação | 2-4 horas | Google aprova automaticamente (na maioria dos casos) |
| 5. Publicar | 5 min | Clique em "Go live" |
| **Total** | **~1 dia** | Pode variar por fatores externos |

---

**Versão:** 1.0  
**Data:** 2026-04-01  
**Status:** Pronto para publicação
