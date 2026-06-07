"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Film, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoUploaderProps {
  onAnalyze: (file: File) => void;
  isLoading: boolean;
}

const ACCEPTED = ["video/mp4", "video/webm", "video/mov", "video/quicktime", "video/avi"];
const MAX_MB = 200;

export function VideoUploader({ onAnalyze, isLoading }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (f: File) => {
    if (!ACCEPTED.includes(f.type)) return "Formato no soportado. Usá MP4, MOV, WebM o AVI.";
    if (f.size > MAX_MB * 1024 * 1024) return `El archivo supera los ${MAX_MB}MB.`;
    return null;
  };

  const handleFile = useCallback((f: File) => {
    const err = validate(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const clear = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all duration-200",
              isDragging
                ? "border-[#0f0f0f] bg-[var(--yellow-bg)]"
                : "border-[var(--border)] hover:border-[#0f0f0f] hover:bg-white"
            )}
          >
            <div className={cn(
              "p-3 rounded-full border transition-colors",
              isDragging ? "border-[#0f0f0f] bg-white" : "border-[var(--border)] bg-white"
            )}>
              <Upload className="w-6 h-6 text-[var(--fg)]" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-[var(--fg)]">
                {isDragging ? "Soltá el video acá" : "Arrastrá tu video o hacé click"}
              </p>
              <p className="text-sm text-[var(--fg-muted)] mt-1">
                MP4, MOV, WebM, AVI · Máximo {MAX_MB}MB
              </p>
            </div>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative rounded-xl overflow-hidden border border-[var(--border)] bg-white"
          >
            <video src={preview ?? undefined} className="w-full max-h-56 object-contain bg-[var(--bg-alt)]" muted autoPlay loop playsInline />
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-[var(--fg-muted)]" />
                <span className="text-sm text-[var(--fg)] truncate max-w-[200px]">{file.name}</span>
                <span className="text-xs text-[var(--fg-muted)]">{(file.size / (1024 * 1024)).toFixed(1)}MB</span>
              </div>
              <button onClick={clear} className="p-1 rounded-full hover:bg-[var(--bg-alt)] transition-colors">
                <X className="w-4 h-4 text-[var(--fg-muted)]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      {file && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => onAnalyze(file)}
          disabled={isLoading}
          className={cn(
            "w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2",
            isLoading
              ? "bg-[var(--bg-alt)] text-[var(--fg-muted)] cursor-not-allowed border border-[var(--border)]"
              : "bg-[var(--fg)] text-white hover:bg-[#1f1f1f] active:scale-[0.99]"
          )}
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /><span>Analizando activación neuronal...</span></>
          ) : (
            <><span>Analizar Viralidad</span><span>→</span></>
          )}
        </motion.button>
      )}
    </div>
  );
}
