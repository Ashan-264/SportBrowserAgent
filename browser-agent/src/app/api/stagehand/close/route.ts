import { NextRequest, NextResponse } from "next/server";
import { closeStagehandSession } from "../main";

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: "Session ID is required" },
        { status: 400 }
      );
    }

    const result = await closeStagehandSession(sessionId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in close session route:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
