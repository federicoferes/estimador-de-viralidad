"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Film, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoUploaderProps {
  onAnalyze: (file: File) => void;
  isLoading: boolean;
}

const ACCEPTED_TYPES = ["video/mp4", "video/webm", "video/mov", "video/quicktime", "video/avi"];
const MAX_SIZE_MB = 200;

export function VideoUploader({ onAnalyze, isLoading }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) return "Formato no soportado. Usá MP4, MOV, WebM o AVI.";
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return `El archivo supera los ${MAX_SIZE_MB}MB.`;
    return null;
  };

  const handleFile = useCallback((file: File) => {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError(null);
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clear = () => {
    setSelectedFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full space-y-4">
      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 p-12",
              isDragging
                ? "border-violet-500 bg-violet-500/10 scale-[1.02]"
                : "border-slate-700 bg-slate-900/50 hover:border-violet-600 hover:bg-violet-500/5"
            )}
          >
            {isDragging && (
              <div className="absolute inset-0 rounded-2xl scan-overlay pointer-events-none" />
            )}
            <motion.div
              animate={{ y: isDragging ? -4 : 0 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="p-4 rounded-full bg-violet-500/20 border border-violet-500/30">
                <Upload className="w-8 h-8 text-violet-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-200">
                  {isDragging ? "Soltá el video acá" : "Arrastrá tu video o hacé click"}
                </p>
                <p className="text-sm text-slate-500 mt-1">MP4, MOV, WebM, AVI · Máximo {MAX_SIZE_MB}MB</p>
              </div>
            </motion.div>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onInputChange}
            />
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900"
          >
            <video
              src={preview ?? undefined}
              className="w-full max-h-64 object-contain bg-black"
              controls={false}
              muted
              autoPlay
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-slate-300 truncate max-w-[200px]">{selectedFile.name}</span>
                <span className="text-xs text-slate-500">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)}MB
                </span>
              </div>
              <button
                onClick={clear}
                className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-red-400 text-center"
        >
          {error}
        </motion.p>
      )}

      {selectedFile && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onAnalyze(selectedFile)}
          disabled={isLoading}
          className={cn(
            "w-full py-4 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2",
            isLoading
              ? "bg-violet-700/50 cursor-not-allowed"
              : "bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] active:scale-[0.98]"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Analizando activación neuronal...</span>
            </>
          ) : (
            <>
              <span>Analizar Viralidad</span>
              <span className="text-lg">🧠</span>
            </>
          )}
        </motion.button>
      )}
    </div>
  );
}
