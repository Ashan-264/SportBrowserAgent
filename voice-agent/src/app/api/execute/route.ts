import { chromium } from "playwright-core";
import { NextRequest, NextResponse } from "next/server";
import { Browserbase } from "@browserbasehq/sdk";

interface BrowserStep {
  action: "navigate" | "click" | "fill" | "extractText" | "screenshot" | "wait";
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
  description: string;
}

interface ExecutionLog {
  step: BrowserStep;
  result?: string;
  screenshot?: string;
  error?: string;
  timestamp: string;
}

function getFallbackSelectors(originalSelector: string): string[] {
  // Return only 1 fallback selector (original + 1 = 2 total tries)

  // DuckDuckGo search input fallbacks
  if (
    originalSelector.includes('input[name="q"]') ||
    originalSelector.includes("search")
  ) {
    return ['input[type="text"]'];
  }

  // DuckDuckGo search button fallbacks
  if (
    originalSelector.includes("search_button") ||
    originalSelector.includes("submit") ||
    originalSelector.includes("btnK") ||
    originalSelector.includes("search")
  ) {
    return ['button[type="submit"]'];
  }

  // Results selectors
  if (originalSelector.includes("result")) {
    return [".result"];
  }

  // Result link selectors - for clicking through to actual pages
  if (originalSelector.includes("result") && originalSelector.includes("a")) {
    return [".result__title a"];
  }

  // No fallbacks for other selectors
  return [];
}

function isContentMeaningful(text: string): boolean {
  if (!text || text.length < 50) return false;

  // Check for common promotional/navigation text that indicates failed extraction
  const badIndicators = [
    "upgrade to our browser",
    "try the duckduckgo browser",
    "fast. free. private",
    "subscribe to our newsletter",
    "accept cookies",
    "privacy policy",
    "terms of service",
    "404 not found",
    "page not found",
    "error 403",
    "access denied",
    "loading...",
    "please wait",
    "javascript required",
  ];

  const lowerText = text.toLowerCase();
  for (const indicator of badIndicators) {
    if (lowerText.includes(indicator)) return false;
  }

  // Check for good indicators of actual content
  const goodIndicators = [
    "published",
    "author",
    "news",
    "reported",
    "according to",
    "sources",
    "breaking",
    "update",
    "article",
    "story",
  ];

  const hasGoodContent = goodIndicators.some((indicator) =>
    lowerText.includes(indicator)
  );

  // Content should be substantial and preferably have good indicators
  return text.length > 100 && (hasGoodContent || text.length > 500);
}

export async function POST(request: NextRequest) {
  let browser;
  let liveSessionUrl = null; // For Browserbase live view URL
  let browserbaseSessionId = null; // Store session ID for later use

  try {
    const { steps, showBrowser = false } = await request.json();

    console.log(`🔍 Debug: showBrowser = ${showBrowser}`); // Debug log

    if (!steps || !Array.isArray(steps)) {
      return NextResponse.json(
        { error: "Steps array is required" },
        { status: 400 }
      );
    }

    // Browserbase is required - no local fallback
    if (!process.env.BROWSERBASE_API_KEY) {
      return NextResponse.json(
        {
          error: "Browserbase API key is required",
          details: "Please set BROWSERBASE_API_KEY environment variable",
        },
        { status: 500 }
      );
    }

    if (
      !process.env.BROWSERBASE_PROJECT_ID ||
      process.env.BROWSERBASE_PROJECT_ID === "YOUR_PROJECT_ID_HERE"
    ) {
      return NextResponse.json(
        {
          error: "Browserbase Project ID is required",
          details:
            "Please set a valid BROWSERBASE_PROJECT_ID environment variable",
        },
        { status: 500 }
      );
    }

    console.log(`🌐 Creating Browserbase session using SDK...`);

    // Initialize Browserbase SDK
    const bb = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY,
    });

    // Create a new session via SDK
    let session;
    try {
      // Ensure we have a project ID
      const projectId =
        process.env.BROWSERBASE_PROJECT_ID &&
        process.env.BROWSERBASE_PROJECT_ID !== "YOUR_PROJECT_ID_HERE"
          ? process.env.BROWSERBASE_PROJECT_ID
          : undefined;

      if (!projectId) {
        throw new Error(
          "BROWSERBASE_PROJECT_ID is required for session creation"
        );
      }

      console.log(`📋 Using project ID: ${projectId}`);
      console.log(`📋 Using Key ID: ${process.env.BROWSERBASE_API_KEY}`);

      session = await bb.sessions.create({
        projectId: projectId,
        browserSettings: {
          fingerprint: {
            devices: ["desktop"],
            locales: ["en-US"],
            operatingSystems: ["windows"],
          },
        },
      });
      browserbaseSessionId = session.id;
      console.log(`📋 Created Browserbase session: ${session.id}`);
    } catch (error: unknown) {
      console.error(`❌ Browserbase SDK error:`, error);

      let errorMessage = "Failed to create Browserbase session";
      let details = "Unknown error";

      if (error instanceof Error) {
        details = error.message;
      }

      const errorWithStatus = error as { status?: number; message?: string };
      if (
        errorWithStatus.status === 401 ||
        (typeof details === "string" &&
          (details.includes("401") || details.includes("Unauthorized")))
      ) {
        errorMessage = "Browserbase authentication failed";
        details = `Invalid API key. Please:
1. Check your BROWSERBASE_API_KEY in .env.local
2. Generate a new API key at https://www.browserbase.com/dashboard
3. Ensure your Browserbase account is active and not suspended
4. Verify you haven't exceeded usage limits

Current API key starts with: ${process.env.BROWSERBASE_API_KEY?.substring(
          0,
          10
        )}...`;
      } else if (errorWithStatus.status === 403) {
        errorMessage = "Browserbase access forbidden";
        details =
          "Please check your BROWSERBASE_PROJECT_ID and API key permissions";
      } else if (errorWithStatus.status === 404) {
        errorMessage = "Browserbase project not found";
        details = "Please check your BROWSERBASE_PROJECT_ID is correct";
      }

      return NextResponse.json(
        {
          error: errorMessage,
          details: details,
          browserbaseError: details,
        },
        { status: 500 }
      );
    }

    // Connect to the session using CDP
    console.log(`🔗 Connecting to Browserbase session...`);
    browser = await chromium.connectOverCDP(session.connectUrl);
    console.log(
      `✅ Successfully connected to Browserbase session: ${session.id}`
    );

    // Note: Live session URL will be set later using SDK debug method
    console.log(`🎬 Live view URL will be generated after automation starts`);

    // Create browser context with optimized settings for Browserbase
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    const page = await context.newPage();

    // Navigate to Google first to have actual content
    console.log(`🌐 Initial navigation to Google for live view...`);
    try {
      await page.goto("https://www.google.com", {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      console.log(`✅ Successfully navigated to Google`);
    } catch (error) {
      console.warn(`⚠️ Failed to navigate to Google:`, error);
    }

    // Add stealth measures
    await page.addInitScript(() => {
      // Remove webdriver property
      delete (window as unknown as { navigator: { webdriver?: unknown } })
        .navigator.webdriver;

      // Mock chrome object
      (window as unknown as { chrome?: unknown }).chrome = {
        runtime: {},
      };

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({
              state: Notification.permission,
              name: "notifications" as PermissionName,
              onchange: null,
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false,
            } as PermissionStatus)
          : originalQuery(parameters);
    });

    const logs: ExecutionLog[] = [];

    for (const step of steps) {
      const stepLog: ExecutionLog = {
        step,
        timestamp: new Date().toISOString(),
      };

      try {
        const timeout = step.timeout || 5000;

        switch (step.action) {
          case "navigate":
            if (!step.url) {
              throw new Error("URL is required for navigate action");
            }

            // Handle special navigation cases
            if (
              step.url.includes("history.back") ||
              step.url === "javascript:history.back()"
            ) {
              try {
                await page.goBack({
                  waitUntil: "domcontentloaded",
                  timeout: Math.min(timeout, 10000),
                });
                stepLog.result = `Navigated back in browser history`;
                break;
              } catch (backError) {
                stepLog.result = `Failed to go back: ${backError}`;
                stepLog.error = "Could not navigate back";
                console.log(`⚠️ Failed to go back: ${backError}`);
                break;
              }
            }

            // Validate URL format to prevent other invalid navigation
            if (step.url.startsWith("javascript:") || step.url.length < 4) {
              stepLog.result = `Skipped invalid navigation: ${step.url}`;
              stepLog.error = "Invalid URL format - skipping step";
              console.log(`⚠️ Skipping invalid URL: ${step.url}`);
              break;
            }

            // Ensure URL has proper protocol
            let navigateUrl = step.url;
            if (
              !navigateUrl.startsWith("http://") &&
              !navigateUrl.startsWith("https://")
            ) {
              navigateUrl = "https://" + navigateUrl;
            }

            await page.goto(navigateUrl, {
              waitUntil: "domcontentloaded",
              timeout: Math.min(timeout, 15000),
            });
            // Wait a bit more for dynamic content to load
            await page.waitForTimeout(2000);
            stepLog.result = `Navigated to ${navigateUrl}`;
            break;

          case "click":
            if (!step.selector) {
              throw new Error("Selector is required for click action");
            }
            try {
              // For DuckDuckGo, try multiple selectors if the original contains common patterns
              let selectorsToTry = [step.selector];

              // Special handling for search buttons - limit to 2 tries
              if (
                step.selector.includes('input[type="submit"]') ||
                step.selector.includes("search_button")
              ) {
                selectorsToTry = [
                  step.selector,
                  'button[type="submit"]', // Most common fallback
                ];
              }

              // Special handling for result links - limit to 2 tries
              if (
                step.selector.includes("result") &&
                step.selector.includes("a")
              ) {
                selectorsToTry = [
                  step.selector,
                  ".result__title a", // Most common DuckDuckGo result link
                ];
              }

              let clicked = false;

              for (const selector of selectorsToTry) {
                try {
                  // Try to find the element with a shorter timeout for fallbacks
                  const timeout_ms =
                    selector === step.selector
                      ? Math.min(timeout, 10000)
                      : 3000;

                  await page.waitForSelector(selector, { timeout: timeout_ms });

                  // Enhanced visual feedback for real-time viewing (only when visible)
                  if (showBrowser) {
                    await page.hover(selector);

                    // Highlight the element briefly before clicking
                    await page.evaluate((sel) => {
                      const element = document.querySelector(sel);
                      if (element) {
                        element.style.border = "3px solid red";
                        element.style.backgroundColor = "yellow";
                        setTimeout(() => {
                          element.style.border = "";
                          element.style.backgroundColor = "";
                        }, 2000);
                      }
                    }, selector);

                    await page.waitForTimeout(1500 + Math.random() * 1000); // Longer delay for visibility
                  }

                  await page.click(selector, { timeout: 5000 });
                  stepLog.result = `Clicked element: ${selector}`;
                  clicked = true;
                  break;
                } catch {
                  if (selector === step.selector) {
                    console.log(
                      `Primary selector failed: ${step.selector}, trying fallbacks...`
                    );
                  }
                  continue;
                }
              }

              if (!clicked) {
                // Final fallback: try alternative selectors for common elements
                const fallbackSelectors = getFallbackSelectors(step.selector);

                for (const fallback of fallbackSelectors) {
                  try {
                    await page.waitForSelector(fallback, { timeout: 3000 });
                    await page.click(fallback, { timeout: 3000 });
                    stepLog.result = `Clicked element using fallback selector: ${fallback}`;
                    clicked = true;
                    break;
                  } catch {
                    continue;
                  }
                }

                if (!clicked) {
                  throw new Error(
                    `Could not click element with any selector. Tried: ${selectorsToTry.join(
                      ", "
                    )}, ${getFallbackSelectors(step.selector).join(", ")}`
                  );
                }
              }
            } catch (error) {
              stepLog.error = `Click failed: ${error}`;
            }
            break;

          case "fill":
            if (!step.selector || !step.value) {
              throw new Error(
                "Selector and value are required for fill action"
              );
            }
            try {
              await page.waitForSelector(step.selector, {
                timeout: Math.min(timeout, 10000),
              });

              // Enhanced typing behavior for real-time viewing (only when visible)
              if (showBrowser) {
                // Highlight the input field for visibility
                await page.evaluate((sel) => {
                  const element = document.querySelector(sel);
                  if (element) {
                    element.style.border = "3px solid blue";
                    element.style.backgroundColor = "lightblue";
                  }
                }, step.selector);

                await page.click(step.selector); // Focus the element first
                await page.waitForTimeout(1000); // Longer pause for visibility

                // Clear any existing text first
                await page.fill(step.selector, "");
                await page.waitForTimeout(500);

                // Type with slower, more visible speed
                await page.type(step.selector, step.value, {
                  delay: 150 + Math.random() * 100, // Slower typing for visibility
                });

                // Remove highlight after typing
                await page.evaluate((sel) => {
                  const element = document.querySelector(sel);
                  if (element) {
                    element.style.border = "";
                    element.style.backgroundColor = "";
                  }
                }, step.selector);
              } else {
                // Fast execution when not visible
                await page.fill(step.selector, step.value);
              }

              stepLog.result = `Filled ${step.selector} with: ${step.value}`;
            } catch (error) {
              // Fallback: try alternative selectors
              const fallbackSelectors = getFallbackSelectors(step.selector);
              let filled = false;

              for (const fallback of fallbackSelectors) {
                try {
                  await page.waitForSelector(fallback, { timeout: 3000 });
                  await page.fill(fallback, step.value, { timeout: 3000 });
                  stepLog.result = `Filled using fallback selector ${fallback} with: ${step.value}`;
                  filled = true;
                  break;
                } catch {
                  continue;
                }
              }

              if (!filled) {
                throw error;
              }
            }
            break;

          case "extractText":
            if (!step.selector) {
              throw new Error("Selector is required for extractText action");
            }

            try {
              // Split selector by comma to try multiple selectors
              const selectors = step.selector
                .split(",")
                .map((s: string) => s.trim());
              let extractedText = "";
              let foundElements = false;

              for (const selector of selectors) {
                try {
                  await page.waitForSelector(selector, {
                    timeout: Math.min(timeout, 5000),
                  });

                  // Try to get text from all matching elements, not just the first one
                  const elements = await page.$$(selector);

                  if (elements.length > 0) {
                    foundElements = true;
                    for (const element of elements) {
                      const text = await element.textContent();
                      if (text && text.trim()) {
                        extractedText += text.trim() + "\n";
                      }
                    }

                    // If we found content, break early
                    if (extractedText.trim()) {
                      break;
                    }
                  }
                } catch (selectorError) {
                  // Continue trying other selectors
                  console.log(`Selector ${selector} failed:`, selectorError);
                  continue;
                }
              }

              stepLog.result =
                extractedText.trim() || "No text found with any selector";

              // Check content quality and add metadata
              const isMeaningful = isContentMeaningful(extractedText.trim());

              // Add quality indicator to the result
              if (extractedText.trim()) {
                stepLog.result = extractedText.trim();
                // Add quality metadata that can be used by the answer generation
                if (!isMeaningful) {
                  stepLog.result +=
                    "\n[CONTENT_QUALITY: LOW - may need to try different source]";
                } else {
                  stepLog.result +=
                    "\n[CONTENT_QUALITY: HIGH - good content found]";
                }
              }

              if (!foundElements) {
                // Try only 1 fallback selector (2 total tries)
                const fallbackSelectors = [
                  ".result__snippet", // Most common content selector
                ];

                for (const fallback of fallbackSelectors) {
                  try {
                    const elements = await page.$$(fallback);
                    if (elements.length > 0) {
                      for (const element of elements.slice(0, 3)) {
                        // Limit to first 3 elements
                        const text = await element.textContent();
                        if (text && text.trim() && text.length > 20) {
                          // Only meaningful content
                          extractedText += text.trim() + "\n";
                        }
                      }
                      if (extractedText.trim()) {
                        const isMeaningful = isContentMeaningful(
                          extractedText.trim()
                        );
                        stepLog.result = extractedText.trim();
                        if (!isMeaningful) {
                          stepLog.result +=
                            "\n[CONTENT_QUALITY: LOW - fallback extraction]";
                        } else {
                          stepLog.result +=
                            "\n[CONTENT_QUALITY: HIGH - good fallback content]";
                        }
                        break;
                      }
                    }
                  } catch {
                    continue;
                  }
                }
              }
            } catch (error) {
              stepLog.result = `Text extraction failed: ${error}`;
            }
            break;

          case "screenshot":
            try {
              const screenshot = await page.screenshot({
                fullPage: false,
                type: "png",
              });
              stepLog.screenshot = screenshot.toString("base64");
              stepLog.result = "Screenshot captured";
            } catch (screenshotError) {
              stepLog.result = `Screenshot failed: ${screenshotError}`;
              stepLog.error = `Screenshot operation failed: ${
                screenshotError instanceof Error
                  ? screenshotError.message
                  : String(screenshotError)
              }`;
            }
            break;

          case "wait":
            try {
              const waitTime = step.timeout || 1000;
              await page.waitForTimeout(waitTime);
              stepLog.result = `Waited for ${waitTime}ms`;
            } catch (waitError) {
              stepLog.result = `Wait failed: ${waitError}`;
              stepLog.error = `Wait operation failed: ${
                waitError instanceof Error
                  ? waitError.message
                  : String(waitError)
              }`;
            }
            break;

          default:
            throw new Error(`Unknown action: ${step.action}`);
        }
      } catch (error) {
        stepLog.error = error instanceof Error ? error.message : String(error);
        console.error(`Error executing step ${step.action}:`, error);

        // Check if the error is due to browser/page being closed
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes(
            "Target page, context or browser has been closed"
          ) ||
          errorMessage.includes("browser has been closed") ||
          errorMessage.includes("context has been closed")
        ) {
          console.warn(
            "⚠️ Browser context closed during execution. Stopping further steps to prevent cascading failures."
          );
          stepLog.error = "Browser context closed - stopping execution";
          logs.push(stepLog);
          break; // Stop executing further steps
        }
      }

      logs.push(stepLog);
    }

    // Get Browserbase session URL for live viewing using SDK
    if (browser && browserbaseSessionId) {
      try {
        console.log(`🔍 Getting live view URL using Browserbase SDK...`);
        console.log(`🔍 Session ID: ${browserbaseSessionId}`);

        // Use the official SDK method to get debug session info
        const debugSession = await bb.sessions.debug(browserbaseSessionId);
        console.log(`🔍 Debug session response:`, debugSession);

        // Find the active page with content (prefer the most recent non-blank page)
        console.log(
          `🔍 Available pages:`,
          debugSession.pages?.map((p) => ({
            id: p.id,
            url: p.url,
            title: p.title,
          }))
        );

        const activePage =
          debugSession.pages?.find(
            (page) =>
              page.url &&
              page.url !== "about:blank" &&
              !page.url.startsWith("chrome-extension://") &&
              (page.url.includes("google.com") ||
                page.url.includes("duckduckgo.com") ||
                page.title !== "about:blank")
          ) ||
          debugSession.pages?.find(
            (page) =>
              page.url &&
              page.url !== "about:blank" &&
              !page.url.startsWith("chrome-extension://")
          );

        console.log(
          `🎯 Selected active page:`,
          activePage
            ? {
                id: activePage.id,
                url: activePage.url,
                title: activePage.title,
              }
            : "none"
        );

        // Use the debuggerFullscreenUrl for iframe embedding (as per Browserbase docs)
        if (activePage && activePage.debuggerFullscreenUrl) {
          liveSessionUrl = activePage.debuggerFullscreenUrl;
          console.log(`📋 Using active page debugger URL: ${liveSessionUrl}`);
        } else {
          // Fallback to session-level debugger URL
          liveSessionUrl =
            debugSession.debuggerFullscreenUrl ||
            `https://www.browserbase.com/sessions/${browserbaseSessionId}`;
          console.log(`📋 Using session-level debugger URL: ${liveSessionUrl}`);
        }

        console.log(`📋 Generated live view URL via SDK: ${liveSessionUrl}`);
      } catch (debugError) {
        console.error("Failed to get live view URL via SDK:", debugError);

        // More detailed error logging
        if (debugError instanceof Error) {
          console.error("Debug error details:", {
            message: debugError.message,
            stack: debugError.stack,
            name: debugError.name,
          });
        }

        // Fallback to direct session link if SDK method fails
        liveSessionUrl = `https://www.browserbase.com/sessions/${browserbaseSessionId}`;
        console.log(`📋 Using fallback session URL: ${liveSessionUrl}`);
      }
    }

    // Return the execution results
    return NextResponse.json({
      logs,
      liveSessionUrl, // Add this for real-time viewing
      browserType: "browserbase",
      summary: {
        totalSteps: steps.length,
        successfulSteps: logs.filter((log) => !log.error).length,
        errors: logs.filter((log) => log.error).length,
      },
    });
  } catch (error) {
    console.error("Browser execution error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        logs: [],
      },
      { status: 500 }
    );
  } finally {
    // Clean up browser resources
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("Error closing browser:", closeError);
      }
    }
  }
}
