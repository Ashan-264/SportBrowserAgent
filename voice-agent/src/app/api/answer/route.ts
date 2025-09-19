import { NextRequest, NextResponse } from "next/server";

interface ExecutionResult {
  logs: Array<{
    step: {
      action: string;
      description: string;
    };
    result?: string;
    error?: string;
  }>;
  summary: {
    totalSteps: number;
    successfulSteps: number;
    errors: number;
  };
}

interface FirecrawlData {
  url: string;
  title: string;
  content: string;
  metadata?: {
    title?: string;
    [key: string]: unknown;
  };
}

interface Intent {
  action: string;
  query: string;
  site?: string;
}

export async function POST(request: NextRequest) {
  try {
    const {
      intent,
      firecrawlData,
      executionResult,
    }: {
      intent: Intent;
      firecrawlData: FirecrawlData;
      executionResult?: ExecutionResult;
    } = await request.json();

    if (!intent || !firecrawlData) {
      return NextResponse.json(
        { error: "Intent and firecrawl data are required" },
        { status: 400 }
      );
    }

    // Extract text content from execution results if available
    const extractedTexts: string[] = [];
    let hasLowQualityContent = false;
    let hasHighQualityContent = false;

    if (executionResult?.logs) {
      executionResult.logs.forEach((log: ExecutionResult["logs"][0]) => {
        if (log.step.action === "extractText" && log.result) {
          extractedTexts.push(log.result);

          // Check for quality indicators
          if (log.result.includes("[CONTENT_QUALITY: LOW")) {
            hasLowQualityContent = true;
          } else if (log.result.includes("[CONTENT_QUALITY: HIGH")) {
            hasHighQualityContent = true;
          }
        }
      });
    }

    // Clean content by removing quality indicators
    const cleanedTexts = extractedTexts.map((text) =>
      text.replace(/\[CONTENT_QUALITY:.*?\]/g, "").trim()
    );

    // Combine all available content
    const allContent = [firecrawlData.content, ...cleanedTexts]
      .filter(Boolean)
      .join("\n\n");

    // If we only have low-quality content, suggest trying more sources
    if (
      hasLowQualityContent &&
      !hasHighQualityContent &&
      allContent.length < 200
    ) {
      return NextResponse.json({
        answer:
          "I found some search results but they don't contain detailed information about your question. The extracted content appears to be promotional or navigation text rather than substantial answers. You might want to try asking your question in a different way or be more specific.",
        sources: [firecrawlData.url],
        confidence: "low",
        needsMoreSources: true,
        suggestion:
          "Try rephrasing your question or asking for more specific information",
      });
    }

    if (!allContent) {
      return NextResponse.json({
        answer:
          "I was unable to find any content to answer your question. The page might not have loaded properly or the content was not accessible.",
        sources: [firecrawlData.url],
        confidence: "low",
      });
    }

    // Use OpenAI to generate a natural language answer
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      // Fallback: simple text extraction without AI
      const truncatedContent = allContent.slice(0, 1000);
      return NextResponse.json({
        answer: `Based on the information I found: ${truncatedContent}${
          allContent.length > 1000 ? "..." : ""
        }`,
        sources: [firecrawlData.url],
        confidence: "medium",
      });
    }

    const prompt = `
You are a helpful assistant that answers questions based on web content. 

User's question: "${intent.query}"
Intent/Action: ${intent.action}

Web content found:
${allContent.slice(0, 4000)} ${
      allContent.length > 4000 ? "\n\n[Content truncated due to length]" : ""
    }

Please provide a direct, helpful answer to the user's question based on this content. If the content doesn't contain enough information to answer the question, say so clearly. Be concise but informative.

Guidelines:
- Give a direct answer to the specific question asked
- Use information from the content to support your answer
- If information is missing or unclear, acknowledge that
- Keep the response conversational and helpful
- Don't mention that you're analyzing web content - just answer naturally
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that provides clear, accurate answers based on web content.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const aiResponse = await response.json();
    const answer =
      aiResponse.choices?.[0]?.message?.content ||
      "I found information but couldn't generate a proper answer.";

    // Determine confidence based on execution success and content length
    let confidence: "high" | "medium" | "low" = "medium";

    if (
      executionResult?.summary?.successfulSteps ===
        executionResult?.summary?.totalSteps &&
      allContent.length > 500
    ) {
      confidence = "high";
    } else if (
      (executionResult?.summary?.successfulSteps ?? 0) > 0 ||
      allContent.length > 200
    ) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return NextResponse.json({
      answer,
      sources: [firecrawlData.url],
      confidence,
      rawContent: allContent.slice(0, 1000), // First 1000 chars for debugging
      contentLength: allContent.length,
    });
  } catch (error) {
    console.error("Error generating answer:", error);
    return NextResponse.json(
      {
        error: "Failed to generate answer",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
