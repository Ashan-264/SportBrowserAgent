import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@deepgram/sdk";
import { splitTextIntoChunks } from "@/lib/textUtils";

// Aura voice options - more natural and exciting voices
const AURA_VOICES = {
  // Energetic and engaging voices
  helena: "aura-2-helena-en", // Warm, confident female voice
  stella: "aura-stella-en", // Young, enthusiastic female voice
  athena: "aura-athena-en", // Professional, clear female voice
  hera: "aura-hera-en", // Mature, authoritative female voice

  // Male voices
  orion: "aura-orion-en", // Deep, engaging male voice
  arcas: "aura-arcas-en", // Friendly, approachable male voice
  perseus: "aura-perseus-en", // Strong, confident male voice
  angus: "aura-angus-en", // Warm, conversational male voice

  // Default fallback
  asteria: "aura-asteria-en", // Balanced, versatile voice
};

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      return NextResponse.json(
        { error: "Deepgram API key not configured" },
        { status: 500 }
      );
    }

    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    const { text, voice = "helena" } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Select voice based on preference or default to Luna (energetic female voice)
    const selectedVoice =
      AURA_VOICES[voice as keyof typeof AURA_VOICES] || AURA_VOICES.helena;

    // Enhanced audio quality settings for more natural sound
    const audioConfig = {
      model: selectedVoice,
      encoding: "linear16" as const,
      container: "wav" as const,
      sample_rate: 48000, // High quality sample rate
      // Note: bit_rate is not applicable for linear16 encoding (uncompressed)
    };

    // Split text into chunks to respect Deepgram's 2000 character limit
    const textChunks = splitTextIntoChunks(text, 2000);
    console.log(
      `Processing ${textChunks.length} text chunks for speech synthesis`
    );

    const audioSegments = [];

    // Process each chunk sequentially
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      console.log(
        `Synthesizing chunk ${i + 1}/${textChunks.length}: ${
          chunk.length
        } characters`
      );

      try {
        console.log(`Using voice: ${selectedVoice} for chunk ${i + 1}`);

        // Synthesize speech from text chunk with enhanced Aura settings
        const response = await deepgram.speak.request(
          { text: chunk },
          audioConfig
        );

        const stream = await response.getStream();
        if (!stream) {
          console.error(`Failed to get audio stream for chunk ${i + 1}`);
          audioSegments.push({
            index: i,
            audio: null,
            text: chunk,
            length: chunk.length,
            error: "Failed to get audio stream",
          });
          continue;
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
        console.log(`Audio buffer size for chunk ${i + 1}: ${audioBuffer.length} bytes`);
        
        if (audioBuffer.length === 0) {
          console.error(`Empty audio buffer for chunk ${i + 1}`);
          audioSegments.push({
            index: i,
            audio: null,
            text: chunk,
            length: chunk.length,
            error: "Empty audio buffer received",
          });
          continue;
        }
        
        const base64Audio = audioBuffer.toString("base64");
        console.log(`Base64 audio length for chunk ${i + 1}: ${base64Audio.length}`);

        audioSegments.push({
          index: i,
          audio: base64Audio,
          text: chunk,
          length: chunk.length,
        });

        // Add a small delay between requests to avoid rate limiting
        if (i < textChunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (chunkError) {
        console.error(`Error processing chunk ${i + 1}:`, chunkError);
        // Continue with next chunk instead of failing entirely
        audioSegments.push({
          index: i,
          audio: null,
          text: chunk,
          length: chunk.length,
          error: "Failed to synthesize this segment",
        });
      }
    }

    if (audioSegments.length === 0) {
      return NextResponse.json(
        { error: "Failed to synthesize any audio segments" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      segments: audioSegments,
      totalChunks: textChunks.length,
      mimeType: "audio/wav",
      voice: selectedVoice,
      quality: {
        sampleRate: audioConfig.sample_rate,
        encoding: audioConfig.encoding,
        note: "Linear16 encoding provides uncompressed, high-quality audio",
      },
    });
  } catch (error) {
    console.error("Error in speech synthesis route:", error);
    return NextResponse.json(
      { error: "Speech synthesis failed" },
      { status: 500 }
    );
  }
}
