"use client";

import { useEffect, useRef, useState } from "react";

import { Mic, Square, Loader2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SpeechToTextButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

interface TranscriptionResponse {
  success?: boolean;
  transcript?: string;
  error?: string;
}

export default function SpeechToTextButton({
  onTranscript,
  disabled = false,
}: SpeechToTextButtonProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const audioChunksRef = useRef<Blob[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRecording, setIsRecording] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);

  const [recordingTime, setRecordingTime] = useState(0);

  const [error, setError] = useState("");

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const getSupportedMimeType = () => {
    const supportedTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];

    return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
  };

  const startRecording = async () => {
    try {
      setError("");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support microphone recording.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      audioChunksRef.current = [];

      const mimeType = getSupportedMimeType();

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, {
            mimeType,
          })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        setError("Recording failed. Please try again.");

        setIsRecording(false);
        setIsProcessing(false);
      };

      mediaRecorder.onstop = () => {
        void handleTranscription();
      };

      // Request data every second
      mediaRecorder.start(1000);

      setRecordingTime(0);

      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((previous) => previous + 1);
      }, 1000);
    } catch (error) {
      console.error("Microphone error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Unable to access microphone. Please allow microphone permission.",
      );

      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    ) {
      return;
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);

      timerRef.current = null;
    }

    // Show processing immediately
    setIsRecording(false);
    setIsProcessing(true);

    // Stop recorder
    mediaRecorderRef.current.stop();

    // Stop microphone
    streamRef.current?.getTracks().forEach((track) => track.stop());

    streamRef.current = null;
  };

  const handleTranscription = async () => {
    try {
      const recorderMimeType =
        mediaRecorderRef.current?.mimeType || "audio/webm";

      const audioBlob = new Blob(audioChunksRef.current, {
        type: recorderMimeType,
      });

      console.log("Audio recording size:", audioBlob.size);

      console.log("Audio MIME type:", audioBlob.type);

      if (audioBlob.size === 0) {
        throw new Error("No audio was recorded. Please try again.");
      }

      const formData = new FormData();

      formData.append("audio", audioBlob, "meeting-recording.webm");

      console.log("Sending audio for transcription...");

      const response = await fetch("/api/ai/transcribe", {
        method: "POST",
        body: formData,
      });

      console.log("Transcription response status:", response.status);

      const contentType = response.headers.get("content-type") || "";

      let data: TranscriptionResponse | null = null;

      // Only parse JSON if response is actually JSON
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        // Get text for debugging
        const responseText = await response.text();

        console.error("Non-JSON API response:", responseText);

        if (!response.ok) {
          throw new Error(
            `Server returned an invalid response (${response.status}). Please check the transcription API route.`,
          );
        }

        throw new Error("Server returned an unexpected response.");
      }

      // Handle API errors
      if (!response.ok) {
        throw new Error(
          data?.error || `Transcription failed with status ${response.status}.`,
        );
      }

      const transcript = data?.transcript?.trim();

      if (!transcript) {
        throw new Error(
          "No transcription was returned. Please speak clearly and try again.",
        );
      }

      console.log("Transcript received:", transcript);

      // Send transcript to parent component
      onTranscript(transcript);

      // Clear error after success
      setError("");
    } catch (error) {
      console.error("Transcription error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to convert speech to text.",
      );
    } finally {
      setIsProcessing(false);

      audioChunksRef.current = [];

      mediaRecorderRef.current = null;
    }
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");

    const seconds = (totalSeconds % 60).toString().padStart(2, "0");

    return `${minutes}:${seconds}`;
  };

  if (isProcessing) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-ekvity-blue" />

        <span className="text-sm text-gray-600">
          Converting speech to text...
        </span>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-red-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />

          <span className="text-sm font-medium">
            Recording {formatTime(recordingTime)}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={stopRecording}
          className="border-red-200 text-red-600 hover:bg-red-50"
        >
          <Square className="mr-2 h-4 w-4" />
          Stop
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={startRecording}
        className="gap-2"
      >
        <Mic className="h-4 w-4" />
        Speak
      </Button>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4 shrink-0" />

          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
