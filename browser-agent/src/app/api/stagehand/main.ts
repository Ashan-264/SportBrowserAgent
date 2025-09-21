// 🤘 Welcome to Stagehand!
// This file is from the [Stagehand docs](https://docs.stagehand.dev/sections/examples/nextjs).

"use server";

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import { Browserbase } from "@browserbasehq/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.Gemini_API_KEY!);

/**
 * Get action decision from Gemini
 */
async function getActionFromGemini(
  userCommand: string,
  currentUrl?: string
): Promise<{
  command: "extract" | "act" | "observe" | "goto";
  url?: string;
  instruction: string;
}> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
You are a web automation assistant. Based on the user's request, decide what action to take.

User request: "${userCommand}"
Current URL: ${currentUrl || "No page loaded"}

You must respond with ONLY a JSON object in this exact format:
{
  "command": "extract|act|observe|goto",
  "url": "https://example.com (only if command is 'goto')",
  "instruction": "specific instruction for the action"
}

Commands:
- "goto": Navigate to a URL (include url field)
- "observe": Analyze what actions can be done on the current page
- "act": Perform an action like click, type, scroll (be specific)
- "extract": Extract specific data from the page

Examples:
For "find mountain biking trails": {"command": "goto", "url": "https://duckduckgo.com", "instruction": "Navigate to search engine"}
For "what can I do here": {"command": "observe", "instruction": "List all interactive elements on this page"}
For "click the search button": {"command": "act", "instruction": "click the search button"}
For "get all the trail names": {"command": "extract", "instruction": "extract all trail names from the page"}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    // Remove any markdown formatting
    const cleanResponse = response.replace(/```json\n?|\n?```/g, "").trim();

    return JSON.parse(cleanResponse);
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    // Fallback to observe
    return {
      command: "observe",
      instruction: "Analyze the current page",
    };
  }
}

/**
 * Execute individual Stagehand actions
 */
async function executeStagehandAction(
  stagehand: Stagehand,
  action: { command: string; url?: string; instruction: string }
) {
  const { page } = stagehand;

  try {
    switch (action.command) {
      case "goto":
        if (!action.url) throw new Error("URL required for goto command");
        await page.goto(action.url);
        return {
          success: true,
          action: "goto",
          result: `Navigated to ${action.url}`,
          data: { url: action.url },
        };

      case "observe":
        const observeResult = await page.observe({
          instruction: action.instruction,
        });
        return {
          success: true,
          action: "observe",
          result: `Observed: ${action.instruction}`,
          data: observeResult,
        };

      case "act":
        const actResult = await page.act({
          instruction: action.instruction,
        });
        return {
          success: true,
          action: "act",
          result: `Action performed: ${action.instruction}`,
          data: actResult,
        };

      case "extract":
        const extractResult = await page.extract({
          instruction: action.instruction,
        });
        return {
          success: true,
          action: "extract",
          result: `Extracted: ${action.instruction}`,
          data: extractResult,
        };

      default:
        throw new Error(`Unknown command: ${action.command}`);
    }
  } catch (error) {
    console.error(`Error executing ${action.command}:`, error);
    return {
      success: false,
      action: action.command,
      result: `Failed to execute ${action.command}: ${error.message}`,
      data: { error: error.message },
    };
  }
}

/**
 * Main function that processes user commands through Gemini
 */
async function main(stagehand: Stagehand, userCommand: string) {
  const { page } = stagehand;

  try {
    // Get current URL if page is loaded
    let currentUrl;
    try {
      currentUrl = page.url();
    } catch {
      currentUrl = undefined;
    }

    // Get action decision from Gemini
    const actionDecision = await getActionFromGemini(userCommand, currentUrl);
    console.log("Gemini decided action:", actionDecision);

    // Execute the decided action
    const result = await executeStagehandAction(stagehand, actionDecision);

    return {
      success: result.success,
      message: result.result,
      action: actionDecision,
      data: result.data,
      currentUrl: currentUrl,
    };
  } catch (error) {
    console.error("Error in main:", error);
    return {
      success: false,
      message: `Error processing command: ${error.message}`,
      data: { error: error.message },
    };
  }
}

export async function closeStagehandSession(sessionId: string) {
  try {
    // Import Browserbase SDK
    const { Browserbase } = await import("@browserbasehq/sdk");

    // Initialize Browserbase client
    const browserbase = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY!,
    });

    // Directly close the session via Browserbase API
    await browserbase.sessions.update(sessionId, {
      status: "REQUEST_RELEASE",
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    });

    return { success: true, message: "Session closed successfully" };
  } catch (error) {
    console.error("Error closing session:", error);
    return { success: false, message: "Failed to close session" };
  }
}

/**
 * Initialize and run the main() function
 */
export async function runStagehand(
  command: string,
  sessionId?: string,
  closeSession = false // Default to false to keep sessions persistent
) {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    modelClientOptions: {
      apiKey: process.env.Gemini_API_KEY,
    },
    modelName: "google/gemini-2.5-flash",
    verbose: 1,
    logger: console.log,
    browserbaseSessionID: sessionId,
    disablePino: true,
  });

  try {
    await stagehand.init();
    const result = await main(stagehand, command);

    console.log("Stagehand action completed successfully!");

    // Only close session if explicitly requested
    if (closeSession) {
      console.log("Closing session as requested...");
      await stagehand.close();
    } else {
      console.log("Keeping browser session alive for continued use...");
    }

    return result;
  } catch (error) {
    console.error("Error in runStagehand:", error);

    // Only close on error if explicitly requested, otherwise keep session for debugging
    if (closeSession) {
      try {
        await stagehand.close();
      } catch (closeError) {
        console.error("Error closing stagehand:", closeError);
      }
    } else {
      console.log("Keeping session alive despite error for debugging...");
    }

    return {
      success: false,
      message: `Failed to execute command: ${
        error instanceof Error ? error.message : String(error)
      }`,
      data: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Start a persistent Browserbase session with extended timeout
 */
export async function startBBSSession() {
  const browserbase = new Browserbase();

  try {
    // Create session with extended timeout for persistence
    const session = await browserbase.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      // Extended timeout to keep sessions alive longer (in seconds)
      timeout: 7200, // 2 hours timeout for extended persistence
    });

    const debugUrl = await browserbase.sessions.debug(session.id);

    console.log(`Created persistent browser session: ${session.id}`);
    console.log(
      `Session configured for 2-hour persistence with extended timeout`
    );

    return {
      sessionId: session.id,
      debugUrl: debugUrl.debuggerFullscreenUrl,
    };
  } catch (error) {
    console.error("Error creating persistent session:", error);
    // Fallback to standard session if extended timeout fails
    const session = await browserbase.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    });

    const debugUrl = await browserbase.sessions.debug(session.id);

    console.log(`Created fallback session: ${session.id}`);

    return {
      sessionId: session.id,
      debugUrl: debugUrl.debuggerFullscreenUrl,
    };
  }
}
