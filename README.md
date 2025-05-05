# Telegram Link Summarizer on Cloudflare Workers

A Cloudflare Workers + Workflows project that listens for Telegram updates, scrapes any URLs in incoming messages, cleans and extracts the main text, summarizes the content via Google Gemini AI, and replies back to the user with concise summaries.

## Features

- Auto-detects URLs in Telegram messages  
- Fetches and cleans HTML (removes scripts, ads, nav, etc.)  
- Uses Google Gemini API for 3-sentence summaries  
- Replies via Telegram Bot API with link previews disabled  

## Prerequisites

- Node.js ≥18  
- pnpm (or npm/yarn)  
- Cloudflare account with Workers & Wrangler CLI  
- Telegram Bot Token  
- Google Gemini API Key (Generative Language API)  

## Installation

```bash
pnpm install
```


## Deployment

The Telegram webhook needs a public url, so we deploy to Cloudflare Workers. If prompted, create your worker subdomain.

```bash
npx wrangler deploy
```

## Telegram Webhook Setup

After deployment, set the bot webhook:

```bash
curl -F "url=https://telegram-bot-workflow.<YOUR_WORKER_SUBDOMAIN>/" \
  https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook
```

## Project Structure

```
.
├── .dev.vars             # Local env vars (git-ignored)
├── wrangler.jsonc        # Wrangler & Workflow config
├── src/
│   ├── main.ts           # HTTP entrypoint & Workflow trigger
│   └── workflow.ts       # WorkflowEntrypoint implementation
├── tsconfig.json
└── package.json
```

## Usage

1. Send any message containing one or more URLs to your Telegram bot.  
2. The Worker enqueues a Workflow that:
   - Scrapes each URL in parallel  
   - Cleans HTML, extracts text  
   - Calls Google Gemini to summarize  
   - Sends a single Telegram message with all summaries  
