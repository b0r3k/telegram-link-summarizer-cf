import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";

// Telegram update type for Workflow payload
export type Update = {
	update_id: number;
	message?: {
		message_id: number;
		from: {
			id: number;
			is_bot: boolean;
			first_name: string;
			last_name?: string; // Optional based on Telegram API
			username?: string; // Optional based on Telegram API
			language_code?: string; // Optional based on Telegram API
		};
		chat: {
			id: number;
			first_name?: string; // Optional based on Telegram API
			last_name?: string; // Optional based on Telegram API
			username?: string; // Optional based on Telegram API
			type: string; // e.g., "private", "group", "supergroup", "channel"
		};
		date: number; // Unix timestamp
		text?: string; // Optional as messages might be photos, etc.
	};
};

type Env = { TELEGRAM_BOT_TOKEN: string };
type Params = Update;

export class TelegramBotWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const update = event.payload;
		if (!update?.message) return;

		const chatId = update.message.chat.id;
		const messageId = update.message.message_id;
		const text = update.message.text || "";

		const token = this.env.TELEGRAM_BOT_TOKEN;
		const url = `https://api.telegram.org/bot${token}/sendMessage`;

		await step.do("echo message", async () => {
			await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					chat_id: chatId,
					text,
					reply_parameters: { message_id: messageId },
				}),
			});
		});
	}
}
