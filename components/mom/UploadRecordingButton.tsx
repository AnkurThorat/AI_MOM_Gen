"use client";

import { ChangeEvent, useRef, useState } from "react";

import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface UploadRecordingButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

interface TranscriptionResponse {
  success?: boolean;
  transcript?: string;
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const SUPPORTED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
];

const SUPPORTED_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".ogg",
  ".webm",
  ".flac",
];

export default function UploadRecordingButton({
  onTranscript,
  disabled = false,
}: UploadRecordingButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [isProcessing, setIsProcessing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const isSupportedFile = (file: File) => {
    const fileName = file.name.toLowerCase();

    const hasSupportedExtension =
      SUPPORTED_EXTENSIONS.some((extension) =>
        fileName.endsWith(extension),
      );

    const hasSupportedMimeType =
      SUPPORTED_TYPES.includes(file.type);

    return (
      hasSupportedExtension ||
      hasSupportedMimeType
    );
  };

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    setError("");
    setSuccess("");

    if (!file) {
      return;
    }

    if (!isSupportedFile(file)) {
      setError(
        "Unsupported file format. Please upload MP3, M4A, WAV, AAC, OGG, WEBM, or FLAC.",
      );

      event.target.value = "";

      return;
    }

    if (file.size === 0) {
      setError(
        "The selected audio file is empty.",
      );

      event.target.value = "";

      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "File is too large. Maximum allowed size is 50MB.",
      );

      event.target.value = "";

      return;
    }

    setSelectedFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError("");
    setSuccess("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  };

  const uploadAndTranscribe = async () => {
    if (!selectedFile) {
      setError(
        "Please select an audio recording first.",
      );

      return;
    }

    try {
      setIsProcessing(true);
      setError("");
      setSuccess("");

      const formData = new FormData();

      formData.append(
        "audio",
        selectedFile,
        selectedFile.name,
      );

      const response = await fetch(
        "/api/ai/transcribe",
        {
          method: "POST",
          body: formData,
        },
      );

      const contentType =
        response.headers.get("content-type") ||
        "";

      let data: TranscriptionResponse | null =
        null;

      if (
        contentType.includes(
          "application/json",
        )
      ) {
        data = await response.json();
      } else {
        const responseText =
          await response.text();

        console.error(
          "Non-JSON API response:",
          responseText,
        );

        throw new Error(
          `Server returned an invalid response (${response.status}).`,
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Transcription failed with status ${response.status}.`,
        );
      }

      const transcript =
        data?.transcript?.trim();

      if (!transcript) {
        throw new Error(
          "No speech could be detected in this recording.",
        );
      }

      onTranscript(transcript);

      setSuccess(
        "Recording transcribed successfully and added to Raw Input.",
      );

      setSelectedFile(null);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      console.error(
        "Recording transcription error:",
        error,
      );

      setError(
        error instanceof Error
          ? error.message
          : "Failed to transcribe the recording.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.aac,.ogg,.webm,.flac,audio/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isProcessing}
      />

      {!selectedFile && !isProcessing && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            inputRef.current?.click()
          }
          className="gap-2"
        >
          <Upload className="h-4 w-4" />

          Upload Recording
        </Button>
      )}

      {selectedFile && !isProcessing && (
        <div className="flex flex-col gap-3 rounded-lg border bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <FileAudio className="h-5 w-5 shrink-0 text-ekvity-blue" />

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">
                {selectedFile.name}
              </p>

              <p className="text-xs text-gray-500">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={removeFile}
            >
              <X className="mr-1 h-4 w-4" />

              Remove
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={uploadAndTranscribe}
              className="gap-2"
            >
              <FileAudio className="h-4 w-4" />

              Transcribe
            </Button>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-ekvity-blue" />

          <span className="text-sm text-gray-600">
            Uploading and transcribing recording...
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 text-sm text-green-600">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

          <span>{success}</span>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Supported: MP3, M4A, WAV, AAC, OGG, WEBM and FLAC
      </p>
    </div>
  );
}
