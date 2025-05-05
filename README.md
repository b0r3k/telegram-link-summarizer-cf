# Telegram Echo Bot with Cloudflare Workflows

A simple Telegram bot using Cloudflare Workers & Workflows that echoes every received message.

## Prerequisites

- Node.js ≥ 18
- pnpm
- A Cloudflare account with Wrangler installed
- A Telegram bot token (obtain via @BotFather)

## Setup

1. Clone this repository and install dependencies:

   ```bash
   cd newbot
   pnpm install
   ```

2. Authenticate Wrangler (if not already):

   ```bash
   npx wrangler login
   ```

3. Store your Telegram bot token in a secret:

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   <enter token when prompted>
   ```

## Deployment

Since we need a public URL for the Telegram webhook, there is no simple way to test this locally. Instead, we will deploy the Worker and set up the webhook to point to it.

1. Deploy the Worker and Workflow to Cloudflare:

   ```bash
   npx wrangler deploy
   ```

2. Configure the Telegram webhook to point at your deployed Worker (create your worker subdomain if prompted):

   ```bash
   curl -F "url=https://telegram-bot-workflow.<YOUR_WORKER_SUBDOMAIN>.workers.dev" \
     https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook
   ```

## Usage

Once the webhook is set, send any message to your bot in Telegram. It will reply with the same text.

```shell
> You: Hello!
< Bot: Hello!
```

## Configuration

- `wrangler.jsonc` defines the Worker script entrypoint (`src/main.ts`) and the Workflow binding.
- `src/workflow.ts` contains the Workflow definition that listens for incoming updates and echoes messages.
- `src/main.ts` implements the Workers `fetch` handler to trigger the Workflow on each Telegram update.

## Cleanup

To remove the webhook:

```bash
curl https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook
```
