/**
 * AvatarCapture.tsx
 * -----------------
 * Componente de captura de foto 3x4 com detecção de rosto em tempo real.
 *
 * Fluxo:
 *  1. Abre a câmera frontal usando getUserMedia
 *  2. Carrega o modelo TinyFaceDetector do face-api.js (de /public/models/)
 *  3. Detecta rosto em tempo real com overlay verde quando enquadrado
 *  4. Mostra guia oval para posicionamento do rosto
 *  5. Botão "Capturar" só ativa quando o rosto está dentro do guia
 *  6. Captura o frame, comprime para JPEG (qualidade 0.82) com fundo branco 3x4
 *  7. Chama onFileReady com o arquivo final
 *  8. Alternativa: usar galeria (sem detecção, mas com ajuste de proporção)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { Camera, CheckCircle, FlipHorizontal, Loader2, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Tamanho final da foto (proporção 3x4)
const FOTO_WIDTH = 300;
const FOTO_HEIGHT = 400;

// Tamanho do visor da câmera na tela
const DISPLAY_WIDTH = 270;
const DISPLAY_HEIGHT = 360;

interface AvatarCaptureProps {
  /** Chamado quando a foto final estiver pronta (ou null se removida) */
  onFileReady: (file: File | null) => void;
  disabled?: boolean;
  /** URL da foto já cadastrada — mostra a imagem atual ao editar */
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

  // facingMode controla qual câmera está ativa (user = frontal, environment = traseira)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  // Ref para evitar stale closure dentro de capturarFoto
  const facingModeRef = useRef<"user" | "environment">("user");

  const detectionLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Carregar modelos ao montar ──────────────────────────────────────────────
  useEffect(() => {
    async function carregarModelos() {
      setLoadingModels(true);
      setStatusMsg("Carregando detecção de rosto...");
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        setModelsLoaded(true);
        setStatusMsg("");
      } catch {
        setStatusMsg("Detecção indisponível (modelos não encontrados)");
      } finally {
        setLoadingModels(false);
      }
    }
    void carregarModelos();
    return () => pararCamera();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── Câmera ──────────────────────────────────────────────────────────────────
  // Aceita um modo opcional: "user" (frontal) ou "environment" (traseira)
  async function iniciarCamera(modo: "user" | "environment" = "user") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: modo, width: { ideal: FOTO_WIDTH }, height: { ideal: FOTO_HEIGHT } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        setFacingMode(modo);
        facingModeRef.current = modo;
        setCameraActive(true);
        setFaceDetected(false);

        // Comentario: play() pode falhar se permissão de câmera foi negada
        // Mas se chegou aqui, permissão foi concedida
        video.play().then(() => {
          if (modelsLoaded) iniciarDeteccao();
        }).catch(() => {
          // Se play falhar, inicia deteccao mesmo assim
          if (modelsLoaded) iniciarDeteccao();
        });
      }
    } catch {
      setStatusMsg("Câmera indisponível. Use a galeria.");
    }
  }

  // Alterna entre câmera frontal e traseira sem desmontar o vídeo
  async function alternarCamera() {
    const novoModo = facingModeRef.current === "user" ? "environment" : "user";
    // Para o loop de detecção
    if (detectionLoopRef.current !== null) {
      cancelAnimationFrame(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    // Para o stream atual
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setFaceDetected(false);
    setFacingMode(novoModo);
    facingModeRef.current = novoModo;
    // Abre novo stream e troca direto no elemento <video>
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: novoModo, width: { ideal: FOTO_WIDTH }, height: { ideal: FOTO_HEIGHT } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // Aguarda o vídeo começar a tocar para iniciar a detecção
        const handlePlaying = () => {
          video.removeEventListener("playing", handlePlaying);
          if (modelsLoaded) iniciarDeteccao();
        };
        video.addEventListener("playing", handlePlaying);
        void video.play();
      }
    } catch {
      setStatusMsg("Câmera traseira indisponível.");
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
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
  }

  // ── Loop de detecção ────────────────────────────────────────────────────────
  const iniciarDeteccao = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = DISPLAY_WIDTH;
    canvas.height = DISPLAY_HEIGHT;

    async function detectar() {
      if (!video || !canvas) return;
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
      );
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      desenharGuiaOval(ctx);

      if (detections.length > 0) {
        // Calcula escala manualmente: video.width (atributo HTML) pode ser 0,
        // por isso usamos video.videoWidth (resolução real do stream)
        const scaleX = DISPLAY_WIDTH / (video.videoWidth || DISPLAY_WIDTH);
        const scaleY = DISPLAY_HEIGHT / (video.videoHeight || DISPLAY_HEIGHT);
        const det = detections[0].box;
        // Aplica a escala manualmente na caixa de detecção
        const rosto = {
          x: det.x * scaleX,
          y: det.y * scaleY,
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
  }, []);

  function desenharGuiaOval(ctx: CanvasRenderingContext2D) {
    const cx = DISPLAY_WIDTH / 2;
    const cy = DISPLAY_HEIGHT * 0.42;
    ctx.beginPath();
    ctx.ellipse(cx, cy, DISPLAY_WIDTH * 0.30, DISPLAY_HEIGHT * 0.36, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Posicione o rosto aqui", cx, DISPLAY_HEIGHT - 16);
  }

  function verificarRostoDentroOval(box: { x: number; y: number; width: number; height: number }): boolean {
    const cx = DISPLAY_WIDTH / 2;
    const cy = DISPLAY_HEIGHT * 0.42;
    const rx = DISPLAY_WIDTH * 0.35;   // Semi-eixo horizontal da oval
    const ry = DISPLAY_HEIGHT * 0.40;  // Semi-eixo vertical da oval

    // Comentario: verifica se TODOS os 4 cantos do rosto estão dentro da oval
    // Isto garante que 100% do rosto está dentro da bolinha, não apenas o centro
    const cantos = [
      { x: box.x, y: box.y },                          // Canto superior esquerdo
      { x: box.x + box.width, y: box.y },              // Canto superior direito
      { x: box.x, y: box.y + box.height },             // Canto inferior esquerdo
      { x: box.x + box.width, y: box.y + box.height }, // Canto inferior direito
    ];

    const todosDentroOval = cantos.every((canto) => {
      const normX = (canto.x - cx) / rx;
      const normY = (canto.y - cy) / ry;
      return Math.pow(normX, 2) + Math.pow(normY, 2) <= 1;
    });

    // Comentario: rosto deve ocupar pelo menos 38% da largura (cabeça+pescoço+ombros, formato 3x4)
    const tamanhoMinimo = box.width > DISPLAY_WIDTH * 0.38;

    return todosDentroOval && tamanhoMinimo;
  }

  // ── Capturar foto ───────────────────────────────────────────────────────────
  async function capturarFoto() {
    const video = videoRef.current;
    if (!video) return;
    setCapturing(true);
    setStatusMsg("Capturando...");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = FOTO_WIDTH;
      canvas.height = FOTO_HEIGHT;
      const ctx = canvas.getContext("2d")!;
      // Fundo branco para evitar transparência
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, FOTO_WIDTH, FOTO_HEIGHT);
      // Cover/crop: escala proporcional sem distorção, centralizado
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(FOTO_WIDTH / vw, FOTO_HEIGHT / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const drawX = (FOTO_WIDTH - drawW) / 2;
      const drawY = (FOTO_HEIGHT - drawH) / 2;
      // Espelha horizontalmente somente na câmera frontal
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

  // ── Galeria ─────────────────────────────────────────────────────────────────
  // Comentario: VALIDACAO RIGOROSA - so aceita fotos com rosto/pescoço/ombros (3x4)
  // Bloqueia: corpo inteiro, rosto muito pequeno, rosto nao detectado
  async function handleGaleria(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Comentario: OBRIGATORIO carregar modelos para validar arquivo importado
    if (!modelsLoaded) {
      setStatusMsg("❌ Detecção indisponível. Use a câmera para capturar foto.");
      return;
    }

    setProcessing(true);
    setStatusMsg("Verificando rosto na imagem...");
    setProgress(20);
    try {
      const img = await carregarImagem(file);
      const detections = await faceapi.detectAllFaces(
        img,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
      );

      // Regra 1: DEVE detectar rosto (nao aceita se nao encontrar)
      if (detections.length === 0) {
        setStatusMsg("❌ Rosto não detectado. Tire uma foto apenas do rosto com pescoço e ombros (3x4).");
        setProcessing(false);
        return;
      }

      const det = detections[0].box;
      const rostoPercentual = det.width / img.naturalWidth;

      // Regra 2: Rosto deve ocupar entre 30% e 65% da largura (nem muito pequeno, nem corpo inteiro)
      if (rostoPercentual < 0.30) {
        setStatusMsg("❌ Rosto muito pequeno. Aproxime mais a câmera/imagem.");
        setProcessing(false);
        return;
      }

      if (rostoPercentual > 0.65) {
        setStatusMsg("❌ Foto muito aproximada. Deve mostrar rosto, pescoço e ombros apenas.");
        setProcessing(false);
        return;
      }

      // Regra 3: Proporção da imagem (3x4 = 1.33 razão altura/largura)
      const razaoAspect = img.naturalHeight / img.naturalWidth;
      if (razaoAspect < 1.20 || razaoAspect > 1.50) {
        setStatusMsg("❌ Formato inválido. Use proporção 3x4 (altura > largura).");
        setProcessing(false);
        return;
      }

      setStatusMsg("✅ Foto validada com sucesso!");
      setProgress(50);
    } catch (err) {
      setStatusMsg("❌ Erro ao validar imagem. Tente novamente ou use a câmera.");
      setProcessing(false);
      return;
    }

    void processarFoto(file);
  }

  // ── Processar imagem (fundo branco + proporção 3x4) ──────────────────────
  async function processarFoto(rawFile: File) {
    setProcessing(true);
    setStatusMsg("Preparando foto...");
    setProgress(30);
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
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Erro ao carregar imagem")); };
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Preview final */}
      {previewUrl && !cameraActive && (
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1">
            <div
              className="overflow-hidden rounded-md border-2 border-green-400 bg-slate-50"
              style={{ width: 90, height: 120 }}
            >
              <img src={previewUrl} alt="Foto 3x4" className="h-full w-full object-cover" />
            </div>
            <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
              <CheckCircle className="h-3 w-3" /> Foto pronta
            </span>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { removerFoto(); void iniciarCamera("user"); }}
              disabled={disabled}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Nova foto
            </Button>
            <button
              type="button"
              onClick={removerFoto}
              className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700"
              disabled={disabled}
            >
              <X className="h-3 w-3" /> Remover
            </button>
          </div>
        </div>
      )}

      {/* Câmera ativa */}
      {cameraActive && (
        <div className="space-y-2">
          <div
            className="relative rounded-md overflow-hidden border border-slate-300"
            style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}
          >
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
              muted
              playsInline
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0"
              style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}
            />
          </div>

          <div className="text-xs">
            {faceDetected ? (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle className="h-3 w-3" />
                Rosto enquadrado — pronto para capturar!
              </span>
            ) : (
              <span className="text-slate-500">Posicione o rosto dentro do guia oval...</span>
            )}
          </div>

          <div className="flex gap-2">
            {/* Comentario: se modelos nao carregaram, permite capturar mesmo sem detecção de rosto */}
            <Button
              type="button"
              onClick={() => void capturarFoto()}
              disabled={capturing || (modelsLoaded && !faceDetected)}
              className="flex-1"
              size="sm"
            >
              {capturing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
              {capturing ? "Capturando..." : modelsLoaded && !faceDetected ? "Enquadre o rosto..." : "Capturar"}
            </Button>
            {/* Botão para alternar entre câmera frontal e traseira */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void alternarCamera()}
              title={facingMode === "user" ? "Usar câmera traseira" : "Usar câmera frontal"}
            >
              <FlipHorizontal className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={pararCamera}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Estado inicial */}
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
              {loadingModels
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : <Camera className="h-4 w-4 mr-1" />}
              {loadingModels ? "Carregando..." : "Tirar Foto"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => galleryInputRef.current?.click()}
              disabled={disabled || processing}
            >
              <Upload className="h-4 w-4 mr-1" />
              Arquivo
            </Button>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
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
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : statusMsg ? (
              <p className="text-xs text-slate-500">{statusMsg}</p>
            ) : (
              <p className="text-xs text-slate-500">
                Detecção automática de rosto com câmera.
              </p>
            )}
          </div>

          {/* Comentario: mostra foto atual se existir, senão mostra area vazia de pré-visualização */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="overflow-hidden rounded-md border border-slate-300 bg-slate-50"
              style={{ width: 90, height: 120 }}
            >
              {processing ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
              ) : currentUrl ? (
                <img src={currentUrl} alt="Foto atual" className="h-full w-full object-cover object-top" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-slate-500 px-1">
                  Pré-visualização 3x4
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500">{currentUrl ? "Foto atual" : "3x4"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
