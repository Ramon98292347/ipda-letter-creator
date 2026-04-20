/**
 * AvatarCapture.tsx
 * -----------------
 * Componente de captura de foto 3x4 com detecÃ§Ã£o de rosto em tempo real.
 *
 * Fluxo Ãºnico (web + Android):
 *  1. "Tirar Foto" abre getUserMedia com overlay de marcadores 3x4
 *  2. DetecÃ§Ã£o de rosto ao vivo com guia oval, linha de ombros, mÃ¡scara
 *  3. "Galeria" abre input file nativo do navegador/WebView
 *  4. Valida rosto com face-api antes de aceitar
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { Capacitor } from "@capacitor/core";
import { Camera, CheckCircle, FlipHorizontal, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Tamanho final da foto (proporÃ§Ã£o 3x4)
const FOTO_WIDTH = 300;
const FOTO_HEIGHT = 400;

// Tamanho do visor da cÃ¢mera na tela
const DISPLAY_WIDTH = 270;
const DISPLAY_HEIGHT = 360;

function getContainRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
) {
  const safeSrcW = Math.max(1, srcW);
  const safeSrcH = Math.max(1, srcH);
  const scale = Math.min(destW / safeSrcW, destH / safeSrcH);
  const drawW = safeSrcW * scale;
  const drawH = safeSrcH * scale;
  const offsetX = (destW - drawW) / 2;
  const offsetY = (destH - drawH) / 2;
  return { drawW, drawH, offsetX, offsetY };
}

interface AvatarCaptureProps {
  onFileReady: (file: File | null) => void;
  disabled?: boolean;
  currentUrl?: string;
}

export function AvatarCapture({ onFileReady, disabled = false, currentUrl }: AvatarCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const useCanvasPreview = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const facingModeRef = useRef<"user" | "environment">("user");
  const detectionLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // â”€â”€ Carregar modelos ao montar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    let cancelled = false;
    async function carregarModelos() {
      setLoadingModels(true);
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        if (!cancelled) { setModelsLoaded(true); setStatusMsg(""); }
      } catch {
        if (!cancelled) setStatusMsg("Deteccao indisponivel");
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }
    void carregarModelos();
    return () => { cancelled = true; pararCamera(); };
  }, []);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // â”€â”€ CÃ¢mera (getUserMedia) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function iniciarCamera(modo: "user" | "environment" = "user") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: modo,
          width: { ideal: 720 },
          height: { ideal: 960 },
          aspectRatio: { ideal: FOTO_WIDTH / FOTO_HEIGHT },
        },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(modo);
      facingModeRef.current = modo;
      setCameraActive(true);
      setFaceDetected(false);
      setStatusMsg("");

      setTimeout(() => {
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          const handlePlaying = () => {
            video.removeEventListener("playing", handlePlaying);
            if (modelsLoaded || useCanvasPreview) iniciarDeteccao();
          };
          video.addEventListener("playing", handlePlaying);
          void video.play();
        }
      }, 0);
    } catch (err) {
      console.error("getUserMedia erro:", err);
      setStatusMsg("Camera indisponivel. Verifique as permissoes.");
    }
  }

  async function alternarCamera() {
    const novoModo = facingModeRef.current === "user" ? "environment" : "user";
    if (detectionLoopRef.current !== null) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setFaceDetected(false);
    setFacingMode(novoModo);
    facingModeRef.current = novoModo;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: novoModo,
          width: { ideal: 720 },
          height: { ideal: 960 },
          aspectRatio: { ideal: FOTO_WIDTH / FOTO_HEIGHT },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        const handlePlaying = () => {
          video.removeEventListener("playing", handlePlaying);
          if (modelsLoaded || useCanvasPreview) iniciarDeteccao();
        };
        video.addEventListener("playing", handlePlaying);
        void video.play();
      }
    } catch {
      setStatusMsg("Camera traseira indisponivel.");
    }
  }

  function pararCamera() {
    if (detectionLoopRef.current !== null) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setFaceDetected(false);
  }

  // â”€â”€ Loop de detecÃ§Ã£o com marcadores 3x4 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const iniciarDeteccao = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = DISPLAY_WIDTH;
    canvas.height = DISPLAY_HEIGHT;

    async function detectar() {
      if (!video || !canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (useCanvasPreview) {
        // Android WebView can place <video> in a layer above DOM overlays.
        // Rendering preview inside canvas guarantees guide visibility.
        const rect = getContainRect(
          video.videoWidth || DISPLAY_WIDTH,
          video.videoHeight || DISPLAY_HEIGHT,
          DISPLAY_WIDTH,
          DISPLAY_HEIGHT,
        );
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
        ctx.save();
        if (facingModeRef.current === "user") {
          ctx.translate(DISPLAY_WIDTH, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, rect.offsetX, rect.offsetY, rect.drawW, rect.drawH);
        ctx.restore();
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      desenharMarcadores3x4(ctx);

      let detections: Awaited<ReturnType<typeof faceapi.detectAllFaces>> = [];
      if (modelsLoaded) {
        detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );
      }

      if (detections.length > 0) {
        const rect = getContainRect(
          video.videoWidth || DISPLAY_WIDTH,
          video.videoHeight || DISPLAY_HEIGHT,
          DISPLAY_WIDTH,
          DISPLAY_HEIGHT,
        );
        const scaleX = rect.drawW / (video.videoWidth || DISPLAY_WIDTH);
        const scaleY = rect.drawH / (video.videoHeight || DISPLAY_HEIGHT);
        const det = detections[0].box;
        const rosto = {
          x: rect.offsetX + det.x * scaleX,
          y: rect.offsetY + det.y * scaleY,
          width: det.width * scaleX,
          height: det.height * scaleY,
        };
        const dentroDoGuia = verificarRostoDentroOval(rosto);
        setFaceDetected(dentroDoGuia);
        ctx.strokeStyle = dentroDoGuia ? "#22c55e" : "#f59e0b";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 8;
        ctx.shadowColor = dentroDoGuia ? "#22c55e" : "#f59e0b";
        ctx.strokeRect(rosto.x, rosto.y, rosto.width, rosto.height);
        ctx.shadowBlur = 0;
      } else {
        setFaceDetected(false);
      }
      detectionLoopRef.current = requestAnimationFrame(detectar);
    }
    detectionLoopRef.current = requestAnimationFrame(detectar);
  }, [modelsLoaded, useCanvasPreview]);

  useEffect(() => {
    if (cameraActive && (modelsLoaded || useCanvasPreview) && detectionLoopRef.current === null) {
      iniciarDeteccao();
    }
  }, [cameraActive, modelsLoaded, useCanvasPreview, iniciarDeteccao]);

  // â”€â”€ Marcadores visuais 3x4 no canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function desenharMarcadores3x4(ctx: CanvasRenderingContext2D) {
    const cx = DISPLAY_WIDTH / 2;
    const cy = DISPLAY_HEIGHT * 0.40; // Um pouco mais para baixo para dar espaco acima da cabeca
    const rx = DISPLAY_WIDTH * 0.20; // Reduzido (antes 0.28) para forcar o usuario a afastar o celular
    const ry = DISPLAY_HEIGHT * 0.22; // Reduzido (antes 0.30)
  
    // Mascara escura fora da oval
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 8, ry + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  
    // Oval da cabeca (tracejada)
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  
    // Linha dos ombros
    const ombrosY = DISPLAY_HEIGHT * 0.78;
    ctx.beginPath();
    ctx.moveTo(DISPLAY_WIDTH * 0.15, ombrosY);
    ctx.lineTo(DISPLAY_WIDTH * 0.85, ombrosY);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ombros", cx, ombrosY + 12);
  
    // Marca topo da cabeca
    const topoY = cy - ry - 12;
    ctx.beginPath();
    ctx.moveTo(cx - 15, topoY);
    ctx.lineTo(cx + 15, topoY);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  
    // Regras no rodape
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FOTO 3x4 \u2014 Individual", cx, DISPLAY_HEIGHT - 28);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Rosto, pescoco e ombros dentro do guia", cx, DISPLAY_HEIGHT - 14);
  }
  
  function verificarRostoDentroOval(box: { x: number; y: number; width: number; height: number }): boolean {
    const cx = DISPLAY_WIDTH / 2;
    const cy = DISPLAY_HEIGHT * 0.40;
    const rx = DISPLAY_WIDTH * 0.28; // Limite de tolerancia maior que o desenho, mas bem menor que antes
    const ry = DISPLAY_HEIGHT * 0.30;
  
    const cantos = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x, y: box.y + box.height },
      { x: box.x + box.width, y: box.y + box.height },
    ];
    const todosDentro = cantos.every((c) => {
      const normX = (c.x - cx) / rx;
      const normY = (c.y - cy) / ry;
      return normX * normX + normY * normY <= 1;
    });
    // Box precisa ter pelo menos 22% do visor para nÃ£o considerar um rosto muito longe
    return todosDentro && box.width > DISPLAY_WIDTH * 0.22;
  }

  // â”€â”€ Capturar foto do vÃ­deo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function capturarFoto() {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = FOTO_WIDTH;
      canvas.height = FOTO_HEIGHT;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, FOTO_WIDTH, FOTO_HEIGHT);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(FOTO_WIDTH / vw, FOTO_HEIGHT / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const drawX = (FOTO_WIDTH - drawW) / 2;
      const drawY = (FOTO_HEIGHT - drawH) / 2;
      if (facingModeRef.current === "user") {
        ctx.translate(FOTO_WIDTH, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, drawX, drawY, drawW, drawH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      canvas.toBlob(async (blob) => {
        if (!blob) { setCapturing(false); setStatusMsg("Erro ao capturar."); return; }
        pararCamera();
        const arquivo = new File([blob], "avatar.jpg", { type: "image/jpeg" });
        await processarFoto(arquivo);
        setCapturing(false);
      }, "image/jpeg", 0.82);
    } catch {
      setCapturing(false);
      setStatusMsg("Erro ao capturar.");
    }
  }

  // â”€â”€ Galeria (input file) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleGaleria(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setProcessing(true);
    setStatusMsg("Preparando arquivo...");
    setProgress(20);

    if (false && modelsLoaded) {
      try {
        const img = await carregarImagem(file);
        const detections = await faceapi.detectAllFaces(
          img,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );

        if (detections.length > 1) {
          setStatusMsg("Mais de um rosto detectado. A foto deve ser INDIVIDUAL (3x4).");
          setProcessing(false);
          return;
        }
        if (detections.length === 0) {
          setStatusMsg("Rosto nao detectado. Envie uma foto 3x4 (rosto, pescoco e ombros).");
          setProcessing(false);
          return;
        }

        const det = detections[0].box;
        const rostoPercentual = det.width / img.naturalWidth;
        if (rostoPercentual < 0.20) {
          setStatusMsg("Rosto muito pequeno. A foto deve mostrar rosto, pescoÃ§o e ombros.");
          setProcessing(false);
          return;
        }
        if (rostoPercentual > 0.55) {
          setStatusMsg("Foto muito aproximada. A foto deve mostrar rosto, pescoco e ombros.");
          setProcessing(false);
          return;
        }
      } catch {
        // Comentario: se face-api falhar, aceita a foto sem validaÃ§Ã£o
      }
    }

    setProgress(50);
    void processarFoto(file);
  }

  // â”€â”€ Processar imagem (fundo branco + crop 3x4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function processarFoto(rawFile: File) {
    setProcessing(true);
    setStatusMsg("Preparando foto...");
    setProgress(60);
    try {
      const img = await carregarImagem(rawFile);
      const canvas = document.createElement("canvas");
      canvas.width = FOTO_WIDTH;
      canvas.height = FOTO_HEIGHT;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, FOTO_WIDTH, FOTO_HEIGHT);
      const scale = Math.max(FOTO_WIDTH / img.naturalWidth, FOTO_HEIGHT / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (FOTO_WIDTH - w) / 2, (FOTO_HEIGHT - h) / 2, w, h);
      setProgress(80);
      canvas.toBlob((blob) => {
        if (!blob) { setProcessing(false); setStatusMsg("Erro ao processar."); return; }
        const arquivo = new File([blob], "avatar.jpg", { type: "image/jpeg" });
        const url = URL.createObjectURL(arquivo);
        setPreviewUrl(url);
        setProgress(100);
        setStatusMsg("");
        onFileReady(arquivo);
        setProcessing(false);
      }, "image/jpeg", 0.82);
    } catch {
      setProcessing(false);
      setStatusMsg("Erro ao processar a imagem.");
    }
  }

  function carregarImagem(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Erro ao carregar")); };
      img.src = url;
    });
  }

  function removerFoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setStatusMsg("");
    setProgress(0);
    onFileReady(null);
  }

  function GuideOverlay({ subtle = false }: { subtle?: boolean }) {
    const stroke = subtle ? "#94a3b8" : "rgba(255,255,255,0.92)";
    const softStroke = subtle ? "#94a3b8" : "rgba(255,255,255,0.62)";
    const fill = subtle ? "rgba(203,213,225,0.45)" : "rgba(255,255,255,0.20)";

    return (
      <svg
        viewBox={`0 0 ${FOTO_WIDTH} ${FOTO_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <ellipse
          cx={FOTO_WIDTH / 2}
          cy={FOTO_HEIGHT * 0.35}
          rx={FOTO_WIDTH * 0.23}
          ry={FOTO_HEIGHT * 0.22}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray="16 10"
        />
        <line
          x1={FOTO_WIDTH * 0.14}
          y1={FOTO_HEIGHT * 0.76}
          x2={FOTO_WIDTH * 0.86}
          y2={FOTO_HEIGHT * 0.76}
          stroke={softStroke}
          strokeWidth="3"
          strokeDasharray="10 8"
        />
        <path
          d={`
            M ${FOTO_WIDTH * 0.18} ${FOTO_HEIGHT * 0.78}
            C ${FOTO_WIDTH * 0.25} ${FOTO_HEIGHT * 0.66},
              ${FOTO_WIDTH * 0.38} ${FOTO_HEIGHT * 0.60},
              ${FOTO_WIDTH * 0.50} ${FOTO_HEIGHT * 0.60}
            C ${FOTO_WIDTH * 0.62} ${FOTO_HEIGHT * 0.60},
              ${FOTO_WIDTH * 0.75} ${FOTO_HEIGHT * 0.66},
              ${FOTO_WIDTH * 0.82} ${FOTO_HEIGHT * 0.78}
            L ${FOTO_WIDTH * 0.82} ${FOTO_HEIGHT * 0.90}
            L ${FOTO_WIDTH * 0.18} ${FOTO_HEIGHT * 0.90}
            Z
          `}
          fill={fill}
        />
      </svg>
    );
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <div className="space-y-2">

      {/* â”€â”€ PREVIEW FINAL â”€â”€ */}
      {previewUrl && !cameraActive && (
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="relative overflow-hidden rounded-md border-2 border-green-400 bg-slate-50" style={{ width: 90, height: 120 }}>
              <img src={previewUrl} alt="Foto 3x4" className="h-full w-full object-cover" />
              <GuideOverlay />
            </div>
            <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
              <CheckCircle className="h-3 w-3" /> Foto pronta
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => { removerFoto(); void iniciarCamera("user"); }} disabled={disabled}>
              <RefreshCw className="h-4 w-4 mr-1" /> Nova foto
            </Button>
            <button type="button" onClick={removerFoto} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700" disabled={disabled}>
              <X className="h-3 w-3" /> Remover
            </button>
          </div>
        </div>
      )}

      {/* CAMERA COM MARCADORES 3x4 */}
      {cameraActive && (
        <div className="space-y-2">
          <div className="relative rounded-md overflow-hidden border border-slate-300" style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}>
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-contain bg-black"
              style={{
                transform: facingMode === "user" ? "scaleX(-1)" : "none",
                opacity: useCanvasPreview ? 0 : 1,
                pointerEvents: "none",
              }}
              muted
              playsInline
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-10 pointer-events-none"
              style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}
            />
            <div className="absolute inset-0 z-20 pointer-events-none">
              <GuideOverlay />
            </div>
          </div>

          <div className="text-xs">
            {faceDetected ? (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle className="h-3 w-3" /> Rosto enquadrado - pronto para capturar!
              </span>
            ) : (
              <span className="text-slate-500">Posicione o rosto dentro do guia oval...</span>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={() => void capturarFoto()} disabled={capturing || (modelsLoaded && !faceDetected)} className="flex-1" size="sm">
              {capturing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
              {capturing ? "Capturando..." : modelsLoaded && !faceDetected ? "Enquadre o rosto..." : "Capturar"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void alternarCamera()} title="Alternar câmera">
              <FlipHorizontal className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={pararCamera}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* â”€â”€ ESTADO INICIAL â”€â”€ */}
      {!cameraActive && !previewUrl && (
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void iniciarCamera("user")}
              disabled={disabled || processing || loadingModels}
            >
              {loadingModels ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
              {loadingModels ? "Carregando..." : "Tirar Foto"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => galleryInputRef.current?.click()}
              disabled={disabled || processing}
            >
              <Upload className="h-4 w-4 mr-1" /> Galeria
            </Button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="*/*"
              capture={undefined}
              className="hidden"
              disabled={disabled || processing}
              onChange={handleGaleria}
            />

            {processing ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {statusMsg || "Processando..."}
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : statusMsg ? (
              <p className="text-xs text-amber-600">{statusMsg}</p>
            ) : (
              <p className="text-xs text-slate-500">Foto 3x4 individual (rosto, pescoco e ombros).</p>
            )}
          </div>

          {/* Guia visual miniatura */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative overflow-hidden rounded-md border border-slate-300 bg-slate-100" style={{ width: 90, height: 120 }}>
              {processing ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
              ) : currentUrl ? (
                <>
                  <img src={currentUrl} alt="Foto atual" className="h-full w-full object-cover object-top" />
                  <GuideOverlay subtle />
                </>
              ) : (
                <svg viewBox="0 0 90 120" className="h-full w-full">
                  <rect width="90" height="120" fill="#f1f5f9" />
                  <ellipse cx="45" cy="42" rx="20" ry="26" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
                  <line x1="12" y1="90" x2="78" y2="90" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 2" />
                  <path d="M45 68 C30 68 18 78 14 92 L76 92 C72 78 60 68 45 68Z" fill="#cbd5e1" opacity="0.5" />
                  <text x="45" y="108" textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="bold">3x4</text>
                  <text x="45" y="117" textAnchor="middle" fontSize="5.5" fill="#94a3b8">individual</text>
                </svg>
              )}
            </div>
            <span className="text-[10px] text-slate-500">{currentUrl ? "Foto atual" : "Modelo 3x4"}</span>
          </div>
        </div>
      )}
    </div>
  );
}



