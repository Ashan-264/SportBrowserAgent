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
import jsPDF from 'jspdf';

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function BrowserAgentUI() {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "System initialized - Ready for automation",
    "Speech mode available - Click to enable",
    "Export features loaded - CSV and PDF ready"
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

  // Speech mode state
  const [speechMode, setSpeechMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null
  );
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Logging utility functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const addStagehandLog = (action: string, details?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = details 
      ? `[${timestamp}] Stagehand: ${action} - ${details}`
      : `[${timestamp}] Stagehand: ${action}`;
    setLogs(prev => [...prev, logMessage]);
  };

  // Speech functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/wav" });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");

      const response = await fetch("/api/speech/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setInputMessage(data.transcript);
      } else {
        console.error("Transcription failed:", data.error);
      }
    } catch (error) {
      console.error("Error transcribing audio:", error);
    }
  };

  const synthesizeAndPlaySpeech = async (text: string) => {
    if (!speechMode) return;

    try {
      setIsPlaying(true);
      const response = await fetch("/api/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();
      if (data.success && audioRef.current) {
        const audioBlob = new Blob([Buffer.from(data.audio, "base64")], {
          type: data.mimeType,
        });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
        };
        await audioRef.current.play();
      }
    } catch (error) {
      console.error("Error synthesizing speech:", error);
      setIsPlaying(false);
    }
  };

  // Export utility functions
  const exportChatAsCSV = () => {
    const csvContent = [
      ['Timestamp', 'Role', 'Content'],
      ...messages.map(msg => [
        msg.timestamp.toISOString(),
        msg.role,
        msg.content.replace(/\n/g, ' ').replace(/"/g, '""')
      ])
    ];
    
    const csvString = csvContent.map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `chat-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportLogsAsCSV = () => {
    const csvContent = [
      ['Index', 'Log Entry'],
      ...logs.map((log, index) => [
        (index + 1).toString(),
        log.replace(/\n/g, ' ').replace(/"/g, '""')
      ])
    ];
    
    const csvString = csvContent.map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `logs-export-${new Date().toISOString().split('T')[0]}.csv`;
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
    pdf.text('Chat Export', margin, yPosition);
    yPosition += 10;
    
    // Add export date
    pdf.setFontSize(10);
    pdf.text(`Exported on: ${new Date().toLocaleString()}`, margin, yPosition);
    yPosition += 15;
    
    // Add messages
    pdf.setFontSize(12);
    
    messages.forEach((message, index) => {
      const timeStr = message.timestamp.toLocaleString();
      const roleStr = message.role === 'user' ? 'You' : 'Agent';
      const headerStr = `[${timeStr}] ${roleStr}:`;
      
      // Check if we need a new page
      if (yPosition > pdf.internal.pageSize.height - 40) {
        pdf.addPage();
        yPosition = margin;
      }
      
      // Add message header
      pdf.setFont(undefined, 'bold');
      pdf.text(headerStr, margin, yPosition);
      yPosition += 7;
      
      // Add message content
      pdf.setFont(undefined, 'normal');
      const lines = pdf.splitTextToSize(message.content, pageWidth - 2 * margin);
      
      lines.forEach(line => {
        if (yPosition > pdf.internal.pageSize.height - 20) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += 5;
      });
      
      yPosition += 5; // Space between messages
    });
    
    pdf.save(`chat-export-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportLogsAsPDF = async () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 20;
    let yPosition = margin;
    
    // Add title
    pdf.setFontSize(16);
    pdf.text('Logs Export', margin, yPosition);
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
      
      lines.forEach(line => {
        if (yPosition > pdf.internal.pageSize.height - 20) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += 6;
      });
      
      yPosition += 3; // Space between log entries
    });
    
    pdf.save(`logs-export-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Add this function before the return statement
  const closeSession = async () => {
    if (!currentSessionId) return;

    try {
      const response = await fetch("/api/stagehand/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
      const data = await response.json();
      if (data.success) {
        setCurrentSessionId(null);
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

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollAreaRef.current) {
        const scrollContainer = scrollAreaRef.current.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [isLoading]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

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

      // Synthesize speech for assistant response if speech mode is enabled
      if (speechMode && assistantMessage.content) {
        await synthesizeAndPlaySpeech(assistantMessage.content);
      }
    } catch (error) {
      console.error("Error sending message:", error);
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

  const executeCommand = async () => {
    if (!inputMessage.trim() || isExecuting) return;

    setIsExecuting(true);

    const userMessage: Message = {
      role: "user",
      content: `🤘 Stagehand: ${inputMessage}`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsExecuting(true);

    try {
      // 1. start browser session so iframe shows
      const { sessionId, debugUrl } = await startBBSSession();
      setDebugUrl(debugUrl);

      const response = await fetch("/api/stagehand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: inputMessage,
          sessionId: sessionId,
        }),
      });

      const data = await response.json();

      let resultContent = "";
      if (data.success) {
        resultContent = data.result;
      } else {
        resultContent = `❌ **Stagehand Demo Failed**\n\nError: ${data.error}`;
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
      const errorMessage: Message = {
        role: "assistant",
        content:
          "❌ **Stagehand Error**\n\nFailed to run Stagehand automation demo.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsExecuting(false);
    }
  };

  const runAgent = async () => {
    if (!inputMessage.trim() || isAgentRunning) return;

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
      const { sessionId, debugUrl } = await startBBSSession();
      setDebugUrl(debugUrl);

      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          sessionId: sessionId,
          command: inputMessage,
        }),
      });

      const data = await response.json();

      let resultContent = "";
      if (data.success) {
        resultContent = `🤖 **Agent Execution Complete**\n\n`;
        resultContent += `**Task:** ${command}\n\n`;

        if (data.logs && data.logs.length > 0) {
          resultContent += `**Logs:**\n${data.logs
            .map((log: string) => `• ${log}`)
            .join("\n")}\n\n`;
        }

        if (data.result) {
          resultContent += `**Agent Results:**\n\`\`\`json\n${JSON.stringify(
            data.result,
            null,
            2
          )}\n\`\`\``;
        }
      } else {
        resultContent = `❌ **Agent Failed**\n\nError: ${data.error}`;
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
      const errorMessage: Message = {
        role: "assistant",
        content: "❌ **Agent Error**\n\nFailed to run agent mode.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsAgentRunning(false);
    }
  };

  const clearChat = () => {
    const initialMessage = conversationMode
      ? "Hello! I'm ready to chat and answer your questions."
      : "Ready to automate web tasks! I generate automation steps by default.";

    setMessages([
      { role: "assistant", content: initialMessage, timestamp: new Date() },
    ]);
  };

  const toggleConversationMode = () => {
    setConversationMode(!conversationMode);
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
      {/* Chatbox Section */}
      <div className="w-1/3 border-r border-blue-800 flex flex-col min-h-0">
        <Card className="bg-black/40 border-blue-800 h-full rounded-none flex flex-col min-h-0">
          <CardContent className="p-4 h-full flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="text-blue-400" />
                {conversationMode ? "Conversation" : "Automation"}
              </h2>
              <div className="flex gap-2">
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
                  {conversationMode ? "Chat" : "Auto"}
                </Button>
                <div className="flex gap-1">
                  <Button
                    onClick={exportChatAsCSV}
                    variant="outline"
                    size="sm"
                    className="border-green-600 text-green-400 hover:bg-green-900 text-xs"
                    title="Export Chat as CSV"
                  >
                    <Download className="mr-1 h-3 w-3" />
                    CSV
                  </Button>
                  <Button
                    onClick={exportChatAsPDF}
                    variant="outline"
                    size="sm"
                    className="border-green-600 text-green-400 hover:bg-green-900 text-xs"
                    title="Export Chat as PDF"
                  >
                    <FileText className="mr-1 h-3 w-3" />
                    PDF
                  </Button>
                </div>
                <Button
                  onClick={clearChat}
                  variant="outline"
                  size="sm"
                  className="border-red-600 text-red-400 hover:bg-red-900"
                >
                  Clear
                </Button>
              </div>
            </div>

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

            <div className="mt-4 space-y-2">
              <div className="flex gap-1">
                <input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    conversationMode
                      ? "Ask me anything..."
                      : "Describe the web action you want to automate..."
                  }
                  className="flex-1 bg-black/40 border border-blue-800 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
                  disabled={isLoading || isExecuting || isAgentRunning}
                />
                {speechMode && (
                  <Button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoading || isExecuting || isAgentRunning}
                    className={`px-4 ${
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
                  className="bg-blue-600 hover:bg-blue-700 px-4"
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    "📤"
                  )}
                </Button>
                {/* Add this button in your JSX after the existing buttons */}

                <Button
                  onClick={closeSession}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  🗑️ Close Browser Session
                </Button>
              </div>

              {/* Hidden audio element for speech playback */}
              <audio ref={audioRef} style={{ display: "none" }} />

              <div className="flex gap-1">
                <Button
                  onClick={executeCommand}
                  disabled={
                    isExecuting ||
                    !inputMessage.trim() ||
                    isLoading ||
                    isAgentRunning
                  }
                  className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
                >
                  {isExecuting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  🤘 Run Stagehand Demo
                </Button>

                <Button
                  onClick={runAgent}
                  disabled={
                    isAgentRunning ||
                    !inputMessage.trim() ||
                    isLoading ||
                    isExecuting
                  }
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-sm"
                >
                  {isAgentRunning ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Bot className="mr-2 h-4 w-4" />
                  )}
                  Run Agent Mode
                </Button>
              </div>
            </div>
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
            <div className="flex justify-between items-center p-2 border-b border-blue-700">
              <h3 className="text-sm font-semibold text-blue-300">System Logs</h3>
              <div className="flex gap-1">
                <Button
                  onClick={exportLogsAsCSV}
                  variant="outline"
                  size="sm"
                  className="border-green-600 text-green-400 hover:bg-green-900 text-xs"
                  title="Export Logs as CSV"
                >
                  <Download className="mr-1 h-2 w-2" />
                  CSV
                </Button>
                <Button
                  onClick={exportLogsAsPDF}
                  variant="outline"
                  size="sm"
                  className="border-green-600 text-green-400 hover:bg-green-900 text-xs"
                  title="Export Logs as PDF"
                >
                  <FileText className="mr-1 h-2 w-2" />
                  PDF
                </Button>
              </div>
            </div>
            <ScrollArea className="h-full p-3 text-sm text-blue-200">
              <p>[Log] Browser navigated to https://example.com</p>
              <p>[Log] Clicked button #submit</p>
              <p>[Log] Extracted text from #headline</p>
              {logs.map((log, index) => (
                <p key={index}>[Log] {log}</p>
              ))}
            </ScrollArea>
          </motion.div>
        )}
      </div>

      {/* Browser Live View Section */}
      <div className="flex-1 flex flex-col">
        <div className="flex gap-2 p-4 bg-black/40 border-b border-blue-800">
          <Button
            variant="outline"
            className="border-blue-600 text-blue-400 hover:bg-blue-900"
            onClick={() => setShowBrowser(!showBrowser)}
          >
            <PanelRight className="mr-2 h-4 w-4" /> Toggle Browser View
          </Button>
          <Button
            variant="outline"
            className="border-blue-600 text-blue-400 hover:bg-blue-900"
            onClick={() => setShowLogs(!showLogs)}
          >
            <List className="mr-2 h-4 w-4" /> Toggle Logs
          </Button>
        </div>

        {showBrowser ? (
          // <motion.div
          //   initial={{ opacity: 0 }}
          //   animate={{ opacity: 1 }}
          //   className="flex-1 bg-black/80 flex items-center justify-center text-blue-300"
          // >
          //   <p>🔵 Browser Live View Placeholder</p>

          // </motion.div>

          <StagehandEmbed debugUrl={debugUrl} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <p>Enable Browser View to see content</p>
          </div>
        )}
      </div>
    </div>
  );
}
