import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";

export function PwaOnboarding() {
  const isNativeApp = Capacitor.isNativePlatform();
  const [show, setShow] = useState(false);
  const { usuario, session } = useUser();

  // Comentario: prepara scope para validacao de hierarquia em notificacoes
  const userScopeIds = (session?.scope_totvs_ids || usuario?.totvs_access || []).filter(Boolean);

  const { supported, subscribed, subscribe, loading: pushLoading } = usePushNotifications(
    usuario?.id ? String(usuario.id) : undefined,
    usuario?.role,
    userScopeIds
  );
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!usuario) return;

    // Se já foi dispensado e está com push assinado, não vamos mais lembrar.
    if (localStorage.getItem("pwa_onboarding_dismissed") === "true" && subscribed) {
      return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isMobileDevice = /iphone|ipad|ipod|android/i.test(ua);
    const iOSDevice = /iphone|ipad|ipod/i.test(ua);
    const standaloneMode = 
      window.matchMedia("(display-mode: standalone)").matches || 
      (window.navigator as any).standalone || 
      document.referrer.includes("android-app://");

    setIsMobile(isMobileDevice);
    setIsIOS(iOSDevice);
    setIsStandalone(standaloneMode);

    if (isMobileDevice) {
      // Se não está instalado, sempre mostra como primeiro incentivo.
      if (!standaloneMode) {
        setShow(true);
      } 
      // Se está instalado, mas o Push não foi aceito ainda e o aparelho suporta, pediremos!
      else if (standaloneMode && supported && !subscribed) {
        setShow(true);
      }
    }
  }, [usuario, supported, subscribed]);

  const handleDismiss = () => {
    localStorage.setItem("pwa_onboarding_dismissed", "true");
    setShow(false);
  };

  const handleSubscribe = async () => {
    await subscribe();
    // Comentario: ao ativar notificações, marca como dispensado e fecha
    localStorage.setItem("pwa_onboarding_dismissed", "true");
    setShow(false);
  };

  // Comentario: fecha banner quando notificações são ativadas
  useEffect(() => {
    if (subscribed && show) {
      localStorage.setItem("pwa_onboarding_dismissed", "true");
      setShow(false);
    }
  }, [subscribed, show]);

  if (!show || !isMobile || isNativeApp) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 border-t border-sky-800 bg-sky-900 shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex flex-col gap-3 mx-auto max-w-sm">
        <h3 className="font-bold text-lg text-white">SGE IPDA Pronta! 👋</h3>
        
        {!isStandalone ? (
          <p className="text-sm text-sky-50 leading-relaxed">
            Tenha a melhor experiência e receba as <strong className="text-white">Notificações!</strong>
            {isIOS 
              ? " Toque no botão [Compartilhar] abaixo da tela do Safari e selecione 'Adicionar à Tela de Início' para instalar o aplicativo. Depois ative o sino!" 
              : " Pressione 'Instalar App' nas configurações do Chrome e ative o botão abaixo."}
          </p>
        ) : (
          <p className="text-sm text-sky-50 leading-relaxed">
            Seu app já está instalado! Agora ative as notificações abaixo para ser avisado sobre aprovações e aniversários dos membros da congregação.
          </p>
        )}

        <div className="flex gap-2 w-full mt-2">
          {(!subscribed && supported) && (
            <Button 
              onClick={handleSubscribe} 
              disabled={pushLoading}
              className="flex-1 bg-white hover:bg-sky-100 text-sky-900 shadow-sm"
            >
              {pushLoading ? "Ativando..." : "Ligar Alertas"}
            </Button>
          )}
          
          <Button 
            onClick={handleDismiss} 
            variant="ghost" 
            className="flex-1 text-sky-100/80 hover:bg-sky-800 hover:text-white"
          >
            Fechar janela
          </Button>
        </div>
      </div>
    </div>
  );
}
