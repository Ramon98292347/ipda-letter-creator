import { useRef, useState } from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { ImageEditorModal } from "@/components/shared/ImageEditorModal";
import { captureNativeImage, pickNativeImage } from "@/lib/native/camera";

interface ImageCaptureInputProps {
  onChange: (file: File | null) => void;
  accept?: string;
  /** "user" = câmera frontal (selfie/3x4), "environment" = câmera traseira (doc/carimbo) */
  capture?: "user" | "environment";
  disabled?: boolean;
  /** Exibe o toggle de fundo branco no editor (útil para carimbos/assinaturas) */
  allowWhiteBg?: boolean;
  /** Proporção padrão do recorte: 3/4 (padrão), 1 (quadrado), 4/3, 0 (livre) */
  defaultRatio?: number;
  /** Título do modal de edição */
  editorTitle?: string;
}

/**
 * Campo de imagem com câmera + galeria + editor de recorte.
 * Ao selecionar uma imagem, abre um modal para o usuário ajustar o recorte,
 * zoom, proporção e (opcionalmente) fundo branco antes de confirmar.
 */
export function ImageCaptureInput({
  onChange,
  accept = "image/*",
  capture = "user",
  disabled = false,
  allowWhiteBg = false,
  defaultRatio = 3 / 4,
  editorTitle = "Editar foto",
}: ImageCaptureInputProps) {
  const isNativeApp = Capacitor.isNativePlatform();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingSrc, setPendingSrc] = useState<string>("");
  const [capturingNative, setCapturingNative] = useState(false);

  function openEditor(file: File) {
    const url = URL.createObjectURL(file);
    setPendingSrc(url);
    setEditorOpen(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) openEditor(file);
  }

  function handleConfirm(file: File) {
    setEditorOpen(false);
    URL.revokeObjectURL(pendingSrc);
    setPendingSrc("");
    onChange(file);
  }

  function handleCancel() {
    setEditorOpen(false);
    URL.revokeObjectURL(pendingSrc);
    setPendingSrc("");
  }

  async function handleNativeCamera() {
    setCapturingNative(true);
    try {
      const file = await captureNativeImage();
      if (file) openEditor(file);
    } finally {
      setCapturingNative(false);
    }
  }

  async function handleNativeGallery() {
    setCapturingNative(true);
    try {
      const file = await pickNativeImage();
      if (file) openEditor(file);
    } finally {
      setCapturingNative(false);
    }
  }

  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled || capturingNative}
          onClick={() => {
            if (isNativeApp) {
              void handleNativeCamera();
              return;
            }
            cameraRef.current?.click();
          }}
        >
          {capturingNative ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          Tirar Foto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled || capturingNative}
          onClick={() => {
            if (isNativeApp) {
              void handleNativeGallery();
              return;
            }
            fileRef.current?.click();
          }}
        >
          <Upload className="mr-2 h-4 w-4" />
          Arquivo
        </Button>
      </div>

      {editorOpen && pendingSrc && (
        <ImageEditorModal
          open={editorOpen}
          imageSrc={pendingSrc}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          allowWhiteBg={allowWhiteBg}
          defaultRatio={defaultRatio}
          title={editorTitle}
        />
      )}
    </>
  );
}
