import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Initialize the Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Function to generate Stagehand automation steps
async function generateStagehandSteps(
  message: string,
  conversationHistory: string,
  model: ReturnType<typeof genAI.getGenerativeModel>
): Promise<string> {
  const stagehandPrompt = `${conversationHistory}

You are  conversational assistant
User request: ${message}
`;

  const result = await model.generateContent(stagehandPrompt);
  const response = await result.response;
  return response.text();
}

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      message,
      conversationMode = false,
    } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get a model - use the current available model name
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build conversation history for context
    let conversationHistory = "";
    if (messages && messages.length > 0) {
      conversationHistory =
        messages
          .map(
            (msg: { role: string; content: string }) =>
              `${msg.role}: ${msg.content}`
          )
          .join("\n") + "\n";
    }

    let rawResponse = "";
    let responseType = "";

    if (conversationMode) {
      // Handle as a regular conversation
      const prompt =
        conversationHistory +
        `Human: ${message}\n\nYou are a helpful assistant that can answer questions about web browsing, automation, and general topics.\n\nAssistant:`;

      // Generate response
      const result = await model.generateContent(prompt);
      const response = await result.response;
      rawResponse = response.text();
      responseType = "conversation";
    } else {
      // Default mode: Always generate Stagehand automation steps
      const stagehandResponse = await generateStagehandSteps(
        message,
        conversationHistory,
        model
      );

      try {
        // Try to parse as JSON first
        const automationSteps = JSON.parse(stagehandResponse);
        rawResponse = `Automation Steps:\n${JSON.stringify(
          automationSteps,
          null,
          2
        )}`;
      } catch {
        // If JSON parsing fails, use the raw response
        rawResponse = `Automation Response:\n${stagehandResponse}`;
      }
      responseType = "automation";
    }

    // Format the response using the same endpoint used by agent and stagehand
    try {
      const formatResponse = await fetch(
        `${request.nextUrl.origin}/api/format`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentResponse: rawResponse,
            task: message,
            responseType: responseType,
          }),
        }
      );

      const formatData = await formatResponse.json();

      if (formatData.success && formatData.formattedResponse) {
        return NextResponse.json({
          message: formatData.formattedResponse,
          success: true,
        });
      } else {
        // Fallback to original response if formatting fails
        return NextResponse.json({
          message: rawResponse,
          success: true,
        });
      }
    } catch (formatError) {
      console.error("Error formatting response:", formatError);
      // Fallback to original response
      return NextResponse.json({
        message: rawResponse,
        success: true,
      });
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
