import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function POST(request: Request) {
  try {
    // Check API key
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY is not configured",
        },
        {
          status: 500,
        },
      );
    }

    // Get audio from form data
    const formData = await request.formData();

    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        {
          error: "Audio file is required",
        },
        {
          status: 400,
        },
      );
    }

    // Validate audio
    if (audio.size === 0) {
      return NextResponse.json(
        {
          error: "Audio file is empty",
        },
        {
          status: 400,
        },
      );
    }

    // Maximum 50 MB
    const maxSize = 50 * 1024 * 1024;

    if (audio.size > maxSize) {
      return NextResponse.json(
        {
          error: "Audio file is too large. Maximum size is 50MB.",
        },
        {
          status: 413,
        },
      );
    }

    const supportedMimeTypes = [
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

    const supportedExtensions = [
      ".mp3",
      ".m4a",
      ".wav",
      ".aac",
      ".ogg",
      ".webm",
      ".flac",
    ];

    const fileName = audio.name.toLowerCase();

    const isSupported =
      supportedMimeTypes.includes(audio.type) ||
      supportedExtensions.some((extension) => fileName.endsWith(extension));

    if (!isSupported) {
      return NextResponse.json(
        {
          error:
            "Unsupported audio format. Please upload MP3, M4A, WAV, AAC, OGG, WEBM, or FLAC.",
        },
        {
          status: 400,
        },
      );
    }

    // Initialize Gemini
    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    });

    // Upload audio directly to Gemini Files API
    const uploadedFile = await ai.files.upload({
      file: audio,
      config: {
        mimeType: audio.type || "audio/webm",
      },
    });

    // Transcribe audio
    const interaction = await ai.interactions.create({
      model: "gemini-3.5-transcribe",

      input: [
        {
          type: "audio",

          uri: uploadedFile.uri,

          // IMPORTANT:
          // Interactions API uses snake_case
          mime_type: uploadedFile.mimeType || audio.type || "audio/webm",
        },
      ],

      generation_config: {
        transcription_config: {
          mode: "smart",

          // Empty = automatic language detection
          language_codes: [],

          // MoM project terminology
          custom_vocabulary: ["Ekvity", "EIA", "FCSSIP"],
        },
      },
    });

    // IMPORTANT:
    // Interactions API uses output_text
    const transcript = interaction.output_text?.trim();

    // No speech detected
    if (!transcript) {
      return NextResponse.json(
        {
          error: "No speech could be detected in the recording.",
        },
        {
          status: 422,
        },
      );
    }

    return NextResponse.json({
      success: true,

      transcript,
    });
  } catch (error) {
    console.error("Gemini transcription error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to transcribe audio",
      },
      {
        status: 500,
      },
    );
  }
}
