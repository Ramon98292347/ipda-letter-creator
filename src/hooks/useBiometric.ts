import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
// O novo plugin lida muito melhor com biometrias mescladas ou devices sem hardware (ou senhas fallback)
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

type Credentials = { username: string; password: string };

const LS_BIOMETRIC_ENABLED = "ipda_biometric_enabled";

export function useBiometric() {
  const isNative = Capacitor.isNativePlatform();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_BIOMETRIC_ENABLED) === "1";
  });

  // Comentario: verifica se o aparelho tem hardware/biometria cadastrada com o novo plugin
  useEffect(() => {
    if (!isNative) return;
    void (async () => {
      try {
        const result = await BiometricAuth.checkBiometry();
        console.log("[biometric] checkBiometry:", result);
        setAvailable(result.isAvailable);
      } catch (err) {
        console.warn("[biometric] erro checkBiometry:", err);
        // Em caso de erro, nao escondemos o botao de imediato, isso é tratado no PhoneIdentify puxando isNative
        setAvailable(false);
      }
    })();
  }, [isNative]);

  // Comentario: verifica identidade via API nativa oficial de fallback
  const verify = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    try {
      await BiometricAuth.authenticate({
        reason: "Confirme sua identidade para acessar o sistema",
        cancelTitle: "Cancelar",
        allowDeviceCredential: true, // EXATAMENTE a mesma flag originária do Android DEVICE_CREDENTIAL
      });
      return true;
    } catch (err) {
      console.warn("[biometric] falha na identificacao ou cancelado:", err);
      return false;
    }
  }, [isNative]);

  // Comentario: salva credenciais (usado LocalStorage codificado em Base64 para bypassar o Keystore nativo que limitava aparelhos)
  const saveCredentials = useCallback(async (username: string, password: string) => {
    try {
      const payload = btoa(JSON.stringify({ username, password }));
      localStorage.setItem("ipda_biometric_data", payload);
      localStorage.setItem(LS_BIOMETRIC_ENABLED, "1");
      setEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Comentario: recupera credenciais para login silencioso
  const loadCredentials = useCallback(async (): Promise<Credentials | null> => {
    try {
      const payload = localStorage.getItem("ipda_biometric_data");
      if (!payload) return null;
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }, []);

  // Comentario: desativa digital
  const clearCredentials = useCallback(async () => {
    localStorage.removeItem(LS_BIOMETRIC_ENABLED);
    localStorage.removeItem("ipda_biometric_data");
    setEnabled(false);
  }, []);

  return {
    isNative,
    available,
    enabled,
    verify,
    saveCredentials,
    loadCredentials,
    clearCredentials,
  };
}
