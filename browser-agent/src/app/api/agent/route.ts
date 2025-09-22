import { NextResponse, NextRequest } from "next/server";
import { runStagehand, startBBSSession } from "./main";

export async function POST(request: NextRequest) {
  try {
    let { sessionId, command } = await request.json();

    if (!sessionId) {
      // Start a new Browserbase session if none provided
      const session = await startBBSSession();
      sessionId = session.sessionId;
    }

    const result = await runStagehand(command, sessionId);

    // Format the result for display in chat
    let formattedResult = `🤖 **Agent Execution Complete**\n\n`;

    if (result.success) {
      formattedResult += `**✅ Status:** ${result.message}\n\n`;
      formattedResult += `**📍 Task:** Find mountain biking trails near Atlanta\n\n`;

      if (result.data) {
        formattedResult += `**🚵 Agent Data:**\n\`\`\`json\n${JSON.stringify(
          result.data,
          null,
          2
        )}\n\`\`\``;
      }
    } else {
      formattedResult += `**❌ Status:** ${result.message}\n\n`;
      formattedResult += `**🔍 Details:** Task may have been interrupted or exceeded step limit\n\n`;

      if (result.data) {
        formattedResult += `**📊 Debug Info:**\n\`\`\`json\n${JSON.stringify(
          result.data,
          null,
          2
        )}\n\`\`\``;
      }
    }

    return NextResponse.json({
      success: true,
      result: formattedResult,
      logs: result.logs || [], // Include the captured agent logs
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) });
  }
}
