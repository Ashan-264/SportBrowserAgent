import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Helper function to extract valid JSON with proper bracket matching
function extractValidJSON(text: string): string | null {
  // First try: Look for JSON wrapped in code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Second try: Find JSON with proper bracket matching
  const startIndex = text.indexOf("{");
  if (startIndex === -1) return null;

  let braceCount = 0;
  let endIndex = startIndex;

  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "{") braceCount++;
    if (text[i] === "}") braceCount--;

    if (braceCount === 0) {
      endIndex = i;
      break;
    }
  }

  if (braceCount !== 0) return null;

  return text.substring(startIndex, endIndex + 1);
}

// Helper function to create a fallback intent when AI parsing fails
function createFallbackIntent(transcript: string): object {
  const lowerTranscript = transcript.toLowerCase();

  // Simple pattern matching for common intents
  if (
    lowerTranscript.includes("search") ||
    lowerTranscript.includes("find") ||
    lowerTranscript.includes("look")
  ) {
    return {
      action: "search",
      query: transcript,
      site: null,
      target: null,
    };
  }

  if (
    lowerTranscript.includes("navigate") ||
    lowerTranscript.includes("go to")
  ) {
    return {
      action: "navigate",
      query: transcript,
      site: null,
      target: null,
    };
  }

  // Default fallback
  return {
    action: "search",
    query: transcript,
    site: null,
    target: null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is required" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `User said: "${transcript}". 

IMPORTANT: Respond with ONLY a valid JSON object. Do not include any explanatory text, markdown formatting, or additional content. Just the JSON.

Convert this user request into JSON instructions with this exact structure:
{
  "action": "search",
  "query": "the main search query or action description",
  "site": "specific website mentioned (if any, e.g., 'google.com', 'wikipedia.org')",
  "target": "specific element or information to target (if applicable)"
}

Examples:
Input: "Search for weather in New York"
Output: {"action": "search", "query": "weather New York", "site": null, "target": null}

Input: "Find latest news on ESPN"
Output: {"action": "search", "query": "latest news", "site": "espn.com", "target": null}

Input: "Navigate to Wikipedia and search for AI"
Output: {"action": "navigate", "query": "AI", "site": "wikipedia.org", "target": null}

Remember: ONLY return the JSON object, nothing else.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log("Gemini response:", responseText); // Debug log

    // More robust JSON extraction
    let intent;
    try {
      // First, try to find JSON with proper bracket matching
      const jsonString = extractValidJSON(responseText);
      if (!jsonString) {
        throw new Error("No valid JSON found in response");
      }

      intent = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("JSON parsing failed:", parseError);
      console.error("Response text:", responseText);

      // Fallback: create a basic intent from the transcript
      intent = createFallbackIntent(transcript);
    }

    return NextResponse.json({ intent });
  } catch (error) {
    console.error("Error parsing intent:", error);
    return NextResponse.json(
      { error: "Failed to parse intent" },
      { status: 500 }
    );
  }
}
