import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

// Comentario: integracao com plugin capacitor-native-biometric.
// Importacao dinamica para evitar erro de build no PWA (plugin so existe no nativo).
type Credentials = { username: string; password: string };

const SERVER = "ipda.sistema.biometric";
const LS_BIOMETRIC_ENABLED = "ipda_biometric_enabled";

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import("capacitor-native-biometric");
    return mod.NativeBiometric;
  } catch (err) {
    // Comentario: log para diagnosticar se o plugin nao foi instalado/sincronizado
    console.warn("[biometric] plugin nao disponivel:", err);
    return null;
  }
}

export function useBiometric() {
  const isNative = Capacitor.isNativePlatform();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_BIOMETRIC_ENABLED) === "1";
  });

  // Comentario: verifica se o aparelho tem hardware/biometria cadastrada
  useEffect(() => {
    if (!isNative) return;
    void (async () => {
      const NativeBiometric = await getPlugin();
      if (!NativeBiometric) return;
      try {
        const result = await NativeBiometric.isAvailable();
        console.log("[biometric] isAvailable:", result);
        setAvailable(Boolean(result.isAvailable));
      } catch (err) {
        console.warn("[biometric] erro isAvailable:", err);
        setAvailable(false);
      }
    })();
  }, [isNative]);

  // Comentario: verifica identidade via BiometricPrompt nativo
  const verify = useCallback(async (): Promise<boolean> => {
    const NativeBiometric = await getPlugin();
    if (!NativeBiometric) return false;
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Confirme sua identidade para entrar",
        title: "Login com digital",
        subtitle: "Use sua biometria para acessar o sistema",
        description: "Toque o sensor de digital",
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Comentario: salva credenciais no Keystore protegido por digital
  const saveCredentials = useCallback(async (username: string, password: string) => {
    const NativeBiometric = await getPlugin();
    if (!NativeBiometric) return false;
    try {
      await NativeBiometric.setCredentials({ username, password, server: SERVER });
      localStorage.setItem(LS_BIOMETRIC_ENABLED, "1");
      setEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Comentario: recupera credenciais (so retorna apos verifyIdentity bem sucedido)
  const loadCredentials = useCallback(async (): Promise<Credentials | null> => {
    const NativeBiometric = await getPlugin();
    if (!NativeBiometric) return null;
    try {
      const creds = await NativeBiometric.getCredentials({ server: SERVER });
      return { username: creds.username, password: creds.password };
    } catch {
      return null;
    }
  }, []);

  // Comentario: remove credenciais e desativa biometria
  const clearCredentials = useCallback(async () => {
    const NativeBiometric = await getPlugin();
    localStorage.removeItem(LS_BIOMETRIC_ENABLED);
    setEnabled(false);
    if (!NativeBiometric) return;
    try {
      await NativeBiometric.deleteCredentials({ server: SERVER });
    } catch {
      // Comentario: ignora erro se nao havia credencial
    }
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
