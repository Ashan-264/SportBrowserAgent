import { track } from "@vercel/analytics";

// Custom analytics events for Sport Browser Agent
export const analyticsEvents = {
  // Agent interactions
  agentStarted: (command: string) => {
    track("agent_started", { command, timestamp: new Date().toISOString() });
  },

  agentCompleted: (command: string, success: boolean, duration?: number) => {
    track("agent_completed", {
      command,
      success,
      duration: duration || 0,
      timestamp: new Date().toISOString(),
    });
  },

  // Stagehand interactions
  stagehandAction: (action: string, command: string) => {
    track("stagehand_action", {
      action,
      command,
      timestamp: new Date().toISOString(),
    });
  },

  stagehandCompleted: (action: string, success: boolean) => {
    track("stagehand_completed", {
      action,
      success,
      timestamp: new Date().toISOString(),
    });
  },

  // Speech interactions
  speechEnabled: () => {
    track("speech_enabled", { timestamp: new Date().toISOString() });
  },

  speechRecording: (duration?: number) => {
    track("speech_recording", {
      duration: duration || 0,
      timestamp: new Date().toISOString(),
    });
  },

  // Chat interactions
  chatMessage: (messageType: "user" | "assistant", messageLength: number) => {
    track("chat_message", {
      messageType,
      messageLength,
      timestamp: new Date().toISOString(),
    });
  },

  chatModeChanged: (mode: "conversation" | "automation") => {
    track("chat_mode_changed", {
      mode,
      timestamp: new Date().toISOString(),
    });
  },

  // Session management
  sessionCreated: (sessionType: "agent" | "stagehand") => {
    track("session_created", {
      sessionType,
      timestamp: new Date().toISOString(),
    });
  },

  sessionClosed: (sessionType: "agent" | "stagehand", duration?: number) => {
    track("session_closed", {
      sessionType,
      duration: duration || 0,
      timestamp: new Date().toISOString(),
    });
  },

  // Export actions
  dataExported: (exportType: "csv" | "pdf", dataType: "chat" | "logs") => {
    track("data_exported", {
      exportType,
      dataType,
      timestamp: new Date().toISOString(),
    });
  },

  // UI interactions
  panelToggled: (panel: "chat" | "logs" | "browser", visible: boolean) => {
    track("panel_toggled", {
      panel,
      visible,
      timestamp: new Date().toISOString(),
    });
  },

  // Error tracking
  errorOccurred: (
    errorType: string,
    errorMessage: string,
    context?: string
  ) => {
    track("error_occurred", {
      errorType,
      errorMessage,
      context: context || "unknown",
      timestamp: new Date().toISOString(),
    });
  },
};

// Page view tracking (automatically handled by Analytics component)
export const trackPageView = (path: string) => {
  track("page_view", { path, timestamp: new Date().toISOString() });
};
