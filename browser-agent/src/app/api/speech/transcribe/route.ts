import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@deepgram/sdk";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      return NextResponse.json(
        { error: "Deepgram API key not configured" },
        { status: 500 }
      );
    }

    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    // Get the audio file from the request
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Transcribe the audio
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        punctuate: true,
        diarize: false,
      }
    );

    if (error) {
      console.error("Deepgram transcription error:", error);
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 500 }
      );
    }

    const transcript = result.results.channels[0].alternatives[0].transcript;

    return NextResponse.json({
      success: true,
      transcript: transcript,
      confidence: result.results.channels[0].alternatives[0].confidence,
    });
  } catch (error) {
    console.error("Error in transcription route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
