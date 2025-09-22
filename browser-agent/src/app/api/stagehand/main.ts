// 🤘 Welcome to Stagehand!
// This file is from the [Stagehand docs](https://docs.stagehand.dev/sections/examples/nextjs).

"use server";

import { Stagehand } from "@browserbasehq/stagehand";
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
  action: { command: string; url?: string; instruction: string },
  stagehandLogs: string[]
) {
  const { page } = stagehand;
  const timestamp = new Date().toLocaleTimeString();

  try {
    stagehandLogs.push(
      `[${timestamp}] ⚡ Starting ${action.command}: ${action.instruction}`
    );

    switch (action.command) {
      case "goto":
        if (!action.url) throw new Error("URL required for goto command");
        stagehandLogs.push(`[${timestamp}] 🌐 Navigating to: ${action.url}`);
        await page.goto(action.url);
        stagehandLogs.push(
          `[${timestamp}] ✅ Navigation completed to: ${action.url}`
        );
        return {
          success: true,
          action: "goto",
          result: `Navigated to ${action.url}`,
          data: { url: action.url },
        };

      case "observe":
        stagehandLogs.push(
          `[${timestamp}] 👁️ Observing page: ${action.instruction}`
        );
        const observeResult = await page.observe({
          instruction: action.instruction,
        });
        stagehandLogs.push(
          `[${timestamp}] ✅ Observation completed: Found ${
            Array.isArray(observeResult) ? observeResult.length : "unknown"
          } elements`
        );
        return {
          success: true,
          action: "observe",
          result: `Observed: ${action.instruction}`,
          data: observeResult,
        };

      case "act":
        stagehandLogs.push(
          `[${timestamp}] 🖱️ Performing action: ${action.instruction}`
        );
        const actResult = await page.act(action.instruction);
        stagehandLogs.push(
          `[${timestamp}] ✅ Action completed: ${action.instruction}`
        );
        return {
          success: true,
          action: "act",
          result: `Action performed: ${action.instruction}`,
          data: actResult,
        };

      case "extract":
        stagehandLogs.push(
          `[${timestamp}] 📊 Extracting data: ${action.instruction}`
        );
        const extractResult = await page.extract({
          instruction: action.instruction,
        });
        stagehandLogs.push(`[${timestamp}] ✅ Data extraction completed`);
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
    stagehandLogs.push(
      `[${timestamp}] ❌ Failed ${action.command}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {
      success: false,
      action: action.command,
      result: `Failed to execute ${action.command}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      data: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Main function that processes user commands through Gemini
 */
async function main(
  stagehand: Stagehand,
  userCommand: string,
  stagehandLogs: string[]
) {
  const { page } = stagehand;

  try {
    // Get current URL if page is loaded
    let currentUrl;
    try {
      currentUrl = page.url();
    } catch {
      currentUrl = undefined;
    }

    // Log the decision process
    const timestamp = new Date().toLocaleTimeString();
    stagehandLogs.push(`[${timestamp}] 🧠 Analyzing command: "${userCommand}"`);
    if (currentUrl) {
      stagehandLogs.push(`[${timestamp}] 📍 Current URL: ${currentUrl}`);
    }

    // Get action decision from Gemini
    const actionDecision = await getActionFromGemini(userCommand, currentUrl);
    console.log("Gemini decided action:", actionDecision);
    stagehandLogs.push(
      `[${timestamp}] 🎯 Action decided: ${actionDecision.command} - ${actionDecision.instruction}`
    );

    // Execute the decided action
    const result = await executeStagehandAction(
      stagehand,
      actionDecision,
      stagehandLogs
    );

    return {
      success: result.success,
      message: result.result,
      action: actionDecision,
      data: result.data,
      currentUrl: currentUrl,
    };
  } catch (error) {
    console.error("Error in main:", error);
    const timestamp = new Date().toLocaleTimeString();
    stagehandLogs.push(
      `[${timestamp}] ❌ Error in main: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {
      success: false,
      message: `Error processing command: ${
        error instanceof Error ? error.message : String(error)
      }`,
      data: { error: error instanceof Error ? error.message : String(error) },
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
  // Create an array to capture detailed Stagehand logs
  const stagehandLogs: string[] = [];

  // Enhanced custom logger for detailed browser action tracking
  const customStagehandLogger = (...args: unknown[]) => {
    const logMessage = args
      .map((arg) =>
        typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
      )
      .join(" ");

    // Enhanced filtering for comprehensive browser action logging
    if (
      logMessage.includes("click") ||
      logMessage.includes("navigate") ||
      logMessage.includes("type") ||
      logMessage.includes("extract") ||
      logMessage.includes("goto") ||
      logMessage.includes("action") ||
      logMessage.includes("step") ||
      logMessage.includes("scroll") ||
      logMessage.includes("wait") ||
      logMessage.includes("find") ||
      logMessage.includes("locate") ||
      logMessage.includes("element") ||
      logMessage.includes("page") ||
      logMessage.includes("button") ||
      logMessage.includes("input") ||
      logMessage.includes("form") ||
      logMessage.includes("link") ||
      logMessage.includes("observe") ||
      logMessage.includes("act") ||
      logMessage.toLowerCase().includes("performing") ||
      logMessage.toLowerCase().includes("executing") ||
      logMessage.toLowerCase().includes("visiting") ||
      logMessage.toLowerCase().includes("searching") ||
      logMessage.toLowerCase().includes("clicking") ||
      logMessage.toLowerCase().includes("typing") ||
      logMessage.toLowerCase().includes("scrolling") ||
      logMessage.toLowerCase().includes("loading") ||
      logMessage.toLowerCase().includes("found") ||
      logMessage.toLowerCase().includes("attempting") ||
      logMessage.toLowerCase().includes("interacting") ||
      logMessage.toLowerCase().includes("analyzing") ||
      logMessage.toLowerCase().includes("processing")
    ) {
      // Add timestamp and action type prefix
      const timestamp = new Date().toLocaleTimeString();
      const enhancedLog = `[${timestamp}] 🤘 Stagehand: ${logMessage}`;
      stagehandLogs.push(enhancedLog);
    }

    // Still log to console for debugging
    console.log(...args);
  };

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    modelClientOptions: {
      apiKey: process.env.Gemini_API_KEY,
    },
    modelName: "google/gemini-2.5-flash",
    verbose: 2, // Increased verbosity for more detailed logs
    logger: customStagehandLogger,
    browserbaseSessionID: sessionId,
    disablePino: true,
  });

  try {
    await stagehand.init();
    stagehandLogs.push(
      `[${new Date().toLocaleTimeString()}] 🚀 Stagehand initialized successfully`
    );

    const result = await main(stagehand, command, stagehandLogs);

    console.log("Stagehand action completed successfully!");
    stagehandLogs.push(
      `[${new Date().toLocaleTimeString()}] ✅ Stagehand action completed successfully`
    );

    // Only close session if explicitly requested
    if (closeSession) {
      console.log("Closing session as requested...");
      stagehandLogs.push(
        `[${new Date().toLocaleTimeString()}] 🔒 Closing session as requested`
      );
      await stagehand.close();
    } else {
      console.log("Keeping browser session alive for continued use...");
      stagehandLogs.push(
        `[${new Date().toLocaleTimeString()}] 🔄 Keeping session alive for continued use`
      );
    }

    return {
      ...result,
      logs: stagehandLogs, // Include captured logs
    };
  } catch (error) {
    console.error("Error in runStagehand:", error);

    // Add error to logs
    const timestamp = new Date().toLocaleTimeString();
    stagehandLogs.push(
      `[${timestamp}] ❌ Stagehand Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    // Only close on error if explicitly requested, otherwise keep session for debugging
    if (closeSession) {
      try {
        await stagehand.close();
      } catch (closeError) {
        console.error("Error closing stagehand:", closeError);
        stagehandLogs.push(
          `[${new Date().toLocaleTimeString()}] ❌ Session Close Error: ${closeError}`
        );
      }
    } else {
      console.log("Keeping session alive despite error for debugging...");
      stagehandLogs.push(
        `[${new Date().toLocaleTimeString()}] 🔧 Session kept alive for debugging`
      );
    }

    return {
      success: false,
      message: `Failed to execute command: ${
        error instanceof Error ? error.message : String(error)
      }`,
      data: { error: error instanceof Error ? error.message : String(error) },
      logs: stagehandLogs, // Include logs even on error
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
