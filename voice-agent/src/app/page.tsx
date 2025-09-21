"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelRight, List, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

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

export default function BrowserAgentUI() {
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
      const response = await fetch("/api/browserbase");
      if (response.ok) {
        const data = await response.json();
        setLiveSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("Failed to fetch live sessions:", error);
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

  return (
    <div className="flex h-screen bg-gradient-to-br from-black via-gray-900 to-blue-950 text-white">
      {/* Chatbox Section */}
      <div className="w-1/3 border-r border-blue-800 flex flex-col">
        <Card className="bg-black/40 border-blue-800 h-full rounded-none">
          <CardContent className="p-4 h-full flex flex-col">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <MessageSquare className="text-blue-400" /> Chat
            </h2>
            <ScrollArea className="flex-1 rounded-md p-2 bg-black/30">
              <div className="space-y-3 text-sm">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-blue-300 py-8">
                    <div className="text-4xl mb-2">👋</div>
                    <p>
                      Start a conversation! Ask me anything or give me a task to
                      automate.
                    </p>
                    <p className="text-xs mt-2">
                      Try: &quot;Search for weather in New York&quot; or
                      &quot;Find the latest news&quot;
                    </p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className="mb-3">
                      {message.type === "user" ? (
                        <p className="text-blue-300">
                          User: {message.content}
                          {message.isVoice && <span className="ml-2">🎤</span>}
                        </p>
                      ) : (
                        <p
                          className={`text-gray-200 ${
                            message.status === "error"
                              ? "text-red-300"
                              : message.status === "action_confirmed"
                              ? "text-green-300"
                              : "text-gray-200"
                          }`}
                        >
                          Agent: {message.content}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {message.timestamp}
                      </p>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="mt-4 flex">
              <input
                placeholder="Type your message..."
                className="flex-1 bg-black/40 border border-blue-800 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isProcessing && textInput.trim()) {
                    e.preventDefault();
                    const message = textInput.trim();
                    setTextInput("");
                    processInput(message);
                  }
                }}
                disabled={isProcessing}
              />
              <Button
                className="bg-blue-600 hover:bg-blue-700 rounded-l-none"
                onClick={() => {
                  if (textInput.trim() && !isProcessing) {
                    const message = textInput.trim();
                    setTextInput("");
                    processInput(message);
                  }
                }}
                disabled={!textInput.trim() || isProcessing}
              >
                Send
              </Button>
            </div>

            {/* Voice Recording */}
            <div className="mt-2 flex gap-2">
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing && !isRecording}
                className={`flex-1 ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : isProcessing
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isRecording ? (
                  <>
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse mr-2"></span>
                    Stop Recording
                  </>
                ) : isProcessing ? (
                  "Processing..."
                ) : (
                  <>🎤 Voice</>
                )}
              </Button>
            </div>

            {/* Audio Visualization */}
            {isRecording && (
              <div className="mt-3 flex items-center justify-center gap-1">
                <span className="text-sm text-red-400 mr-2">Recording:</span>
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
              <div className="mt-2 text-center text-sm text-blue-300">
                <span className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  Processing your request...
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logs Section */}
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "200px", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-black/60 border-t border-blue-800 overflow-hidden"
          >
            <ScrollArea className="h-full p-3 text-sm text-blue-200">
              {logs.length === 0 ? (
                <p className="text-gray-400">No logs yet...</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="mb-2">
                    <p className="text-blue-300">
                      [{log.timestamp}] [{log.type.toUpperCase()}]{" "}
                      {log.description}
                    </p>
                  </div>
                ))
              )}
            </ScrollArea>
          </motion.div>
        )}
      </div>

      {/* Browser Live View Section */}
      <div className="flex-1 flex flex-col">
        <div className="flex gap-2 p-4 bg-black/40 border-b border-blue-800">
          <Button
            variant="outline"
            className="border-blue-600 text-blue-400 hover:bg-blue-900 hover:text-blue-300"
            onClick={() => setShowBrowser(!showBrowser)}
          >
            <PanelRight className="mr-2 h-4 w-4" /> Toggle Browser View
          </Button>
          <Button
            variant="outline"
            className="border-blue-600 text-blue-400 hover:bg-blue-900 hover:text-blue-300"
            onClick={() => setShowLogs(!showLogs)}
          >
            <List className="mr-2 h-4 w-4" /> Toggle Logs
          </Button>

          {/* Additional Controls */}
          {liveSessionUrl && (
            <Button
              variant="outline"
              className="border-green-600 text-green-400 hover:bg-green-900 hover:text-green-300"
              onClick={() => setShowLiveViewer(!showLiveViewer)}
            >
              {showLiveViewer ? "Hide" : "Show"} Live Session
            </Button>
          )}

          <Button
            variant="outline"
            className="border-purple-600 text-purple-400 hover:bg-purple-900 hover:text-purple-300"
            onClick={() => setShowLiveSessions(!showLiveSessions)}
          >
            Sessions ({liveSessions.length})
          </Button>
        </div>

        {showBrowser || showLiveViewer ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 bg-black/80 flex flex-col"
          >
            {/* Live Browser Session Viewer */}
            {showLiveViewer && liveSessionUrl ? (
              <div className="flex-1 relative">
                <iframe
                  src={liveSessionUrl}
                  className="w-full h-full border-0"
                  title="Live Browser Session"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  allow="clipboard-read; clipboard-write; camera; microphone"
                  loading="lazy"
                />
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                  🟢 LIVE
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-blue-300">
                <div className="text-center">
                  <p className="text-2xl mb-2">🔵</p>
                  <p>Browser Live View Placeholder</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Start a task to see browser automation
                  </p>
                </div>
              </div>
            )}

            {/* Live Sessions Display */}
            {showLiveSessions && (
              <div className="bg-black/90 border-t border-blue-800 max-h-60 overflow-y-auto">
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">
                    🌐 Live Sessions ({liveSessions.length})
                  </h3>

                  {liveSessions.length === 0 ? (
                    <div className="text-center py-4 text-gray-400">
                      <p>No active sessions</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {liveSessions.map((session, index) => (
                        <div
                          key={session.id || index}
                          className="border border-blue-700 rounded p-3 bg-black/40"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                              <span className="text-blue-300">
                                Session {session.id || `#${index + 1}`}
                              </span>
                              {session.status && (
                                <span
                                  className={`px-2 py-1 text-xs rounded ${
                                    session.status === "RUNNING"
                                      ? "bg-green-900 text-green-300"
                                      : "bg-gray-700 text-gray-300"
                                  }`}
                                >
                                  {session.status}
                                </span>
                              )}
                            </div>
                            {session.liveUrl && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setLiveSessionUrl(session.liveUrl);
                                  setShowLiveViewer(true);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-xs"
                              >
                                View Live
                              </Button>
                            )}
                          </div>
                          {session.createdAt && (
                            <div className="text-xs text-gray-400 mt-1">
                              Created:{" "}
                              {new Date(session.createdAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-xl mb-2">🖥️</p>
              <p>Enable Browser View to see content</p>
              <p className="text-sm mt-2">
                Click &quot;Toggle Browser View&quot; above
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
