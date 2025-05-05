import type { Update } from "./workflow";

export { TelegramBotWorkflow } from "./workflow";

// Workflow binding interface
interface WorkflowBinding<T> {
	create(options: { params: T }): Promise<void>;
}

// define environment bindings
type Env = {
	TELEGRAM_BOT_WORKFLOW: WorkflowBinding<Update>;
	TELEGRAM_BOT_TOKEN: string;
};

export default {
	async fetch(request: Request, env: Env) {
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}

		let update: Update;
		try {
			update = await request.json();
		} catch {
			return new Response("Bad Request", { status: 400 });
		}

		// Trigger the Workflow asynchronously with the update payload
		await env.TELEGRAM_BOT_WORKFLOW.create({ params: update });

		// Respond to Telegram
		return new Response("OK");
	},
};
