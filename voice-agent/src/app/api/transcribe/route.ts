import { createClient } from "@deepgram/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

    // Get the audio data from the request
    const data = await request.arrayBuffer();
    const audio = Buffer.from(data);

    // Transcribe the audio using Deepgram
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audio,
      {
        model: "nova-2",
        mimetype: "audio/webm",
        smart_format: true,
      }
    );

    if (error) {
      console.error("Deepgram error:", error);
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 500 }
      );
    }

    const transcript = result.results.channels[0].alternatives[0].transcript;

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Error processing audio:", error);
    return NextResponse.json(
      { error: "Failed to process audio" },
      { status: 500 }
    );
  }
}
