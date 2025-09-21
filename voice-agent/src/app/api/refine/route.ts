import { GoogleGenerativeAI } from "@google/generative-ai";
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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Based on the user intent, create detailed browser automation steps.

USER INTENT:
${JSON.stringify(intent, null, 2)}

AUTOMATION STRATEGY:
- For factual queries (weather, definitions, quick facts): Extract from search result snippets
- For news/articles/detailed content: CLICK THROUGH to the first relevant result and extract from the actual page
- For current events/news: Always click through to news sources, don't rely on search snippets
- For search queries: Use DuckDuckGo as the primary search engine to avoid CAPTCHAs

Create a JSON response with automation steps for Playwright/Browserbase. Output ONLY valid JSON with this structure:
{
  "steps": [
    {
      "action": "navigate" | "click" | "fill" | "extractText" | "screenshot" | "wait",
      "url": "target URL (for navigate action)",
      "selector": "CSS selector (for click, fill, extractText actions)",
      "value": "text to input (for fill action)",
      "timeout": 5000,
      "description": "human readable description of this step"
    }
  ],
  "expectedOutcome": "description of what these steps should accomplish"
}

AVAILABLE ACTIONS:
- navigate: Go to a specific URL
- click: Click on an element
- fill: Type text into an input field
- extractText: Get text content from an element
- screenshot: Take a screenshot
- wait: Wait for a specified time

SEARCH ENGINE SPECIFIC SELECTORS:
- DuckDuckGo: 
  * Search input: 'input[name="q"]'
  * Search button: '#search_button_homepage, button[type="submit"], .btn--primary'
  * Results: '.result, [data-testid="result"], .web-result, .results .result'
  * Result titles: '.result__title a, .result h2 a'
  * Result snippets: '.result__snippet, .result__body'
  * Answer boxes: '.zci-wrap, .about-info-box, .infobox'
- Bing:
  * Search input: 'input[name="q"]'
  * Search button: '#sb_form_go'
  * Results: '.b_algo, .b_ans'
  * Result snippets: '.b_caption p, .b_snippet'
  * Answer boxes: '.b_ans, .b_entityTP'
- Yahoo:
  * Search input: 'input[name="p"]'
  * Search button: 'button[type="submit"]'
  * Results: '.searchCenterMiddle .dd, .compTitle'

Example for "search for weather":
{
  "steps": [
    {
      "action": "navigate",
      "url": "https://duckduckgo.com",
      "timeout": 10000,
      "description": "Navigate to DuckDuckGo (less likely to trigger CAPTCHA)"
    },
    {
      "action": "wait",
      "timeout": 2000,
      "description": "Wait for page to fully load"
    },
    {
      "action": "fill",
      "selector": "input[name='q']",
      "value": "weather",
      "timeout": 8000,
      "description": "Type 'weather' in search box"
    },
    {
      "action": "click",
      "selector": "#search_button_homepage, button[type='submit'], .btn--primary",
      "timeout": 8000,
      "description": "Click search button"
    },
    {
      "action": "wait",
      "timeout": 3000,
      "description": "Wait for search results to load"
    },
    {
      "action": "extractText",
      "selector": ".zci-wrap, .about-info-box, .infobox, .result__snippet, .result__body",
      "timeout": 5000,
      "description": "Extract answer from search result snippets or answer boxes"
    },
    {
      "action": "screenshot",
      "timeout": 2000,
      "description": "Take screenshot of search results"
    }
  ],
  "expectedOutcome": "Get search results and extract relevant information from snippets or answer boxes"
}

Example for "recent news" (requires clicking through to actual articles with multiple fallbacks):
{
  "steps": [
    {
      "action": "navigate",
      "url": "https://duckduckgo.com",
      "timeout": 10000,
      "description": "Navigate to DuckDuckGo"
    },
    {
      "action": "wait",
      "timeout": 2000,
      "description": "Wait for page to fully load"
    },
    {
      "action": "fill",
      "selector": "input[name='q']",
      "value": "recent news",
      "timeout": 8000,
      "description": "Type 'recent news' in the search box"
    },
    {
      "action": "click",
      "selector": "#search_button_homepage, button[type='submit'], .btn--primary",
      "timeout": 8000,
      "description": "Click the search button"
    },
    {
      "action": "wait",
      "timeout": 3000,
      "description": "Wait for search results to load"
    },
    {
      "action": "click",
      "selector": ".result:nth-child(1) .result__title a, .result:nth-child(1) h2 a, .result:nth-child(1) a[href*='http']",
      "timeout": 8000,
      "description": "Try clicking the first news result"
    },
    {
      "action": "wait",
      "timeout": 4000,
      "description": "Wait for first news page to load"
    },
    {
      "action": "extractText",
      "selector": "article, .article-content, .story-body, .post-content, .entry-content, main p, .content p, h1, h2, h3",
      "timeout": 5000,
      "description": "Extract content from first result - if this fails or gives poor content, continue to next steps"
    },
    {
      "action": "navigate",
      "url": "javascript:history.back()",
      "timeout": 3000,
      "description": "Go back to search results if first attempt was unsuccessful"
    },
    {
      "action": "click",
      "selector": ".result:nth-child(2) .result__title a, .result:nth-child(2) h2 a, .result:nth-child(2) a[href*='http']",
      "timeout": 8000,
      "description": "Try clicking the second news result as fallback"
    },
    {
      "action": "wait",
      "timeout": 4000,
      "description": "Wait for second news page to load"
    },
    {
      "action": "extractText",
      "selector": "article, .article-content, .story-body, .post-content, .entry-content, main p, .content p, h1, h2, h3",
      "timeout": 5000,
      "description": "Extract content from second result as fallback"
    },
    {
      "action": "screenshot",
      "timeout": 2000,
      "description": "Take screenshot of the final news article"
    }
  ],
  "expectedOutcome": "Navigate to actual news sources with multiple fallback attempts to ensure content extraction"
}

For queries requiring maximum source attempts (up to 10 tries), generate steps like this pattern:
1. Search on DuckDuckGo
2. Try clicking result 1 → extract content → evaluate quality
3. If content is poor, go back and try result 2 → extract → evaluate  
4. Continue for results 3, 4, 5... up to result 10 until good content is found
5. Use selectors like .result:nth-child(1), .result:nth-child(2), etc.
6. Include "navigate back" steps between attempts: {"action": "navigate", "url": "javascript:history.back()"}
7. Extract using comprehensive content selectors each time

IMPORTANT GUIDELINES:
- PREFER DuckDuckGo, Bing, or other alternatives over Google to avoid CAPTCHA
- Use these search engines: duckduckgo.com, bing.com, search.yahoo.com, startpage.com
- For factual queries with direct answers (weather, definitions, calculations), extract from search result snippets
- For content-heavy queries (news, articles, detailed information), CLICK THROUGH to multiple results with fallbacks
- News queries should ALWAYS include steps to try 2-3 different sources automatically
- Use specific selectors for answer boxes and content snippets (e.g., .result__snippet, .zci-wrap, .about-info-box)
- For complex questions, include automatic fallback steps: try result 1 → if fails/poor content → try result 2 → try result 3
- Include wait steps and random delays to appear more human-like
- Use realistic timeouts (5000-8000ms) for elements that may load slowly
- For DuckDuckGo, use multiple fallback selectors for better reliability
- ALWAYS include multiple result attempts for content queries - aim for 3-5 different source attempts
- Use .result:nth-child(N) selectors to target specific result positions
- Include back navigation between result attempts`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Clean the response to extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const refinedSteps = JSON.parse(jsonMatch[0]);

    return NextResponse.json(refinedSteps);
  } catch (error) {
    console.error("Error refining instructions:", error);
    return NextResponse.json(
      { error: "Failed to refine instructions" },
      { status: 500 }
    );
  }
}
