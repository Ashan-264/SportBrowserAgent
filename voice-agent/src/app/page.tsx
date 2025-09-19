"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";

interface LogEntry {
  id: string;
  timestamp: string;
  type:
    | "transcript"
    | "intent"
    | "firecrawl"
    | "refine"
    | "execute"
    | "answer"
    | "error";
  data: unknown;
  description: string;
}

interface ChatMessage {
  id: string;
  timestamp: string;
  type: "user" | "agent";
  content: string;
  status?: "informational" | "action_confirmed" | "error";
  isVoice?: boolean;
}

interface LiveSession {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CREATED";
  createdAt: string;
  liveUrl: string;
  screenshotUrl?: string;
  projectId?: string;
}

export default function VoiceAgent() {
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [liveSessionUrl, setLiveSessionUrl] = useState<string | null>(null);
  const [showLiveViewer, setShowLiveViewer] = useState(false);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [showLiveSessions, setShowLiveSessions] = useState(false);
  const [isPollingLiveSessions, setIsPollingLiveSessions] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Fetch live Browserbase sessions
  const fetchLiveSessions = useCallback(async () => {
    try {
      setIsPollingLiveSessions(true);
      const response = await fetch("/api/browserbase");
      if (response.ok) {
        const data = await response.json();
        setLiveSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("Failed to fetch live sessions:", error);
    } finally {
      setIsPollingLiveSessions(false);
    }
  }, []);

  // Poll for live sessions every 5 seconds when live sessions view is open
  useEffect(() => {
    if (showLiveSessions) {
      fetchLiveSessions();
      const interval = setInterval(fetchLiveSessions, 5000);
      return () => clearInterval(interval);
    }
  }, [showLiveSessions, fetchLiveSessions]);

  const addLog = useCallback(
    (type: LogEntry["type"], data: unknown, description: string) => {
      const newLog: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        data,
        description,
      };
      setLogs((prev) => [...prev, newLog]);
    },
    []
  );

  const addChatMessage = useCallback(
    (
      type: "user" | "agent",
      content: string,
      status?: ChatMessage["status"],
      isVoice?: boolean
    ) => {
      const newMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        content,
        status,
        isVoice,
      };
      setChatMessages((prev) => [...prev, newMessage]);
    },
    []
  );

  const setupAudioVisualization = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateAudioLevel = () => {
        if (analyser && isRecording) {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average);
          requestAnimationFrame(updateAudioLevel);
        }
      };

      updateAudioLevel();
    } catch (error) {
      console.error("Audio visualization setup failed:", error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Setup audio visualization
      setupAudioVisualization(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: "audio/webm;codecs=opus",
        });
        await processInput(audioBlob);

        // Stop all tracks and cleanup
        stream.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        setAudioLevel(0);
      };

      mediaRecorder.start();
      setIsRecording(true);
      addLog("transcript", null, "🎤 Recording started...");
    } catch (error) {
      console.error("Error starting recording:", error);
      addLog("error", error, "❌ Failed to start recording");
      addChatMessage(
        "agent",
        "❌ Failed to start recording. Please check microphone permissions.",
        "error"
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
      addLog("transcript", null, "⏹️ Recording stopped, processing...");
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isProcessing) return;

    const message = textInput.trim();
    setTextInput("");
    await processInput(message);
  };

  const processInput = async (input: Blob | string) => {
    setIsProcessing(true);

    try {
      let transcript = "";

      if (typeof input === "string") {
        // Text input
        transcript = input;
        addChatMessage("user", transcript, undefined, false);
      } else {
        // Voice input
        addChatMessage("user", "🎤 Voice message", undefined, true);

        // Step 1: Transcribe audio
        addLog("transcript", null, "🔄 Transcribing audio...");
        const transcribeResponse = await fetch("/api/transcribe", {
          method: "POST",
          body: input,
        });

        if (!transcribeResponse.ok) {
          throw new Error("Transcription failed");
        }

        const { transcript: transcribedText } = await transcribeResponse.json();
        transcript = transcribedText;
        addLog("transcript", transcript, `📝 Transcript: "${transcript}"`);

        // Update the user message with the transcript
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === prev[prev.length - 1]?.id
              ? { ...msg, content: transcript }
              : msg
          )
        );
      }

      // Step 2: Parse intent
      addLog("intent", null, "🧠 Parsing intent...");
      const intentResponse = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

      if (!intentResponse.ok) {
        throw new Error("Intent parsing failed");
      }

      const { intent } = await intentResponse.json();
      addLog("intent", intent, `🎯 Intent: ${intent.action} - ${intent.query}`);

      // Check if this is a question or an action request
      if (intent.action === "question" || intent.action === "ask") {
        // Handle as informational request
        addChatMessage(
          "agent",
          `I understand you're asking: "${intent.query}". Let me search for that information.`,
          "informational"
        );
      } else {
        addChatMessage(
          "agent",
          `I'll help you ${intent.action}: "${intent.query}". Starting automation...`,
          "informational"
        );
      }

      // Step 3: Scrape with Firecrawl
      addLog("firecrawl", null, "🕷️ Scraping web content...");
      const firecrawlResponse = await fetch("/api/firecrawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });

      if (!firecrawlResponse.ok) {
        throw new Error("Firecrawl scraping failed");
      }

      const firecrawlData = await firecrawlResponse.json();
      addLog("firecrawl", firecrawlData, `🌐 Scraped: ${firecrawlData.title}`);

      // Step 4: Refine instructions
      addLog("refine", null, "⚙️ Refining automation steps...");
      const refineResponse = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, firecrawlData }),
      });

      if (!refineResponse.ok) {
        throw new Error("Instruction refinement failed");
      }

      const refinedSteps = await refineResponse.json();
      addLog(
        "refine",
        refinedSteps,
        `🔧 Generated ${refinedSteps.steps?.length || 0} automation steps`
      );

      // Step 5: Execute in browser
      addLog("execute", null, "🤖 Executing browser automation...");
      const executeResponse = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: refinedSteps.steps,
          showBrowser: showBrowser,
        }),
      });

      if (!executeResponse.ok) {
        throw new Error("Browser execution failed");
      }

      const executionResult = await executeResponse.json();

      addLog(
        "execute",
        executionResult,
        `✅ Executed ${executionResult.summary?.successfulSteps || 0}/${
          executionResult.summary?.totalSteps || 0
        } steps successfully`
      );

      // Show live session URL if available
      if (
        executionResult.liveSessionUrl &&
        executionResult.browserType === "browserbase"
      ) {
        setLiveSessionUrl(executionResult.liveSessionUrl);
        addChatMessage(
          "agent",
          `🌐 Browser session running on Browserbase! You can watch the live session embedded below or [open in new tab](${executionResult.liveSessionUrl}).`,
          "informational"
        );
        setShowLiveViewer(true);
      } else if (executionResult.browserType === "local" && showBrowser) {
        addChatMessage(
          "agent",
          `🖥️ Browser automation running locally. Look for the browser window on your screen to watch the actions in real-time.`,
          "informational"
        );
      } else if (executionResult.browserType === "local" && !showBrowser) {
        addChatMessage(
          "agent",
          `⚡ Browser automation completed in headless mode for faster execution.`,
          "informational"
        );
      }

      // Step 6: Report automation status (no answer generation)
      addLog("answer", null, "✅ Automation completed - reporting status");

      const successfulSteps = executionResult.summary?.successfulSteps || 0;
      const totalSteps = executionResult.summary?.totalSteps || 0;

      // Report automation success/failure without generating answers
      if (successfulSteps === totalSteps && totalSteps > 0) {
        addChatMessage(
          "agent",
          `✅ Automation successful! Executed ${successfulSteps}/${totalSteps} steps successfully.`,
          "action_confirmed"
        );
      } else if (successfulSteps > 0) {
        addChatMessage(
          "agent",
          `⚠️ Automation partially successful: ${successfulSteps}/${totalSteps} steps completed.`,
          "error"
        );
      } else {
        addChatMessage(
          "agent",
          `❌ Automation failed: Unable to complete any steps. Please check the logs for details.`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error processing input:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      addLog("error", error, `❌ Error: ${errorMessage}`);
      addChatMessage(
        "agent",
        `❌ I encountered an error: ${errorMessage}. Please try again or rephrase your request.`,
        "error"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "transcript":
        return "text-blue-600 bg-blue-50";
      case "intent":
        return "text-purple-600 bg-purple-50";
      case "firecrawl":
        return "text-green-600 bg-green-50";
      case "refine":
        return "text-yellow-600 bg-yellow-50";
      case "execute":
        return "text-indigo-600 bg-indigo-50";
      case "answer":
        return "text-emerald-600 bg-emerald-50";
      case "error":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getChatMessageStyle = (status?: ChatMessage["status"]) => {
    switch (status) {
      case "informational":
        return "bg-blue-50 border-blue-200 text-blue-800";
      case "action_confirmed":
        return "bg-green-50 border-green-200 text-green-800";
      case "error":
        return "bg-red-50 border-red-200 text-red-800";
      default:
        return "bg-gray-50 border-gray-200 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🎤 Voice Agent
            <span className="text-sm font-normal text-gray-500">
              Chat & Automate
            </span>
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 flex flex-col">
        {/* Chat Area */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border mb-4 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Chat</h2>
            <div className="flex gap-2">
              {liveSessionUrl && (
                <button
                  onClick={() => setShowLiveViewer(!showLiveViewer)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    showLiveViewer
                      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {showLiveViewer ? "Hide" : "Show"} Live Session
                </button>
              )}
              <button
                onClick={() => setShowLiveSessions(!showLiveSessions)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  showLiveSessions
                    ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {showLiveSessions ? "Hide" : "Show"} Live Sessions (
                {liveSessions.length})
              </button>
              <button
                onClick={() => setShowBrowser(!showBrowser)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  showBrowser
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {showBrowser ? "Hide" : "Show"} Browser
              </button>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                {showLogs ? "Hide" : "Show"} Logs ({logs.length})
              </button>
              <button
                onClick={clearChat}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                Clear Chat
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[400px]">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <div className="text-4xl mb-2">👋</div>
                <p>
                  Start a conversation! Ask me anything or give me a task to
                  automate.
                </p>
                <p className="text-sm mt-2">
                  Try: &quot;Search for weather in New York&quot; or &quot;Find
                  the latest news&quot;
                </p>
              </div>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.type === "user"
                        ? "bg-blue-500 text-white"
                        : `border ${getChatMessageStyle(message.status)}`
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {message.type === "agent" && (
                        <span className="text-lg">🤖</span>
                      )}
                      {message.type === "user" && message.isVoice && (
                        <span className="text-lg">🎤</span>
                      )}
                      <div className="flex-1">
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {message.timestamp}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type your message or question..."
                  disabled={isProcessing}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>

              <button
                type="submit"
                disabled={!textInput.trim() || isProcessing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>

              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing && !isRecording}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                    : isProcessing
                    ? "bg-gray-300 cursor-not-allowed text-gray-500"
                    : "bg-green-500 hover:bg-green-600 text-white"
                }`}
              >
                {isRecording ? (
                  <>
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    Stop
                  </>
                ) : isProcessing ? (
                  "⏳"
                ) : (
                  <>🎤 Voice</>
                )}
              </button>
            </form>

            {/* Audio Visualization */}
            {isRecording && (
              <div className="mt-3 flex items-center justify-center gap-1">
                <span className="text-sm text-red-600 mr-2">Recording:</span>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 bg-red-400 rounded-full transition-all duration-100"
                    style={{
                      height: `${Math.max(
                        4,
                        (audioLevel / 10) * Math.random() * 20
                      )}px`,
                    }}
                  />
                ))}
              </div>
            )}

            {isProcessing && (
              <div className="mt-2 text-center text-sm text-gray-600">
                <span className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Processing your request...
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Live Browser Session Viewer */}
        {showLiveViewer && liveSessionUrl && (
          <div className="bg-white rounded-lg shadow-sm border mb-4">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                🌐 Live Browser Session
              </h2>
              <div className="flex gap-2">
                <a
                  href={liveSessionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                >
                  Open in New Tab
                </a>
                <button
                  onClick={() => setShowLiveViewer(false)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  Hide Viewer
                </button>
              </div>
            </div>

            <div className="relative" style={{ height: "500px" }}>
              <iframe
                src={liveSessionUrl} // Remove navbar=false to show the navbar
                className="w-full h-full border-0 rounded-lg"
                title="Live Browser Session"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                allow="clipboard-read; clipboard-write; camera; microphone"
                loading="lazy"
                onLoad={() => {
                  // Listen for disconnection messages from Browserbase
                  const handleMessage = (event: MessageEvent) => {
                    if (event.data === "browserbase-disconnected") {
                      console.log("Browserbase session disconnected");
                      // Could show a reconnection UI here
                    }
                  };
                  window.addEventListener("message", handleMessage);
                  return () =>
                    window.removeEventListener("message", handleMessage);
                }}
              />
              <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                🟢 LIVE
              </div>
              <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                Browserbase Live View
              </div>
            </div>
          </div>
        )}

        {/* Live Sessions Display */}
        {showLiveSessions && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                🌐 Live Browserbase Sessions
                <span className="text-sm text-gray-500">
                  ({liveSessions.length} active)
                </span>
              </h3>
              <button
                onClick={() => setShowLiveSessions(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              {liveSessions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">🏖️</div>
                  <p>No active Browserbase sessions</p>
                  <p className="text-sm mt-1">
                    Start a query to create a new session
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {liveSessions.map((session, index) => (
                    <div
                      key={session.id || index}
                      className="border rounded-lg p-4 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="font-medium text-gray-800">
                            Session {session.id || `#${index + 1}`}
                          </span>
                          {session.status && (
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                session.status === "RUNNING"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {session.status}
                            </span>
                          )}
                        </div>

                        {session.liveUrl && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setLiveSessionUrl(session.liveUrl);
                                setShowLiveViewer(true);
                              }}
                              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            >
                              View Live
                            </button>
                            <a
                              href={session.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                            >
                              Open Tab
                            </a>
                          </div>
                        )}
                      </div>

                      {session.createdAt && (
                        <div className="text-sm text-gray-600 mb-2">
                          Created:{" "}
                          {new Date(session.createdAt).toLocaleString()}
                        </div>
                      )}

                      {session.projectId && (
                        <div className="text-sm text-gray-500">
                          Project: {session.projectId}
                        </div>
                      )}

                      {session.liveUrl && (
                        <div className="mt-3 p-3 bg-white rounded border">
                          <div className="text-xs text-gray-500 mb-1">
                            Live URL:
                          </div>
                          <code className="text-xs text-blue-600 break-all">
                            {session.liveUrl}
                          </code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-4 border-t flex justify-between items-center text-sm text-gray-500">
                <span>Auto-refreshing every 5 seconds</span>
                <button
                  onClick={fetchLiveSessions}
                  disabled={isPollingLiveSessions}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {isPollingLiveSessions ? "Refreshing..." : "Refresh Now"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logs Dropdown */}
        {showLogs && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Execution Logs ({logs.length})
              </h2>
              <button
                onClick={clearLogs}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                Clear Logs
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-4 space-y-3">
              {logs.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  No execution logs yet. Start a conversation to see detailed
                  logs.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border-l-4 ${getLogColor(
                      log.type
                    )}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium uppercase text-xs tracking-wide">
                        {log.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {log.timestamp}
                      </span>
                    </div>

                    <div className="text-sm mb-2">{log.description}</div>

                    {(() => {
                      if (log.data) {
                        return (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">
                              📄 View Data
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        );
                      }
                      return null;
                    })()}

                    {/* Special handling for screenshots */}
                    {(() => {
                      if (
                        log.type === "execute" &&
                        log.data &&
                        typeof log.data === "object" &&
                        log.data !== null &&
                        "logs" in log.data &&
                        Array.isArray(
                          (log.data as { logs: { screenshot?: string }[] }).logs
                        )
                      ) {
                        return (
                          <div className="mt-2 space-y-2">
                            {(
                              log.data as { logs: { screenshot?: string }[] }
                            ).logs.map(
                              (
                                execLog: { screenshot?: string },
                                index: number
                              ) => (
                                <div key={index}>
                                  {execLog.screenshot && (
                                    <div>
                                      <p className="text-xs text-gray-600 mb-1">
                                        Screenshot:
                                      </p>
                                      <Image
                                        src={`data:image/png;base64,${execLog.screenshot}`}
                                        alt="Browser screenshot"
                                        className="max-w-full h-auto rounded border"
                                        width={800}
                                        height={600}
                                        style={{
                                          width: "auto",
                                          height: "auto",
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
