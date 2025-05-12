import {
	type WorkflowEvent,
	type WorkflowStep,
	WorkflowEntrypoint,
} from "cloudflare:workers";

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

type Env = { TELEGRAM_BOT_TOKEN: string; GEMINI_API_KEY: string };
type Params = Update;

const extractUrls = (text: string): string[] => {
	const urlRegex = /https?:\/\/[^\s]+/g;
	const urls = text.match(urlRegex);
	return urls ? urls : [];
};

/**
 * Cleans HTML content for AI summarization using Cloudflare HTMLRewriter
 *
 * @param response Response object from fetch containing HTML content
 * @returns Promise resolving to clean text suitable for AI summarization
 */
async function cleanResponseForAiSummarizationAndConvertToString(
	response: Response,
): Promise<string> {
	// Create a collector for the text content
	const collector: { content: string } = { content: "" };

	// Build HTMLRewriter with a series of transformations
	const rewriter = new HTMLRewriter()
		// 1. Remove non-content elements
		.on("script, style, link, meta, iframe, svg, img, noscript", {
			element(element): void {
				element.remove();
			},
		})
		// 2. Remove navigation, headers, footers, ads, etc.
		.on(
			'nav, header, footer, aside, [id*="nav"], [class*="nav"], [id*="header"], [id*="footer"], [id*="sidebar"], [id*="ad"], [class*="ad"], [id*="banner"], [class*="banner"]',
			{
				element(element): void {
					element.remove();
				},
			},
		)
		// 3. Remove comments, popups, and interactive elements
		.on(
			'[id*="comment"], [class*="comment"], [id*="popup"], [class*="popup"], form, button',
			{
				element(element): void {
					element.remove();
				},
			},
		)
		// 4. Extract text from main content elements
		.on(
			"article, .article, .content, .main, main, #content, #main, .post, p, h1, h2, h3, h4, h5, h6, li",
			{
				text(text): void {
					collector.content += `${text.text} `;
				},
			},
		);

	// Process the response
	await rewriter.transform(response.clone()).text();

	// Clean and normalize the collected text
	return collector.content
		.replace(/\s+/g, " ") // Normalize whitespace
		.trim(); // Remove leading/trailing whitespace
}

export class TelegramBotWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const update = event.payload;
		if (!update?.message) return;

		const chatId = update.message.chat.id;
		const messageId = update.message.message_id;
		const text = update.message.text || "";

		const messageUrls = extractUrls(text);

		if (messageUrls.length === 0) {
			return;
		}

		// now scrape each URL in its own step, in parallel
		const promises: Promise<void>[] = [];
		const contents: { url: string; content: string }[] = [];

		for (const link of messageUrls) {
			promises.push(
				step
					.do(`scrape ${link}`, async () => {
						const resp = await fetch(link, {
							headers: {
								"User-Agent":
									"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
								Accept:
									"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
								"Accept-Language": "en-US,en;q=0.9",
								Connection: "keep-alive",
								DNT: "1",
								"Upgrade-Insecure-Requests": "1",
							},
						});
						if (!resp.ok) {
							throw new Error(`Failed to fetch: ${resp.status}`);
						}

						return {
							url: link,
							content: await cleanResponseForAiSummarizationAndConvertToString(resp),
						};
					})
					.then((res) => {
						contents.push(res);
					})
					.catch((error) => {
						console.error(`Error fetching ${link}:`, error);
					}),
			);
		}

		await Promise.all(promises);

		// now call Google AI to summarize the contents
		const geminiPromises: Promise<void | string>[] = [];
		const summaries: string[] = [];

		for (const content of contents) {
			geminiPromises.push(
				step
					.do(`summarize ${content.url}`, async () => {
						if (content.content == null || content.content === "") {
							const summary = `${content.url}\nSorry, I was not able to scrape that url.`;
							summaries.push(summary);
							return summary;
						}

						const resp = await fetch(
							`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.env.GEMINI_API_KEY}`,
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									system_instruction: {
										parts: [
											{
												text: "You are a researcher always looking for fascinating stuff. Summarize the following text in circa 3 sentences of coherent text, no lists or bulletpoints. No fluff, straight to the point, matter of fact, concise comprehensive summary. Respond with the summary only, no other stuff around.",
											},
										],
									},
									contents: [
										{
											parts: [
												{
													text: content.content,
												},
											],
										},
									],
								}),
							},
						);
						if (!resp.ok) {
							throw new Error(`Failed to fetch Gemini API: ${resp.status}`);
						}

						// biome-ignore lint/suspicious/noExplicitAny: the type is super complicated
						const data: any = await resp.json();
						const llmOutput = data.candidates[0].content.parts[0].text;

						if (llmOutput == null) {
							throw new Error("No text returned from Gemini API");
						}

						const summary = `${content.url}\n${llmOutput}`
						summaries.push(summary);
						return summary;
					})
					.catch((error) => {
						console.error(`Error summarizing ${content}:`, error);
					}),
			);
		}

		await Promise.all(geminiPromises);

		const finalMessage = summaries.join("\n\n");

		const token = this.env.TELEGRAM_BOT_TOKEN;
		const url = `https://api.telegram.org/bot${token}/sendMessage`;

		await step.do("send message", async () => {
			await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					chat_id: chatId,
					text: finalMessage,
					reply_parameters: { message_id: messageId },
					disable_notification: true,
					link_preview_options: { is_disabled: true },
				}),
			});

			return finalMessage;
		});
	}
}
