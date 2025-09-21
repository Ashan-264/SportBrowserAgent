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

    if (conversationMode) {
      // Handle as a regular conversation
      const prompt =
        conversationHistory +
        `Human: ${message}\n\nYou are a helpful assistant that can answer questions about web browsing, automation, and general topics.\n\nAssistant:`;

      // Generate response
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return NextResponse.json({
        message: text,
        success: true,
      });
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

        return NextResponse.json({
          message: `\`\`\`json\n${JSON.stringify(
            automationSteps,
            null,
            2
          )}\n\`\`\``,
          success: true,
          automationSteps,
        });
      } catch {
        // If JSON parsing fails, return the raw response
        return NextResponse.json({
          message: `\`\`\`json\n${stagehandResponse}\n\`\`\``,
          success: true,
        });
      }
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
