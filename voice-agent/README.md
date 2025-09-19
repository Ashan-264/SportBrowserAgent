# Voice Agent - Next.js AI-Powered Browser Automation

This is a complete voice-activated browser automation system built with Next.js, TypeScript, and multiple AI services.

## Features

🎤 **Voice Recording** - Capture audio using the MediaRecorder API
🧠 **AI Transcription** - Convert speech to text using Deepgram
🤖 **Intent Parsing** - Understand user intent with Google Gemini AI
🕷️ **Web Scraping** - Gather context using Firecrawl
⚙️ **Action Planning** - Generate browser automation steps with AI
🌐 **Browser Automation** - Execute actions using Playwright

## Setup Instructions

### 1. Install Dependencies

The following packages are already installed:

- `@deepgram/sdk` - Speech-to-text transcription
- `@google/generative-ai` - Google Gemini AI for intent parsing
- `@mendable/firecrawl-js` - Web scraping
- `playwright` - Browser automation
- `axios` - HTTP client

### 2. Environment Variables

Create or update `.env.local` with your API keys:

```env
DEEPGRAM_API_KEY=your_deepgram_key
GEMINI_API_KEY=your_gemini_key
FIRECRAWL_API_KEY=your_firecrawl_key
BROWSERBASE_API_KEY=your_browserbase_key_optional
```

### 3. Get API Keys

1. **Deepgram**: Sign up at [deepgram.com](https://deepgram.com) for speech-to-text API
2. **Google Gemini**: Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
3. **Firecrawl**: Sign up at [firecrawl.dev](https://firecrawl.dev) for web scraping API
4. **Browserbase** (Optional): Sign up at [browserbase.com](https://browserbase.com) for cloud browser automation

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Voice Processing Pipeline

1. **Audio Capture**: User clicks "Start Recording" and speaks their request
2. **Transcription**: Audio is sent to `/api/transcribe` using Deepgram SDK
3. **Intent Parsing**: Transcript is analyzed by `/api/intent` using Google Gemini
4. **Web Scraping**: Context is gathered by `/api/firecrawl` based on the intent
5. **Action Planning**: AI refines the plan into browser steps via `/api/refine`
6. **Execution**: Browser automation runs via `/api/execute` using Playwright

### API Routes

- `/api/transcribe` - Converts audio to text using Deepgram
- `/api/intent` - Parses user intent from transcript using Gemini
- `/api/firecrawl` - Scrapes relevant web content
- `/api/refine` - Generates detailed browser automation steps
- `/api/execute` - Executes automation using Playwright/Browserbase

### Example Usage

Try saying:

- "Search for weather in New York"
- "Find the latest news on ESPN"
- "Look up information about artificial intelligence on Wikipedia"

The system will automatically:

1. Transcribe your speech
2. Understand your intent
3. Scrape relevant web pages
4. Generate browser automation steps
5. Execute the automation and show results

## Architecture

```
Frontend (React/Next.js)
├── MediaRecorder API for audio capture
├── Real-time log display with Tailwind CSS
└── Sequential API calls to backend

Backend API Routes
├── /api/transcribe (Deepgram)
├── /api/intent (Google Gemini)
├── /api/firecrawl (Web scraping)
├── /api/refine (Action planning)
└── /api/execute (Browser automation)

External Services
├── Deepgram (Speech-to-text)
├── Google Gemini (AI reasoning)
├── Firecrawl (Web scraping)
├── Playwright (Browser automation)
└── Browserbase (Optional cloud browsers)
```

## Development

The project uses:

- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **ESLint** for code quality

## Troubleshooting

1. **Microphone Access**: Ensure you allow microphone permissions in your browser
2. **API Keys**: Verify all API keys are correctly set in `.env.local`
3. **Browser Compatibility**: Chrome/Edge recommended for best MediaRecorder support
4. **Network**: Some features require internet connection for API calls

## License

MIT License - See LICENSE file for details
