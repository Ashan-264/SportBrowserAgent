"use client";
import { StagehandEmbed } from "@/components/ui/stagehandEmbed";
import { startBBSSession } from "@/app/api/stagehand/main";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelRight,
  List,
  MessageSquare,
  MessageCircle,
  Play,
  Bot,
  Mic,
  MicOff,
  Volume2,
  Download,
  FileText,
} from "lucide-react";
import { motion } from "framer-motion";
import jsPDF from "jspdf";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ExtractedDataItem {
  id: string;
  content: string;
  type: string;
  timestamp: Date;
  source?: string;
}

export default function BrowserAgentUI() {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "System initialized - Ready for automation",
    "Speech mode available - Click to enable",
    "Export features loaded - CSV and PDF ready",
  ]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Ready to automate web tasks! I generate automation steps by default.",
      timestamp: new Date(),
    },
  ]);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Add this state variable with your existing useState declarations
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Persistent session and data management
  const [extractedData, setExtractedData] = useState<ExtractedDataItem[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Speech mode state
  const [speechMode, setSpeechMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const isPlayingRef = useRef<boolean>(false);

  // UI state for chat visibility
  const [showChat, setShowChat] = useState(true);

  // Data management functions
  const addExtractedData = (content: string, type: string, source?: string) => {
    const newItem: ExtractedDataItem = {
      id: Date.now().toString(),
      content,
      type,
      timestamp: new Date(),
      source: source || currentUrl || "unknown",
    };
    setExtractedData((prev) => [...prev, newItem]);
    addLog(`New data extracted: ${type}`);
  };

  const sortExtractedData = (sortBy: "timestamp" | "type" | "content") => {
    setExtractedData((prev) => {
      const sorted = [...prev].sort((a, b) => {
        switch (sortBy) {
          case "timestamp":
            return b.timestamp.getTime() - a.timestamp.getTime();
          case "type":
            return a.type.localeCompare(b.type);
          case "content":
            return a.content.localeCompare(b.content);
          default:
            return 0;
        }
      });
      addLog(`Data sorted by: ${sortBy}`);
      return sorted;
    });
  };

  const clearExtractedData = () => {
    setExtractedData([]);
    addLog("Extracted data cleared");
  };

  // Logging utility functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const addStagehandLog = (action: string, details?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = details
      ? `[${timestamp}] Stagehand: ${action} - ${details}`
      : `[${timestamp}] Stagehand: ${action}`;
    setLogs((prev) => [...prev, logMessage]);
  };

  // Speech functions
  const startRecording = async () => {
    try {
      addLog("Starting microphone recording");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/wav" });
        addLog("Recording stopped, sending for transcription");
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      addLog("Recording started");
    } catch (error) {
      console.error("Error starting recording:", error);
      addLog(`Recording error: ${error}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      addLog("Recording stopped by user");
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      addLog("Sending audio to Deepgram for transcription");
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");

      const response = await fetch("/api/speech/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setInputMessage(data.transcript);
        addLog(`Transcription successful: "${data.transcript}"`);
      } else {
        console.error("Transcription failed:", data.error);
        addLog(`Transcription failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Error transcribing audio:", error);
      addLog(`Transcription error: ${error}`);
    }
  };

  const stopSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    addLog("Speech playback stopped by user");
  };

  const synthesizeAndPlaySpeech = async (text: string) => {
    if (!speechMode) return;

    try {
      setIsPlaying(true);
      isPlayingRef.current = true;
      addLog("Synthesizing speech with Deepgram");
      const response = await fetch("/api/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${data.error || "Unknown error"}`
        );
      }

      if (data.success && audioRef.current && data.segments) {
        addLog(`Playing ${data.segments.length} audio segments sequentially`);

        // Check if we have valid audio data
        const validSegments = data.segments.filter((seg) => seg.audio);
        if (validSegments.length === 0) {
          addLog("No valid audio segments found in response");
          return;
        }

        addLog(`Found ${validSegments.length} valid audio segments`);

        // Play audio segments sequentially
        for (let i = 0; i < data.segments.length; i++) {
          // Check if playback was stopped using the ref
          if (!isPlayingRef.current) {
            addLog("Speech playback interrupted");
            break;
          }

          const segment = data.segments[i];

          if (!segment.audio) {
            addLog(
              `Skipping segment ${i + 1}: ${segment.error || "No audio data"}`
            );
            continue;
          }

          try {
            addLog(`Playing segment ${i + 1}/${data.segments.length}`);

            // Convert base64 to binary string, then to Uint8Array for browser compatibility
            const binaryString = atob(segment.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let j = 0; j < binaryString.length; j++) {
              bytes[j] = binaryString.charCodeAt(j);
            }

            const audioBlob = new Blob([bytes], {
              type: data.mimeType || "audio/wav",
            });
            const audioUrl = URL.createObjectURL(audioBlob);

            audioRef.current.src = audioUrl;

            // Wait for this segment to finish before playing the next
            await new Promise<void>((resolve, reject) => {
              if (!audioRef.current) {
                reject(new Error("Audio element not available"));
                return;
              }

              const onEnded = () => {
                audioRef.current?.removeEventListener("ended", onEnded);
                audioRef.current?.removeEventListener("error", onError);
                URL.revokeObjectURL(audioUrl);
                resolve();
              };

              const onError = (error: Event) => {
                console.error("Audio playback error:", error);
                addLog(
                  `Audio playback error: ${error.type || "Unknown audio error"}`
                );
                audioRef.current?.removeEventListener("ended", onEnded);
                audioRef.current?.removeEventListener("error", onError);
                URL.revokeObjectURL(audioUrl);
                reject(
                  new Error(
                    `Audio playback error: ${error.type || "Unknown error"}`
                  )
                );
              };

              audioRef.current.addEventListener("ended", onEnded);
              audioRef.current.addEventListener("error", onError);

              // Add loading event listener for debugging
              const onLoadStart = () => {
                addLog(`Audio loading started for segment ${i + 1}`);
              };
              const onCanPlay = () => {
                addLog(`Audio ready to play for segment ${i + 1}`);
              };

              audioRef.current.addEventListener("loadstart", onLoadStart);
              audioRef.current.addEventListener("canplay", onCanPlay);

              audioRef.current.play().catch((playError) => {
                console.error("Play error:", playError);
                addLog(`Audio play failed: ${playError.message}`);
                audioRef.current?.removeEventListener("loadstart", onLoadStart);
                audioRef.current?.removeEventListener("canplay", onCanPlay);
                reject(playError);
              });
            });

            // Small pause between segments and check if still playing
            if (i < data.segments.length - 1 && isPlayingRef.current) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          } catch (segmentError) {
            console.error(`Error playing segment ${i + 1}:`, segmentError);
            addLog(`Error playing segment ${i + 1}: ${segmentError}`);
          }
        }

        if (isPlayingRef.current) {
          addLog("All speech segments played successfully");
        }
      } else {
        console.error("Speech synthesis failed:", data.error);
        addLog(`Speech synthesis failed: ${data.error}`);
      }
    } catch (error) {
      console.error("Error synthesizing speech:", error);
      addLog(`Speech synthesis error: ${error}`);
    } finally {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  };

  // Export utility functions
  const exportChatAsCSV = () => {
    const csvContent = [
      ["Timestamp", "Role", "Content"],
      ...messages.map((msg) => [
        msg.timestamp.toISOString(),
        msg.role,
        msg.content.replace(/\n/g, " ").replace(/"/g, '""'),
      ]),
    ];

    const csvString = csvContent
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `chat-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportLogsAsCSV = () => {
    const csvContent = [
      ["Index", "Log Entry"],
      ...logs.map((log, index) => [
        (index + 1).toString(),
        log.replace(/\n/g, " ").replace(/"/g, '""'),
      ]),
    ];

    const csvString = csvContent
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `logs-export-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportChatAsPDF = async () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 20;
    let yPosition = margin;

    // Add title
    pdf.setFontSize(16);
    pdf.text("Chat Export", margin, yPosition);
    yPosition += 10;

    // Add export date
    pdf.setFontSize(10);
    pdf.text(`Exported on: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 15;

    // Add messages
    pdf.setFontSize(12);

    messages.forEach((message) => {
      const timeStr = message.timestamp.toLocaleString();
      const roleStr = message.role === "user" ? "You" : "Agent";
      const headerStr = `[${timeStr}] ${roleStr}:`;

      // Check if we need a new page
      if (yPosition > pdf.internal.pageSize.height - 40) {
        pdf.addPage();
        yPosition = margin;
      }

      // Add message header
      pdf.setFont("helvetica", "bold");
      pdf.text(headerStr, margin, yPosition);
      yPosition += 7;

      // Add message content
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(
        message.content,
        pageWidth - 2 * margin
      );

      lines.forEach((line: string) => {
        if (yPosition > pdf.internal.pageSize.height - 20) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += 5;
      });

      yPosition += 5; // Space between messages
    });

    pdf.save(`chat-export-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const exportLogsAsPDF = async () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 20;
    let yPosition = margin;

    // Add title
    pdf.setFontSize(16);
    pdf.text("Logs Export", margin, yPosition);
    yPosition += 10;

    // Add export date
    pdf.setFontSize(10);
    pdf.text(`Exported on: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 15;

    // Add logs
    pdf.setFontSize(12);

    logs.forEach((log, index) => {
      // Check if we need a new page
      if (yPosition > pdf.internal.pageSize.height - 30) {
        pdf.addPage();
        yPosition = margin;
      }

      // Add log entry
      const logStr = `${index + 1}. ${log}`;
      const lines = pdf.splitTextToSize(logStr, pageWidth - 2 * margin);

      lines.forEach((line: string) => {
        if (yPosition > pdf.internal.pageSize.height - 20) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += 6;
      });

      yPosition += 3; // Space between log entries
    });

    pdf.save(`logs-export-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // Add this function before the return statement
  const closeSession = async () => {
    if (!currentSessionId) return;

    try {
      addStagehandLog("Closing browser session", currentSessionId);
      const response = await fetch("/api/stagehand/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
      const data = await response.json();
      if (data.success) {
        setCurrentSessionId(null);
        setSessionActive(false);
        setCurrentUrl(null);
        setLastAction(null);
        addStagehandLog("Browser session closed successfully");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "✅ Browser session closed",
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error: Error | unknown) {
      addStagehandLog("Error closing session", String(error));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Error closing session ${error}`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    addLog("Sending message to Gemini");

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: inputMessage,
          conversationMode: conversationMode,
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || data.response || "No response received",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addLog("Received response from Gemini");

      // Synthesize speech for assistant response if speech mode is enabled
      if (speechMode && assistantMessage.content) {
        await synthesizeAndPlaySpeech(assistantMessage.content);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      addLog(`Chat error: ${error}`);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, there was an error processing your request.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollAreaRef.current) {
        try {
          const scrollContainer = scrollAreaRef.current.querySelector(
            "[data-radix-scroll-area-viewport]"
          );
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        } catch (error) {
          // Fallback: try to scroll the ref element directly
          console.warn("Primary scroll failed, trying fallback:", error);
          if (scrollAreaRef.current.scrollTop !== undefined) {
            scrollAreaRef.current.scrollTop =
              scrollAreaRef.current.scrollHeight;
          }
        }
      }
    }, 150); // Increased timeout for better reliability
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [isLoading]);

  const executeCommand = async () => {
    if (!inputMessage.trim() || isExecuting) return;

    setIsExecuting(true);
    addStagehandLog("Starting browser automation", inputMessage);

    const userMessage: Message = {
      role: "user",
      content: `${inputMessage}`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const originalCommand = inputMessage;
    setInputMessage("");
    setIsExecuting(true);

    try {
      let sessionId = currentSessionId;
      let debugUrl = null;

      // Only create new session if none exists
      if (!sessionId || !sessionActive) {
        addStagehandLog("Initializing new browser session");
        const session = await startBBSSession();
        sessionId = session.sessionId;
        debugUrl = session.debugUrl;
        setCurrentSessionId(sessionId);
        setDebugUrl(debugUrl);
        setSessionActive(true);
        addStagehandLog("Browser session started", `Session ID: ${sessionId}`);
      } else {
        addStagehandLog("Using existing browser session", sessionId);
      }

      addStagehandLog("Sending command to Gemini for action decision");
      const response = await fetch("/api/stagehand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: originalCommand,
          sessionId: sessionId,
          persistSession: true,
        }),
      });

      const data = await response.json();

      if (data.action) {
        addStagehandLog(
          `Action decided: ${data.action.command}`,
          data.action.instruction
        );
        setLastAction(data.action.command);

        // Update current URL if it's a goto action
        if (data.action.command === "goto" && data.action.url) {
          setCurrentUrl(data.action.url);
          addLog(`Navigated to: ${data.action.url}`);
        }
      }

      let resultContent = "";
      if (data.success) {
        // Prepare raw response for formatting (similar to runAgent)
        const rawResponse = data.result;

        // Format the response using Gemini to make it conversational
        try {
          addStagehandLog("Formatting response with Gemini");
          const formatResponse = await fetch("/api/format", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentResponse: rawResponse,
              task: originalCommand,
            }),
          });

          const formatData = await formatResponse.json();

          if (formatData.success && formatData.formattedResponse) {
            resultContent = formatData.formattedResponse;
            addStagehandLog("Response formatted successfully");
          } else {
            // Fallback to original response if formatting fails
            resultContent = rawResponse;
            addStagehandLog("Formatting failed, using original response");
          }
        } catch (formatError) {
          console.error("Error formatting response:", formatError);
          addStagehandLog(
            "Formatting error, using original response",
            String(formatError)
          );
          // Fallback to original response
          resultContent = rawResponse;
        }

        addStagehandLog("Command executed successfully");

        // If this was an extraction, store the data
        if (data.action?.command === "extract" && data.data?.extraction) {
          addExtractedData(
            data.data.extraction,
            "extraction",
            currentUrl || "current page"
          );
        }

        // Update current URL from response if available
        if (data.currentUrl) {
          setCurrentUrl(data.currentUrl);
        }
      } else {
        resultContent = `❌ **Stagehand Demo Failed**\n\nError: ${data.error}`;
        addStagehandLog("Command failed", data.error);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: resultContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Synthesize speech for assistant response if speech mode is enabled
      if (speechMode && resultContent) {
        await synthesizeAndPlaySpeech(resultContent);
      }
    } catch (error) {
      console.error("Error running Stagehand:", error);
      addStagehandLog("Error occurred", String(error));
      const errorMessage: Message = {
        role: "assistant",
        content:
          "❌ **Stagehand Error**\n\nFailed to run Stagehand automation demo.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsExecuting(false);
      addStagehandLog("Browser automation completed");
    }
  };

  const runAgent = async () => {
    if (!inputMessage.trim() || isAgentRunning) return;

    addStagehandLog("Starting agent mode", inputMessage);

    const userMessage: Message = {
      role: "user",
      content: `🤖 Agent Mode: ${inputMessage}`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const command = inputMessage;
    setInputMessage("");
    setIsAgentRunning(true);

    try {
      addStagehandLog("Initializing agent browser session");
      const { sessionId, debugUrl } = await startBBSSession();
      setDebugUrl(debugUrl);
      addStagehandLog("Agent session started", `Session ID: ${sessionId}`);

      addStagehandLog("Running agent automation", command);
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          sessionId: sessionId,
          command: command, // Use the stored command variable instead of inputMessage
        }),
      });

      const data = await response.json();

      let resultContent = "";
      if (data.success) {
        // Prepare raw response for formatting
        let rawResponse = `🤖 Agent Execution Complete\n\nTask: ${command}\n\n`;

        if (data.logs && data.logs.length > 0) {
          rawResponse += `Logs:\n${data.logs
            .map((log: string) => `• ${log}`)
            .join("\n")}\n\n`;

          // Add agent logs to our log system with enhanced display
          data.logs.forEach((log: string) => {
            // Check if this is a browsing action log
            if (
              log.includes("click") ||
              log.includes("navigate") ||
              log.includes("type") ||
              log.includes("extract") ||
              log.includes("goto") ||
              log.includes("action") ||
              log.toLowerCase().includes("performing") ||
              log.toLowerCase().includes("executing") ||
              log.toLowerCase().includes("visiting") ||
              log.toLowerCase().includes("searching")
            ) {
              addStagehandLog("🌐 Agent browsing", log);
            } else {
              addStagehandLog("Agent step", log);
            }
          });
        }

        if (data.result) {
          rawResponse += `Agent Results:\n${JSON.stringify(
            data.result,
            null,
            2
          )}`;
        }

        // Format the response using Gemini
        try {
          addStagehandLog("Formatting response with Gemini");
          const formatResponse = await fetch("/api/format", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentResponse: rawResponse,
              task: command,
            }),
          });

          const formatData = await formatResponse.json();

          if (formatData.success && formatData.formattedResponse) {
            resultContent = formatData.formattedResponse;
            addStagehandLog("Response formatted successfully");
          } else {
            // Fallback to original response if formatting fails
            resultContent = rawResponse;
            addStagehandLog("Formatting failed, using original response");
          }
        } catch (formatError) {
          console.error("Error formatting response:", formatError);
          addStagehandLog(
            "Formatting error, using original response",
            String(formatError)
          );
          // Fallback to original response
          resultContent = rawResponse;
        }

        addStagehandLog("Agent execution completed successfully");
      } else {
        resultContent = `❌ **Agent Failed**\n\nError: ${data.error}`;
        addStagehandLog("Agent execution failed", data.error);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: resultContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Synthesize speech for assistant response if speech mode is enabled
      if (speechMode && resultContent) {
        await synthesizeAndPlaySpeech(resultContent);
      }
    } catch (error) {
      console.error("Error running agent:", error);
      addStagehandLog("Agent error occurred", String(error));
      const errorMessage: Message = {
        role: "assistant",
        content: "❌ **Agent Error**\n\nFailed to run agent mode.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsAgentRunning(false);
      addStagehandLog("Agent mode completed");
    }
  };

  const clearChat = () => {
    addLog("Chat history cleared");
    const initialMessage = conversationMode
      ? "Hello! I'm ready to chat and answer your questions."
      : "Ready to automate web tasks! I generate automation steps by default.";

    setMessages([
      { role: "assistant", content: initialMessage, timestamp: new Date() },
    ]);
  };

  const toggleConversationMode = () => {
    setConversationMode(!conversationMode);
    const newMode = !conversationMode ? "conversation" : "automation";
    addLog(`Switched to ${newMode} mode`);
    const newMessage = !conversationMode
      ? "Hello! I'm ready to chat and answer your questions."
      : "Ready to automate web tasks! I generate automation steps by default.";

    setMessages([
      { role: "assistant", content: newMessage, timestamp: new Date() },
    ]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-black via-gray-900 to-blue-950 text-white">
      {/* Chatbox Section - Conditionally rendered */}
      {showChat && (
        <div className="w-1/3 border-r border-blue-800 flex flex-col min-h-0">
          <Card className="bg-black/40 border-blue-800 h-full rounded-none flex flex-col min-h-0">
            <CardContent className="p-4 h-full flex flex-col min-h-0">
              {/* Header Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MessageSquare className="text-blue-400" />
                    {conversationMode ? "Conversation" : "Automation"}
                    {sessionActive && (
                      <span className="text-xs bg-green-600 px-2 py-1 rounded-full">
                        Session Active
                      </span>
                    )}
                  </h2>
                  <Button
                    onClick={clearChat}
                    variant="outline"
                    size="sm"
                    className="border-red-600 text-red-400 hover:bg-red-900"
                  >
                    Clear Chat
                  </Button>
                </div>

                {/* Control Bar */}
                <div className="flex gap-2 mb-3">
                  <Button
                    onClick={toggleConversationMode}
                    variant="outline"
                    size="sm"
                    className={`border-blue-600 text-xs ${
                      conversationMode
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "text-blue-400 hover:bg-blue-900"
                    }`}
                  >
                    <MessageCircle className="mr-1 h-3 w-3" />
                    {conversationMode ? "Chat Mode" : "Auto Mode"}
                  </Button>

                  <Button
                    onClick={() => setSpeechMode(!speechMode)}
                    variant="outline"
                    size="sm"
                    className={`border-purple-600 text-xs ${
                      speechMode
                        ? "bg-purple-600 text-white hover:bg-purple-700"
                        : "text-purple-400 hover:bg-purple-900"
                    }`}
                  >
                    <Volume2 className="mr-1 h-3 w-3" />
                    {speechMode ? "Speech On" : "Speech Off"}
                  </Button>

                  {speechMode && isPlaying && (
                    <Button
                      onClick={stopSpeech}
                      variant="outline"
                      size="sm"
                      className="border-red-600 text-red-400 hover:bg-red-900 text-xs animate-pulse"
                      title="Stop Speech"
                    >
                      <Volume2 className="mr-1 h-3 w-3" />
                      Stop
                    </Button>
                  )}

                  <div className="flex border border-gray-600 rounded-md overflow-hidden">
                    <Button
                      onClick={exportChatAsCSV}
                      variant="ghost"
                      size="sm"
                      className="border-0 rounded-none text-green-400 hover:bg-green-900/50 text-xs"
                      title="Export Chat as CSV"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      CSV
                    </Button>
                    <Button
                      onClick={exportChatAsPDF}
                      variant="ghost"
                      size="sm"
                      className="border-0 rounded-none border-l border-gray-600 text-green-400 hover:bg-green-900/50 text-xs"
                      title="Export Chat as PDF"
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      PDF
                    </Button>
                  </div>
                </div>
              </div>

              {/* Session Status Panel */}
              {/* {sessionActive && (
                <div className="mb-4 p-3 bg-gradient-to-r from-gray-900/50 to-gray-800/50 border border-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-green-400">
                        🌐 Active Browser Session
                      </h3>
                      {extractedData.length > 0 && (
                        <span className="text-xs bg-blue-600 px-2 py-1 rounded-full">
                          {extractedData.length} items
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={closeSession}
                      variant="outline"
                      size="sm"
                      className="border-red-600 text-red-400 hover:bg-red-900 text-xs"
                    >
                      🗑️ Close Session
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs text-gray-300 mb-3">
                    <div>
                      <p className="text-gray-400">Current URL:</p>
                      <p className="text-blue-300 truncate">
                        {currentUrl ? new URL(currentUrl).hostname : "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Last Action:</p>
                      <p className="text-green-300">{lastAction || "None"}</p>
                    </div>
                  </div> */}

              {/* Data Management Controls */}
              {/* {extractedData.length > 0 && (
                    <div className="border-t border-gray-600 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-blue-300 font-medium">
                          Extracted Data Management:
                        </span>
                        <div className="flex gap-1">
                          <Button
                            onClick={() => sortExtractedData("timestamp")}
                            variant="outline"
                            size="sm"
                            className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/50 text-xs px-2 py-1"
                            title="Sort by Time"
                          >
                            Time
                          </Button>
                          <Button
                            onClick={() => sortExtractedData("type")}
                            variant="outline"
                            size="sm"
                            className="border-yellow-600 text-yellow-400 hover:bg-yellow-900/50 text-xs px-2 py-1"
                            title="Sort by Type"
                          >
                            Type
                          </Button>
                          <Button
                            onClick={clearExtractedData}
                            variant="outline"
                            size="sm"
                            className="border-red-600 text-red-400 hover:bg-red-900/50 text-xs px-2 py-1"
                            title="Clear Data"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      <div className="max-h-16 overflow-y-auto bg-black/30 rounded p-2">
                        {extractedData.slice(-3).map((item) => (
                          <p
                            key={item.id}
                            className="text-xs text-gray-400 truncate mb-1"
                          >
                            <span className="text-blue-400">{item.type}:</span>{" "}
                            {item.content.substring(0, 60)}...
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )} */}

              <ScrollArea
                ref={scrollAreaRef}
                className="flex-1 rounded-md p-2 bg-black/30 h-0 min-h-0 overflow-auto"
              >
                <div className="space-y-3 text-sm">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-md leading-relaxed ${
                        message.role === "user"
                          ? "bg-blue-900/50 border border-blue-800"
                          : "bg-gray-900/50 border border-gray-700"
                      }`}
                    >
                      <p
                        className={`text-xs opacity-70 mb-1 ${
                          message.role === "user"
                            ? "text-blue-300"
                            : "text-gray-300"
                        }`}
                      >
                        {message.role === "user" ? "You" : "Agent"}
                      </p>
                      <div className="whitespace-pre-wrap break-words overflow-x-auto text-white">
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {(isLoading || isExecuting || isAgentRunning) && (
                    <div className="p-3 rounded-md bg-gray-900/50 border border-gray-700 leading-relaxed">
                      <p className="text-xs opacity-70 mb-1 text-gray-300">
                        Agent
                      </p>
                      <div className="flex items-center gap-2 text-white">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                        <span>
                          {isAgentRunning
                            ? "Agent running..."
                            : isExecuting
                            ? "Executing..."
                            : "Thinking..."}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Input Section */}
              <div className="space-y-3">
                {/* Main Input Row */}
                <div className="flex gap-2">
                  <input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      conversationMode
                        ? "Ask me anything..."
                        : sessionActive && currentUrl
                        ? `Continue working on ${
                            new URL(currentUrl).hostname
                          }...`
                        : "Describe the web action you want to automate..."
                    }
                    className="flex-1 bg-black/40 border border-blue-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
                    disabled={isLoading || isExecuting || isAgentRunning}
                  />

                  {speechMode && (
                    <Button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isLoading || isExecuting || isAgentRunning}
                      className={`px-4 py-3 ${
                        isRecording
                          ? "bg-red-600 hover:bg-red-700 animate-pulse"
                          : "bg-purple-600 hover:bg-purple-700"
                      }`}
                    >
                      {isRecording ? (
                        <MicOff className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                  )}

                  <Button
                    onClick={sendMessage}
                    disabled={
                      isLoading ||
                      !inputMessage.trim() ||
                      isExecuting ||
                      isAgentRunning
                    }
                    className="bg-blue-600 hover:bg-blue-700 px-6 py-3"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>

                {/* Action Buttons Row */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={executeCommand}
                    disabled={
                      isExecuting ||
                      !inputMessage.trim() ||
                      isLoading ||
                      isAgentRunning
                    }
                    className="bg-green-600 hover:bg-green-700 text-sm py-3"
                  >
                    {isExecuting ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    {sessionActive ? "Continue Action" : "🤘 Run Stagehand"}
                  </Button>

                  <Button
                    onClick={runAgent}
                    disabled={
                      isAgentRunning ||
                      !inputMessage.trim() ||
                      isLoading ||
                      isExecuting
                    }
                    className="bg-purple-600 hover:bg-purple-700 text-sm py-3"
                  >
                    {isAgentRunning ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <Bot className="mr-2 h-4 w-4" />
                    )}
                    Agent Execution
                  </Button>
                </div>

                {/* Quick Actions for Active Sessions */}
                {sessionActive && currentUrl && (
                  <div className="bg-gray-900/30 border border-gray-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-2 font-medium">
                      Quick Actions for {new URL(currentUrl).hostname}:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        onClick={() => {
                          setInputMessage(
                            "extract all text content from this page"
                          );
                        }}
                        variant="outline"
                        size="sm"
                        className="border-cyan-600 text-cyan-400 hover:bg-cyan-900/50 text-xs py-2"
                        disabled={isExecuting || isAgentRunning || isLoading}
                      >
                        Extract Text
                      </Button>
                      <Button
                        onClick={() => {
                          setInputMessage("extract all links from this page");
                        }}
                        variant="outline"
                        size="sm"
                        className="border-cyan-600 text-cyan-400 hover:bg-cyan-900/50 text-xs py-2"
                        disabled={isExecuting || isAgentRunning || isLoading}
                      >
                        Extract Links
                      </Button>
                      <Button
                        onClick={() => {
                          setInputMessage(
                            "observe what actions can be performed on this page"
                          );
                        }}
                        variant="outline"
                        size="sm"
                        className="border-cyan-600 text-cyan-400 hover:bg-cyan-900/50 text-xs py-2"
                        disabled={isExecuting || isAgentRunning || isLoading}
                      >
                        Observe
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden audio element for speech playback */}
              <audio ref={audioRef} style={{ display: "none" }} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Browser Live View Section */}
      <div className="flex-1 flex flex-col">
        {/* Browser Controls */}
        <div className="flex justify-between items-center p-4 bg-black/40 border-b border-blue-800">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-blue-600 text-blue-400 hover:bg-blue-900"
              onClick={() => {
                const newState = !showBrowser;
                setShowBrowser(newState);
                addLog(
                  `Browser live view ${newState ? "enabled" : "disabled"}`
                );
                if (newState && debugUrl) {
                  addLog(`Browser view showing debug session: ${debugUrl}`);
                }
              }}
            >
              <PanelRight className="mr-2 h-4 w-4" />
              {showBrowser ? "Hide" : "Show"} Browser
            </Button>

            <Button
              variant="outline"
              className={`border-blue-600 hover:bg-blue-900 ${
                showChat ? "text-blue-300 bg-blue-900/50" : "text-blue-400"
              }`}
              onClick={() => {
                const newState = !showChat;
                setShowChat(newState);
                addLog(`Chat panel ${newState ? "opened" : "closed"}`);
              }}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {showChat ? "Hide" : "Show"} Chat
            </Button>

            <Button
              variant="outline"
              className={`border-blue-600 hover:bg-blue-900 ${
                showLogs ? "text-blue-300 bg-blue-900/50" : "text-blue-400"
              }`}
              onClick={() => {
                const newState = !showLogs;
                setShowLogs(newState);
                addLog(`System logs panel ${newState ? "opened" : "closed"}`);
              }}
            >
              <List className="mr-2 h-4 w-4" />
              {showLogs ? "Hide" : "Show"} Logs
            </Button>

            <Button
              onClick={closeSession}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              🗑️ Close Browser Session
            </Button>
          </div>

          {debugUrl && (
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span>Debug Session Active</span>
            </div>
          )}
        </div>

        {/* Browser Content */}
        <div className="flex-1 flex min-h-0">
          {/* Browser View */}
          {showBrowser ? (
            <div
              className={`${
                showLogs ? "flex-1" : "w-full"
              } bg-black/20 flex flex-col min-h-0`}
            >
              <StagehandEmbed debugUrl={debugUrl} />
            </div>
          ) : (
            <div
              className={`${
                showLogs ? "flex-1" : "w-full"
              } flex items-center justify-center bg-gradient-to-br from-gray-900/50 to-gray-800/50 text-gray-500`}
            >
              <div className="text-center">
                <PanelRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Browser View Disabled</p>
                <p className="text-sm">
                  Click &quot;Show Browser&quot; to view automation
                </p>
                {logs.length > 0 && (
                  <p className="text-xs text-blue-400 mt-2">
                    {logs.length} log entries tracked in the logs panel
                  </p>
                )}
                {!showChat && (
                  <p className="text-xs text-purple-400 mt-1">
                    Chat panel is hidden - use &quot;Show Chat&quot; to access
                    controls
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Logs Side Panel - Always available */}
          {showLogs && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "400px", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-black/60 border-l border-blue-800 overflow-hidden flex flex-col min-h-0"
            >
              <div className="flex justify-between items-center p-3 border-b border-blue-700 bg-gray-900/50 flex-shrink-0">
                <h3 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
                  <List className="h-4 w-4" />
                  System Logs
                  <span className="text-xs bg-blue-600 px-2 py-1 rounded-full">
                    {logs.length}
                  </span>
                </h3>
                <div className="flex border border-gray-600 rounded-md overflow-hidden">
                  <Button
                    onClick={exportLogsAsCSV}
                    variant="ghost"
                    size="sm"
                    className="border-0 rounded-none text-green-400 hover:bg-green-900/50 text-xs"
                    title="Export Logs as CSV"
                  >
                    <Download className="mr-1 h-3 w-3" />
                    CSV
                  </Button>
                  <Button
                    onClick={exportLogsAsPDF}
                    variant="ghost"
                    size="sm"
                    className="border-0 rounded-none border-l border-gray-600 text-green-400 hover:bg-green-900/50 text-xs"
                    title="Export Logs as PDF"
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-3 space-y-1">
                  {logs.length > 0 ? (
                    logs.map((log, index) => (
                      <div
                        key={index}
                        className="p-2 bg-gray-900/30 rounded text-xs font-mono text-blue-200 border-l-2 border-blue-500/30 break-words"
                      >
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-400 italic py-8">
                      No logs yet...
                    </div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
