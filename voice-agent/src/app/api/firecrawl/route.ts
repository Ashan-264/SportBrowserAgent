import FirecrawlApp from "@mendable/firecrawl-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { intent } = await request.json();

    if (!intent) {
      return NextResponse.json(
        { error: "Intent is required" },
        { status: 400 }
      );
    }

    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });

    // Construct the URL based on intent
    let targetUrl: string;

    // For specific types of questions, target authoritative sources directly
    if (
      intent.query &&
      intent.query.toLowerCase().includes("richest") &&
      intent.query.toLowerCase().includes("world")
    ) {
      // For richest person queries, target Forbes directly
      targetUrl = "https://www.forbes.com/real-time-billionaires/";
    } else if (intent.query && intent.query.toLowerCase().includes("weather")) {
      // For weather queries, use a weather service
      targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
        intent.query
      )}`;
    } else if (intent.site) {
      // If specific site is mentioned, search on that site
      if (intent.action === "search") {
        if (intent.site.includes("google")) {
          targetUrl = `https://www.google.com/search?q=${encodeURIComponent(
            intent.query
          )}`;
        } else if (intent.site.includes("wikipedia")) {
          targetUrl = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(
            intent.query
          )}`;
        } else if (intent.site.includes("espn")) {
          targetUrl = `https://www.espn.com/search/_/q/${encodeURIComponent(
            intent.query
          )}`;
        } else {
          targetUrl = `https://${intent.site}/search?q=${encodeURIComponent(
            intent.query
          )}`;
        }
      } else {
        targetUrl = `https://${intent.site}`;
      }
    } else if (intent.query) {
      // Default to DuckDuckGo to avoid CAPTCHA (only if there's a query)
      targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
        intent.query
      )}`;
    } else {
      // If no query and no site, default to google homepage
      targetUrl = "https://www.google.com";
    }

    // Scrape the page using Firecrawl
    const scrapeResult = await app.scrapeUrl(targetUrl, {
      formats: ["markdown", "html"],
      includeTags: [
        "title",
        "meta",
        "h1",
        "h2",
        "h3",
        "h4",
        "p",
        "a",
        "span",
        "div",
      ],
      excludeTags: ["script", "style", "nav", "footer", "header", "aside"],
      onlyMainContent: true,
      waitFor: 2000, // Wait for dynamic content to load
    });

    if (!scrapeResult.success) {
      throw new Error(`Firecrawl scraping failed: ${scrapeResult.error}`);
    }

    // Return the scraped content with proper typing
    const responseData = scrapeResult as unknown as {
      data?: {
        markdown?: string;
        html?: string;
        metadata?: { title?: string; [key: string]: unknown };
      };
    };

    return NextResponse.json({
      url: targetUrl,
      title: responseData.data?.metadata?.title || "No title",
      content:
        responseData.data?.markdown || responseData.data?.html || "No content",
      metadata: responseData.data?.metadata || {},
      rawData: responseData.data,
    });
  } catch (error) {
    console.error("Error scraping content:", error);
    return NextResponse.json(
      { error: "Failed to scrape content" },
      { status: 500 }
    );
  }
}
