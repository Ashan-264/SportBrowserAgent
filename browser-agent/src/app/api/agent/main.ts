// 🤘 Welcome to Stagehand!
// This file is from the [Stagehand docs](https://docs.stagehand.dev/sections/examples/nextjs).

"use server";

import { Stagehand } from "@browserbasehq/stagehand";
import { Browserbase } from "@browserbasehq/sdk";

// ...existing code...

// Add this function at the end
export async function closeStagehandSession(sessionId: string) {
  try {
    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      browserbaseSessionID: sessionId,
      disablePino: true,
    });
    await stagehand.init();
    await stagehand.close();
    return { success: true, message: "Session closed successfully" };
  } catch (error) {
    console.error("Error closing session:", error);
    return { success: false, message: "Failed to close session" };
  }
}

/**
 * Run the main Stagehand script
 */
async function main(stagehand: Stagehand, command: string) {
  // You can use the `page` instance to write any Playwright code
  // For more info: https://playwright.dev/docs/pom

  const agent = stagehand.agent();

  const { page } = stagehand;

  // Set maxSteps to control how many actions the agent can take
  await page.goto("https://www.duckduckgo.com");
  const result = await agent.execute({
    instruction: command,
    maxSteps: 8, // Reduced steps to prevent infinite loops
  });

  // Check if the task completed successfully
  if (result.success === true) {
    console.log("Task completed successfully!");
    return {
      success: true,
      message: "Successfully found mountain biking trails near Atlanta",
      data: result,
    };
  } else {
    console.log("Task failed or was incomplete");
    return {
      success: false,
      message: "Task was incomplete or failed",
      data: result,
    };
  }
}

/**
 * Initialize and run the main() function
 */
export async function runStagehand(command: string, sessionId?: string) {
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
    // Wait longer for the agent to complete all steps
    const result = await Promise.race([
      main(stagehand, command),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Agent timeout after 2 minutes")),
          120000
        )
      ),
    ]);

    // Agent has completed - now it's safe to close
    console.log("Agent execution completed, closing session...");

    return result;
  } catch (error) {
    console.error("Error in runStagehand:", error);
    try {
      await stagehand.close();
    } catch (closeError) {
      console.error("Error closing stagehand:", closeError);
    }
    throw error;
  }
}

/**
 * Start a Browserbase session
 */
export async function startBBSSession() {
  const browserbase = new Browserbase();
  const session = await browserbase.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });
  const debugUrl = await browserbase.sessions.debug(session.id);
  return {
    sessionId: session.id,
    debugUrl: debugUrl.debuggerFullscreenUrl,
  };
}
