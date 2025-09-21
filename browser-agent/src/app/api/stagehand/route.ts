import { NextResponse, NextRequest } from "next/server";
import { runStagehand, startBBSSession } from "./main";

export async function POST(request: NextRequest) {
  try {
    const { command, sessionId } = await request.json();
    
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

    const result = await runStagehand(command, finalSessionId);
    
    // Format the result for display in chat
    let formattedResult = `🤖 **Stagehand Action Complete**\n\n`;
    formattedResult += `**Command:** ${result.action?.command || 'unknown'}\n`;
    formattedResult += `**Action:** ${result.action?.instruction || 'N/A'}\n`;
    formattedResult += `**Result:** ${result.message}\n\n`;
    
    if (result.data && typeof result.data === 'object') {
      if (result.action?.command === 'extract' && result.data.extraction) {
        formattedResult += `**Extracted Data:**\n${result.data.extraction}\n\n`;
      } else if (result.action?.command === 'observe' && result.data.elements) {
        formattedResult += `**Available Actions:**\n`;
        result.data.elements.forEach((element: any, index: number) => {
          formattedResult += `${index + 1}. ${element.description}\n`;
        });
        formattedResult += `\n`;
      }
    }
    
    formattedResult += `*Session ID: ${finalSessionId}*`;

    return NextResponse.json({
      success: result.success,
      result: formattedResult,
      sessionId: finalSessionId,
      data: result,
    });
  } catch (error) {
    console.error("Error in stagehand route:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
