import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Initialize the Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: NextRequest) {
  try {
    const {
      agentResponse,
      task,
      responseType = "automation",
    } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    if (!agentResponse) {
      return NextResponse.json(
        { error: "Agent response is required" },
        { status: 400 }
      );
    }

    // Get the same model as used in chat
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let formatPrompt = "";

    if (responseType === "conversation") {
      // For conversation mode, keep the response natural and conversational
      formatPrompt = `You are a helpful conversational assistant. The user asked: "${
        task || "a question"
      }"

The response generated was:
${agentResponse}

Please provide this as a natural, friendly conversational response that:
1. Sounds like a helpful person talking naturally
2. Is clear and easy to understand
3. Removes any technical formatting or awkward phrasing
4. Flows well when spoken aloud
5. Maintains all the important information
6. Uses a warm, approachable tone

Just give the natural response directly without any formatting marks or technical elements.`;
    } else {
      // For automation/agent mode, format technical responses
      formatPrompt = `You are a helpful assistant that converts technical agent responses into human-friendly, conversational format.

Task that was requested: "${task || "Not specified"}"

Agent Response Data:
${agentResponse}

Please convert this technical response into a natural, human-friendly response that:
1. Uses a conversational tone that sounds natural when spoken aloud
2. Removes technical formatting like stars (*), session IDs, and technical jargon
3. Organizes information with bullet points where appropriate for clarity
4. Includes ALL the important information from the original response
5. Explains what was accomplished in plain, everyday language
6. Presents any results or findings in an easy-to-understand format
7. Sounds like a friendly assistant explaining what happened

Remove any:
- Asterisks (*) and markdown formatting
- Session IDs and technical identifiers
- Technical status messages
- Code blocks or technical syntax

Format your response as natural, conversational text that would sound good when read by a text-to-speech system.`;
    }

    // Generate the human-friendly response
    const result = await model.generateContent(formatPrompt);
    const response = await result.response;
    const formattedText = response.text();

    return NextResponse.json({
      formattedResponse: formattedText,
      success: true,
    });
  } catch (error) {
    console.error("Error formatting with Gemini API:", error);
    return NextResponse.json(
      { error: "Failed to format response", originalResponse: null },
      { status: 500 }
    );
  }
}
