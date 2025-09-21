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

    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Synthesize speech from text
    const response = await deepgram.speak.request(
      { text },
      {
        model: "aura-asteria-en",
        encoding: "linear16",
        container: "wav",
        sample_rate: 48000,
      }
    );

    const stream = await response.getStream();
    if (!stream) {
      return NextResponse.json(
        { error: "Failed to get audio stream" },
        { status: 500 }
      );
    }

    // Convert stream to buffer
    const reader = stream.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const audioBuffer = Buffer.concat(chunks);

    // Return audio as base64 for easy frontend handling
    const base64Audio = audioBuffer.toString("base64");

    return NextResponse.json({
      success: true,
      audio: base64Audio,
      mimeType: "audio/wav",
    });
  } catch (error) {
    console.error("Error in speech synthesis route:", error);
    return NextResponse.json(
      { error: "Speech synthesis failed" },
      { status: 500 }
    );
  }
}
