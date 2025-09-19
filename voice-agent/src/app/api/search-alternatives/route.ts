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

    // Alternative search engines that are less likely to block automation
    const alternatives = [
      {
        name: "DuckDuckGo",
        url: `https://duckduckgo.com/?q=${encodeURIComponent(intent.query)}`,
        selectors: {
          searchBox: "input[name='q']",
          searchButton: "input[type='submit']",
          results: ".results",
        },
      },
      {
        name: "Bing",
        url: `https://www.bing.com/search?q=${encodeURIComponent(
          intent.query
        )}`,
        selectors: {
          searchBox: "input[name='q']",
          searchButton: "input[type='submit']",
          results: ".b_results",
        },
      },
      {
        name: "Yahoo",
        url: `https://search.yahoo.com/search?p=${encodeURIComponent(
          intent.query
        )}`,
        selectors: {
          searchBox: "input[name='p']",
          searchButton: "button[type='submit']",
          results: ".searchCenterMiddle",
        },
      },
      {
        name: "Startpage",
        url: `https://www.startpage.com/sp/search?query=${encodeURIComponent(
          intent.query
        )}`,
        selectors: {
          searchBox: "input[name='query']",
          searchButton: "button[type='submit']",
          results: ".w-gl",
        },
      },
    ];

    // Choose based on intent site preference or default to DuckDuckGo
    let selectedEngine = alternatives[0]; // DuckDuckGo default

    if (intent.site) {
      if (intent.site.includes("bing")) {
        selectedEngine = alternatives[1];
      } else if (intent.site.includes("yahoo")) {
        selectedEngine = alternatives[2];
      } else if (intent.site.includes("startpage")) {
        selectedEngine = alternatives[3];
      }
    }

    return NextResponse.json({
      recommended: selectedEngine,
      alternatives: alternatives,
      reason:
        "Alternative search engines are less likely to trigger CAPTCHA challenges",
    });
  } catch (error) {
    console.error("Error getting search alternatives:", error);
    return NextResponse.json(
      { error: "Failed to get alternatives" },
      { status: 500 }
    );
  }
}
