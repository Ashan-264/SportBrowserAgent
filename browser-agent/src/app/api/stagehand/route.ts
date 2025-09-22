import { NextResponse, NextRequest } from "next/server";
import { runStagehand, startBBSSession } from "./main";

export async function POST(request: NextRequest) {
  try {
    const { command, sessionId, persistSession = true } = await request.json(); // Default to true for persistence

    if (!command) {
      return NextResponse.json(
        { success: false, message: "Command is required" },
        { status: 400 }
      );
    }

    let finalSessionId = sessionId;
    if (!finalSessionId) {
      // Start a new Browserbase session if none provided
      const session = await startBBSSession();
      finalSessionId = session.sessionId;
    }

    // Run Stagehand with persistence enabled by default (closeSession = false)
    const result = await runStagehand(command, finalSessionId, !persistSession);

    // Format the result for display in chat
    let formattedResult = `🤖 **Stagehand Action Complete**\n\n`;
    formattedResult += `**Command:** ${result.action?.command || "unknown"}\n`;
    formattedResult += `**Action:** ${result.action?.instruction || "N/A"}\n`;
    formattedResult += `**Result:** ${result.message}\n\n`;

    if (result.data && typeof result.data === "object") {
      if (result.action?.command === "extract" && "extraction" in result.data) {
        formattedResult += `**Extracted Data:**\n${result.data.extraction}\n\n`;
      } else if (
        result.action?.command === "observe" &&
        Array.isArray(result.data)
      ) {
        formattedResult += `**Available Actions:**\n`;
        result.data.forEach((element: unknown, index: number) => {
          const description =
            typeof element === "object" &&
            element !== null &&
            "description" in element
              ? (element as { description: string }).description
              : String(element);
          formattedResult += `${index + 1}. ${description}\n`;
        });
        formattedResult += `\n`;
      } else if (result.action?.command === "goto" && "url" in result.data) {
        formattedResult += `**Navigation:** Successfully navigated to ${result.data.url}\n\n`;
      } else if (result.action?.command === "act" && result.data) {
        formattedResult += `**Action Result:** ${JSON.stringify(
          result.data,
          null,
          2
        )}\n\n`;
      }
    }

    if (persistSession) {
      formattedResult += `*Session Active - Ready for follow-up actions*\n`;
    }
    formattedResult += `*Session ID: ${finalSessionId}*`;

    return NextResponse.json({
      success: result.success,
      result: formattedResult,
      sessionId: finalSessionId,
      action: result.action,
      data: result.data,
      currentUrl: result.currentUrl,
      persistSession: persistSession,
      logs: result.logs || [], // Include the captured browser action logs
    });
  } catch (error) {
    console.error("Error in stagehand route:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
