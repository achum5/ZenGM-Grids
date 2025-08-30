import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CloudUpload } from "lucide-react";
import type { FileUploadData } from "@shared/schema";
import { processLeagueDataClientSide, type BBGMLeagueData } from "@/lib/clientLeagueProcessor";

interface UploadLeagueProps {
  onLoaded: (data: FileUploadData, file: File) => void;
}

export default function UploadLeague({ onLoaded }: UploadLeagueProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const isJson = file.name.toLowerCase().endsWith(".json");
      if (!isJson) {
        throw new Error("This uploader only accepts plain .json files.");
      }
      const text = await file.text();         // Browser only, no server
      const rawData = JSON.parse(text) as BBGMLeagueData;          // Easy way
      const data = await processLeagueDataClientSide(rawData);
      onLoaded(data, file);                   // Hand off to app
    } catch (e: any) {
      setError(e?.message || "Failed to read or parse JSON.");
    } finally {
      setBusy(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (inputRef.current) inputRef.current.value = ""; // allow re-select same file
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="rounded-2xl border border-dashed p-6 text-center border-gray-300 dark:border-gray-600 hover:border-basketball hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
      data-testid="upload-league-json"
    >
      <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
      <p className="mb-3 font-medium text-gray-700 dark:text-gray-300">Upload League (.json only)</p>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={onInputChange}
        disabled={busy}
        className="hidden"
        id="leagueJsonInput"
        data-testid="input-league-json"
      />
      <Button
        asChild
        className="bg-basketball text-white hover:bg-orange-600 hover:opacity-90 mb-3"
        disabled={busy}
        data-testid="button-browse-json"
      >
        <label htmlFor="leagueJsonInput" className="cursor-pointer">
          {busy ? "Reading…" : "Browse .json"}
        </label>
      </Button>

      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Or drag & drop a <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">.json</code> file here
      </p>

      {error && (
        <p className="mt-3 text-red-500 dark:text-red-400 text-sm" data-testid="text-upload-error">
          {error}
        </p>
      )}
    </div>
  );
}