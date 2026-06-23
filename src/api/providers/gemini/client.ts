/**
 * Simplified Gemini API implementation using js-genai SDK
 *
 * This replaces the complex API abstraction layer with a single,
 * streamlined implementation powered by @google/genai.
 */
import { createGoogleGenAI } from './google-genai-factory';
import {
	GoogleGenAI,
	Content,
	Part,
	GenerateContentParameters,
	GenerateContentResponse,
	GenerateContentResponseUsageMetadata,
} from '@google/genai';
import type { ThinkingLevel } from '@google/genai';
import {
	ModelApi,
	BaseModelRequest,
	ExtendedModelRequest,
	ModelResponse,
	ToolCall,
	StreamCallback,
	StreamingModelResponse,
	isExtendedRequest,
} from '../../interfaces/model-api';
import { GeminiPrompts } from '../../../prompts';
import type ObsidianGemini from '../../../main';
import { getDefaultModelForRole } from '../../../models';
import { decodeHtmlEntities } from '../../../utils/html-entities';
import type { GeminiClientConfig } from './config';
import { ModelUseCase } from '../../model-use-case';

/**
 * Per-use-case reasoning depth for Gemini 3.x `thinkingConfig.thinkingLevel`,
 * replacing the legacy global `thinkingBudget: -1`. These are starting points
 * (see #621; tune against the eval suite in #619): latency-sensitive paths
 * think the least, while CHAT — which is the agent loop — thinks the most.
 *
 * | Use case    | level    | why                                            |
 * | ----------- | -------- | ---------------------------------------------- |
 * | Completions | MINIMAL  | latency-sensitive, simple next-token output    |
 * | Summary     | LOW      | bounded, templated output                      |
 * | Rewrite     | LOW      | short, focused edits                           |
 * | Search      | MEDIUM   | query understanding + synthesis                |
 * | Chat        | HIGH     | agent mode: multi-step tool use, benefits most |
 */
// The literal strings are the `ThinkingLevel` enum's own runtime values, used
// directly (with a single cast) instead of the imported enum members so this
// module never touches the SDK's runtime namespace — keeping it load-safe under
// tests that mock `@google/genai`. The per-use-case values are covered by unit
// tests, which catch any typo here.
const THINKING_LEVEL_BY_USE_CASE: Record<ModelUseCase, ThinkingLevel> = {
	[ModelUseCase.COMPLETIONS]: 'MINIMAL',
	[ModelUseCase.SUMMARY]: 'LOW',
	[ModelUseCase.REWRITE]: 'LOW',
	[ModelUseCase.SEARCH]: 'MEDIUM',
	[ModelUseCase.CHAT]: 'HIGH',
} as Record<ModelUseCase, ThinkingLevel>;

/**
 * Extends Part to include the optional thought property
 */
interface PartWithThought extends Part {
	thought?: boolean;
	thoughtSignature?: string;
}

/**
 * GeminiClient - Simplified API wrapper using js-genai SDK
 *
 * Implements ModelApi interface while leveraging the official Google SDK
 */
export class GeminiClient implements ModelApi {
	private ai: GoogleGenAI;
	private config: GeminiClientConfig;
	private prompts: GeminiPrompts;
	private plugin?: ObsidianGemini;

	private static activeCaches = new Map<
		string,
		{
			cacheName: string;
			model: string;
			systemInstruction: string;
			toolsJson: string;
			cachedTurnsJson: string;
			expiresAt: number;
		}
	>();

	private static uploadedFiles = new Map<
		string,
		{
			fileUri: string;
			mimeType: string;
			expiresAt: number;
		}
	>();

	constructor(config: GeminiClientConfig, prompts?: GeminiPrompts, plugin?: ObsidianGemini) {
		this.config = {
			temperature: 1.0,
			topP: 0.95,
			streamingEnabled: true,
			...config,
		};
		this.plugin = plugin;
		this.prompts = prompts || new GeminiPrompts(plugin);
		this.ai = this.plugin ? createGoogleGenAI(this.plugin, config.apiKey) : new GoogleGenAI({ apiKey: config.apiKey });
	}

	/**
	 * Generate a non-streaming response
	 */
	async generateModelResponse(request: BaseModelRequest | ExtendedModelRequest): Promise<ModelResponse> {
		const params = await this.buildGenerateContentParams(request);

		try {
			const response = await this.ai.models.generateContent(params);
			return this.extractModelResponse(response);
		} catch (error) {
			this.plugin?.logger.error('[GeminiClient] Error generating content:', error);
			throw error;
		}
	}

	/**
	 * Generate a streaming response
	 */
	generateStreamingResponse(
		request: BaseModelRequest | ExtendedModelRequest,
		onChunk: StreamCallback
	): StreamingModelResponse {
		let cancelled = false;
		let accumulatedText = '';
		let accumulatedRendered = '';
		let accumulatedThoughts = '';
		let toolCalls: ToolCall[] | undefined;
		let lastUsageMetadata: GenerateContentResponseUsageMetadata | undefined = undefined;

		const complete = (async (): Promise<ModelResponse> => {
			const params = await this.buildGenerateContentParams(request);

			try {
				const stream = await this.ai.models.generateContentStream(params);

				for await (const chunk of stream) {
					if (cancelled) {
						break;
					}

					// Extract text from chunk
					const chunkText = this.extractTextFromChunk(chunk);
					if (chunkText) {
						accumulatedText += chunkText;
					}

					// Extract thought content from chunk
					const chunkThought = this.extractThoughtFromChunk(chunk);
					if (chunkThought) {
						accumulatedThoughts += chunkThought;
						this.plugin?.logger.debug(`[GeminiClient] Sending thought chunk to callback`);
					}

					// Call callback with both text and thought if either is present
					if (chunkText || chunkThought) {
						onChunk({
							text: chunkText,
							...(chunkThought && { thought: chunkThought }),
						});
					}

					// Accumulate tool calls across chunks, preserving thought signatures.
					// The model may stream different tool calls in separate chunks, or
					// repeat the same calls with/without signatures in later chunks.
					// Match by id when available (supports parallel calls to the same tool),
					// fall back to name matching for older API versions without ids.
					const chunkToolCalls = this.extractToolCallsFromChunk(chunk);
					if (chunkToolCalls?.length) {
						if (!toolCalls) {
							toolCalls = chunkToolCalls;
						} else {
							for (const newCall of chunkToolCalls) {
								const existing = newCall.id
									? toolCalls.find((tc) => tc.id === newCall.id)
									: toolCalls.find((tc) => tc.name === newCall.name);
								if (!existing) {
									toolCalls.push(newCall);
								} else if (!existing.thoughtSignature && newCall.thoughtSignature) {
									existing.thoughtSignature = newCall.thoughtSignature;
								}
							}
						}
					}

					// Extract search grounding (rendered HTML)
					const rendered = this.extractRenderedFromChunk(chunk);
					if (rendered) {
						accumulatedRendered += rendered;
					}

					// Capture usageMetadata from chunks (usually present in last chunk)
					if (chunk.usageMetadata) {
						lastUsageMetadata = chunk.usageMetadata;
						this.plugin?.logger.debug(
							`[GeminiClient] Captured usageMetadata from streaming chunk: ` +
								`prompt=${chunk.usageMetadata.promptTokenCount}, ` +
								`total=${chunk.usageMetadata.totalTokenCount}, ` +
								`cached=${chunk.usageMetadata.cachedContentTokenCount ?? 0}`
						);
					}
				}

				if (!lastUsageMetadata) {
					this.plugin?.logger.debug('[GeminiClient] No usageMetadata received from any streaming chunk');
				}

				return {
					markdown: accumulatedText,
					rendered: accumulatedRendered,
					...(accumulatedThoughts && { thoughts: accumulatedThoughts }),
					...(toolCalls && { toolCalls }),
					...(lastUsageMetadata && { usageMetadata: lastUsageMetadata }),
				};
			} catch (error) {
				if (cancelled) {
					return {
						markdown: accumulatedText,
						rendered: accumulatedRendered,
						...(accumulatedThoughts && { thoughts: accumulatedThoughts }),
						...(toolCalls && { toolCalls }),
						...(lastUsageMetadata && { usageMetadata: lastUsageMetadata }),
					};
				}
				this.plugin?.logger.error('[GeminiClient] Streaming error:', error);
				throw error;
			}
		})();

		return {
			complete,
			cancel: () => {
				cancelled = true;
			},
		};
	}

	/**
	 * Build GenerateContentParameters from our request format
	 */
	private async buildGenerateContentParams(
		request: BaseModelRequest | ExtendedModelRequest
	): Promise<GenerateContentParameters> {
		const isExtended = isExtendedRequest(request);
		const model = request.model || this.config.model || getDefaultModelForRole('chat');

		// Build system instruction
		let systemInstruction = '';
		if (isExtended) {
			// Build layered system prompt: identity → vault context → project →
			// agent rules → tool catalog → custom instructions → per-turn context
			systemInstruction = await this.prompts.buildExtendedSystemInstruction(request);
		} else {
			// For BaseModelRequest, prompt is the full input
			systemInstruction = request.prompt || '';
		}

		// Build config
		const config: any = {
			temperature: request.temperature ?? this.config.temperature,
			topP: request.topP ?? this.config.topP,
			...(this.config.maxOutputTokens && { maxOutputTokens: this.config.maxOutputTokens }),
			...(systemInstruction && { systemInstruction }),
		};

		// Add thinking config if model supports it. We steer reasoning depth with
		// `thinkingLevel` (Gemini 3.x) per use case — never the legacy
		// `thinkingBudget`, and never both knobs in one request. `includeThoughts`
		// stays true so reasoning persistence (#965) keeps receiving thought parts.
		if (this.supportsThinking(model)) {
			config.thinkingConfig = {
				includeThoughts: true,
				thinkingLevel: THINKING_LEVEL_BY_USE_CASE[this.config.useCase ?? ModelUseCase.CHAT],
			};
		}

		// Add function calling tools
		const hasTools = isExtended && request.availableTools?.length;
		if (hasTools) {
			const tools = request.availableTools!;
			const functionDeclarations = tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: {
					type: 'object' as const,
					properties: tool.parameters.properties || {},
					required: tool.parameters.required || [],
				},
			}));

			config.tools = config.tools || [];
			config.tools.push({ functionDeclarations });
		}

		// Build conversation contents
		let contents = await this.buildContents(request);

		let cachedContent: string | undefined;

		// Handle context caching if enabled and session ID is present
		const sessionId = this.config.sessionId;
		if (isExtended && sessionId && this.plugin?.settings.contextCachingEnabled) {
			const estimatedTokens = estimateTokensFromContents(contents);
			this.plugin.logger.debug(`[GeminiClient] Context Caching check: estimated tokens = ${estimatedTokens}`);

			const now = Date.now();
			// Clean up expired caches from map
			for (const [key, cacheInfo] of GeminiClient.activeCaches.entries()) {
				if (cacheInfo.expiresAt < now) {
					GeminiClient.activeCaches.delete(key);
				}
			}

			// We need at least 32,768 tokens to cache
			if (estimatedTokens >= 32768) {
				const toolsJson = JSON.stringify(config.tools || []);
				const cachedInfo = GeminiClient.activeCaches.get(sessionId);

				if (
					cachedInfo &&
					cachedInfo.model === model &&
					cachedInfo.systemInstruction === (systemInstruction || '') &&
					cachedInfo.toolsJson === toolsJson
				) {
					const cachedTurns = JSON.parse(cachedInfo.cachedTurnsJson) as Content[];
					if (this.checkHistoryPrefixMatch(contents, cachedTurns)) {
						this.plugin.logger.log(`[GeminiClient] Context Cache HIT! Reusing cache: ${cachedInfo.cacheName}`);
						cachedInfo.expiresAt = now + 300000; // Reset TTL (5 mins)
						cachedContent = cachedInfo.cacheName;

						// Slice off cached turns from the request contents
						contents = contents.slice(cachedTurns.length);
					} else {
						this.plugin.logger.log('[GeminiClient] Context Cache prefix mismatch, invalidating old cache');
						GeminiClient.activeCaches.delete(sessionId);
					}
				}

				// If no active cache matched, create a new one
				if (!cachedContent && contents.length > 1) {
					try {
						// Cache all turns except the very last one to ensure request is never empty and prefix is stable
						const contentsToCache = contents.slice(0, -1);
						const cachedTokens = estimateTokensFromContents(contentsToCache);

						if (cachedTokens >= 32768) {
							this.plugin.logger.log(
								`[GeminiClient] Context Cache MISS. Creating new context cache for session ${sessionId} (${cachedTokens} tokens)...`
							);
							const cache = await this.ai.caches.create({
								model: model,
								config: {
									contents: contentsToCache,
									systemInstruction: systemInstruction || '',
									...(config.tools?.length && { tools: config.tools }),
									ttl: '300s', // 5 minutes
								},
							});

							if (cache && cache.name) {
								this.plugin.logger.log(`[GeminiClient] Created context cache successfully: ${cache.name}`);
								GeminiClient.activeCaches.set(sessionId, {
									cacheName: cache.name,
									model,
									systemInstruction: systemInstruction || '',
									toolsJson,
									cachedTurnsJson: JSON.stringify(contentsToCache),
									expiresAt: now + 300000,
								});

								cachedContent = cache.name;
								// Slice off cached turns from the request contents
								contents = contents.slice(contentsToCache.length);
							}
						}
					} catch (e) {
						this.plugin.logger.warn(
							'[GeminiClient] Failed to create context cache (likely custom endpoint or unsupported model). Falling back to uncached request:',
							e
						);
						GeminiClient.activeCaches.delete(sessionId);
					}
				}
			} else {
				// History is too small, delete any existing cache
				GeminiClient.activeCaches.delete(sessionId);
			}
		}

		if (cachedContent) {
			config.cachedContent = cachedContent;
			// Since systemInstruction and tools are loaded from the cache, we should NOT pass them
			// again in the config, or the API might reject the request or complain about duplicates.
			delete config.systemInstruction;
			delete config.tools;
		}

		// Build params
		// If no contents built, use a simple string from the prompt
		let finalContents: any = contents;
		if (contents.length === 0 && !isExtended) {
			// For BaseModelRequest with no conversation, just pass the prompt as string
			finalContents = request.prompt || '';
		} else if (contents.length === 0 && isExtendedRequest(request)) {
			// For ExtendedModelRequest with no history, create a simple user message
			finalContents = request.userMessage || '';
		}

		const params: GenerateContentParameters = {
			model,
			contents: finalContents,
			config,
		};

		return params;
	}

	/**
	 * Build Content[] array from request
	 */
	private async buildContents(request: BaseModelRequest | ExtendedModelRequest): Promise<Content[]> {
		if (!isExtendedRequest(request)) {
			// BaseModelRequest - just send the prompt as user message
			if (!request.prompt) return [];
			return [
				{
					role: 'user',
					parts: [{ text: request.prompt }],
				},
			];
		}

		const extReq = request;
		const contents: Content[] = [];

		// Add conversation history
		if (extReq.conversationHistory?.length) {
			for (const entry of extReq.conversationHistory) {
				// Support Content format (already has role and parts)
				if ('role' in entry && entry.parts?.length) {
					// Map parts to use Files API if enabled
					const parts = await Promise.all(
						entry.parts.map(async (part) => {
							if (part.inlineData && part.inlineData.data && part.inlineData.mimeType) {
								const uploaded = await this.uploadAttachmentIfEnabled({
									base64: part.inlineData.data,
									mimeType: part.inlineData.mimeType,
								});
								if (uploaded) {
									return {
										fileData: {
											fileUri: uploaded.fileUri,
											mimeType: uploaded.mimeType,
										},
									};
								}
							}
							return part;
						})
					);
					contents.push({
						role: entry.role,
						parts,
					});
				}
				// Support our internal format with role and text
				else if ('role' in entry && 'text' in entry) {
					const legacy = entry as Content & { text: string };
					contents.push({
						role: legacy.role === 'user' ? 'user' : 'model',
						parts: [{ text: legacy.text }],
					});
				}
				// Support our internal format with role and message
				else if ('role' in entry && 'message' in entry) {
					const legacy = entry as Content & { role: string; message: string };
					contents.push({
						role: legacy.role === 'user' ? 'user' : 'model',
						parts: [{ text: legacy.message }],
					});
				}
			}
		}

		// Build user message parts (text + images)
		const userParts: Part[] = [];

		// Add text content if present
		if (extReq.userMessage && extReq.userMessage.trim()) {
			userParts.push({ text: extReq.userMessage });
		}

		// Add per-turn files and context if present
		if (extReq.perTurnContext && extReq.perTurnContext.trim()) {
			userParts.push({ text: extReq.perTurnContext });
		}

		// Add inline data attachments (images, audio, video, PDF)
		const allAttachments = [...(extReq.inlineAttachments || []), ...(extReq.imageAttachments || [])];
		for (const attachment of allAttachments) {
			const uploaded = await this.uploadAttachmentIfEnabled(attachment);
			if (uploaded) {
				userParts.push({
					fileData: {
						fileUri: uploaded.fileUri,
						mimeType: uploaded.mimeType,
					},
				});
			} else {
				userParts.push({
					inlineData: {
						mimeType: attachment.mimeType,
						data: attachment.base64,
					},
				});
			}
		}

		// Add current user message with all parts (only if there are parts)
		if (userParts.length > 0) {
			contents.push({
				role: 'user',
				parts: userParts,
			});
		}

		return contents;
	}

	private async uploadAttachmentIfEnabled(attachment: {
		base64: string;
		mimeType: string;
	}): Promise<{ fileUri: string; mimeType: string } | null> {
		if (this.plugin && !this.plugin.settings.filesApiEnabled) {
			return null;
		}

		const key = this.getBase64Key(attachment.base64);
		const now = Date.now();
		const cached = GeminiClient.uploadedFiles.get(key);
		if (cached && cached.expiresAt > now) {
			return cached;
		}

		try {
			this.plugin?.logger.log(
				`[GeminiClient] Uploading attachment to Files API (${attachment.mimeType}, size=${attachment.base64.length} chars)...`
			);
			const blob = this.base64ToBlob(attachment.base64, attachment.mimeType);
			const file = await this.ai.files.upload({
				file: blob,
				config: {
					mimeType: attachment.mimeType,
				},
			});

			if (file && file.uri) {
				this.plugin?.logger.log(`[GeminiClient] Uploaded attachment successfully. URI: ${file.uri}`);
				const cachedInfo = {
					fileUri: file.uri,
					mimeType: attachment.mimeType,
					expiresAt: now + 24 * 60 * 60 * 1000, // cache local for 24 hours
				};
				GeminiClient.uploadedFiles.set(key, cachedInfo);
				return cachedInfo;
			}
		} catch (e) {
			this.plugin?.logger.warn('[GeminiClient] Files API upload failed. Falling back to inline base64:', e);
		}

		return null;
	}

	private getBase64Key(base64: string): string {
		if (base64.length <= 200) return base64;
		return `${base64.length}-${base64.substring(0, 100)}-${base64.substring(base64.length - 100)}`;
	}

	private base64ToBlob(base64: string, mimeType: string): Blob {
		let binaryString: string;
		if (typeof atob === 'function') {
			binaryString = atob(base64);
		} else {
			binaryString = Buffer.from(base64, 'base64').toString('binary');
		}
		const byteNumbers = new Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			byteNumbers[i] = binaryString.charCodeAt(i);
		}
		const byteArray = new Uint8Array(byteNumbers);
		return new Blob([byteArray], { type: mimeType });
	}

	private checkHistoryPrefixMatch(current: Content[], cached: Content[]): boolean {
		if (current.length < cached.length) return false;
		for (let i = 0; i < cached.length; i++) {
			const curTurn = current[i];
			const cachedTurn = cached[i];
			if (curTurn.role !== cachedTurn.role) return false;
			if (JSON.stringify(curTurn.parts) !== JSON.stringify(cachedTurn.parts)) return false;
		}
		return true;
	}

	/**
	 * Extract ModelResponse from GenerateContentResponse
	 */
	private extractModelResponse(response: GenerateContentResponse): ModelResponse {
		let markdown = '';
		let rendered = '';
		let thoughts = '';
		let toolCalls: ToolCall[] | undefined;

		// Extract text and thoughts from candidates
		if (response.candidates?.[0]?.content?.parts) {
			for (const part of response.candidates[0].content.parts) {
				if ('text' in part && part.text) {
					// Separate thought content from regular content
					if ((part as PartWithThought).thought) {
						thoughts += part.text;
					} else {
						markdown += part.text;
					}
				}
			}
		}

		// Decode HTML entities that Gemini sometimes returns
		markdown = decodeHtmlEntities(markdown);

		// Extract tool calls
		toolCalls = this.extractToolCallsFromResponse(response);

		// Extract search grounding
		rendered = this.extractRenderedFromResponse(response);

		return {
			markdown,
			rendered,
			...(thoughts && { thoughts }),
			...(toolCalls && { toolCalls }),
			...(response.usageMetadata && {
				usageMetadata: {
					promptTokenCount: response.usageMetadata.promptTokenCount,
					candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
					totalTokenCount: response.usageMetadata.totalTokenCount,
					cachedContentTokenCount: response.usageMetadata.cachedContentTokenCount,
				},
			}),
		};
	}

	/**
	 * Extract text from streaming chunk
	 */
	private extractTextFromChunk(chunk: GenerateContentResponse): string {
		if (chunk.candidates?.[0]?.content?.parts) {
			const text = chunk.candidates[0].content.parts
				.filter((part: Part) => 'text' in part && part.text && !(part as PartWithThought).thought)
				.map((part: Part) => (part as PartWithThought).text)
				.join('');
			return decodeHtmlEntities(text);
		}
		return '';
	}

	/**
	 * Extract thought/reasoning content from streaming chunk
	 */
	private extractThoughtFromChunk(chunk: GenerateContentResponse): string {
		if (chunk.candidates?.[0]?.content?.parts) {
			const parts = chunk.candidates[0].content.parts;
			const thoughtParts = parts.filter(
				(part: Part) => (part as PartWithThought).thought && (part as PartWithThought).text
			);

			if (thoughtParts.length > 0) {
				const thoughtText = thoughtParts.map((part: Part) => (part as PartWithThought).text).join('');
				const preview = thoughtText.length > 100 ? thoughtText.substring(0, 100) + '...' : thoughtText;
				this.plugin?.logger.debug(`[GeminiClient] Extracted thought: ${preview}`);
				return thoughtText;
			}
		}
		return '';
	}

	/**
	 * Check if a model supports thinking/reasoning mode
	 */
	private supportsThinking(model: string | undefined): boolean {
		if (!model) {
			this.plugin?.logger.debug('[GeminiClient] No model specified for thinking check');
			return false;
		}

		const modelLower = model.toLowerCase();
		const isSupported =
			modelLower.includes('gemini-2.5') || modelLower.includes('gemini-3') || modelLower.includes('thinking-exp');

		if (isSupported) {
			this.plugin?.logger.debug(`[GeminiClient] Enabling thinking mode for model: ${model}`);
		}

		return isSupported;
	}

	/**
	 * Extract tool calls from response
	 */
	private extractToolCallsFromResponse(response: GenerateContentResponse): ToolCall[] | undefined {
		const parts = response.candidates?.[0]?.content?.parts;
		if (!parts) return undefined;

		const toolCalls: ToolCall[] = [];
		for (const part of parts) {
			if ('functionCall' in part && part.functionCall && part.functionCall.name) {
				const signature = (part as PartWithThought).thoughtSignature;

				// Debug logging to verify extraction
				this.plugin?.logger.debug(
					`[GeminiClient] Extracted tool call: ${part.functionCall.name}, ` +
						`has signature: ${signature !== undefined}`
				);

				toolCalls.push({
					name: part.functionCall.name,
					arguments: part.functionCall.args || {},
					id: part.functionCall.id,
					thoughtSignature: signature,
				});
			}
		}

		return toolCalls.length > 0 ? toolCalls : undefined;
	}

	/**
	 * Extract tool calls from streaming chunk
	 */
	private extractToolCallsFromChunk(chunk: GenerateContentResponse): ToolCall[] | undefined {
		return this.extractToolCallsFromResponse(chunk);
	}

	/**
	 * Extract rendered HTML from response (search grounding)
	 */
	private extractRenderedFromResponse(response: GenerateContentResponse): string {
		// Search grounding metadata is in groundingMetadata
		const metadata = response.candidates?.[0]?.groundingMetadata;
		if (!metadata) return '';

		// Extract and format grounding sources
		const chunks = metadata.groundingChunks || [];

		if (chunks.length === 0) return '';

		// Build HTML similar to how Gemini API returns it
		let html = '<div class="search-grounding">';
		html += '<h4>Sources:</h4>';
		html += '<ul>';

		for (const chunk of chunks) {
			if (chunk.web) {
				html += `<li><a href="${chunk.web.uri}" target="_blank">${chunk.web.title || chunk.web.uri}</a></li>`;
			}
		}

		html += '</ul>';
		html += '</div>';

		return html;
	}

	/**
	 * Extract rendered content from streaming chunk
	 */
	private extractRenderedFromChunk(chunk: GenerateContentResponse): string {
		return this.extractRenderedFromResponse(chunk);
	}

	/**
	 * Generate an image from a text prompt
	 * @param prompt - Text description of the image to generate
	 * @param model - Image generation model (defaults to gemini-2.5-flash-image-preview)
	 * @returns Base64 encoded image data
	 */
	async generateImage(prompt: string, model: string): Promise<string> {
		try {
			const params: GenerateContentParameters = {
				model,
				contents: prompt,
				config: {
					// Image generation typically doesn't need temperature/topP
					// but we can include them if needed
				},
			};

			const response = await this.ai.models.generateContent(params);

			// Extract base64 image data from response
			// The response may contain multiple parts: text + inlineData
			// We need to find the part with inlineData
			const parts = response.candidates?.[0]?.content?.parts;
			if (!parts || parts.length === 0) {
				throw new Error('No content parts in response');
			}

			// Find the part with image data
			for (const part of parts) {
				if ('inlineData' in part && part.inlineData?.data) {
					return part.inlineData.data;
				}
			}

			// If we get here, no image data was found
			throw new Error('No image data in response. The model may have returned only text.');
		} catch (error) {
			this.plugin?.logger.error('[GeminiClient] Error generating image:', error);
			throw error;
		}
	}
}

function estimateTokensFromContents(contents: Content[]): number {
	const json = JSON.stringify(contents ?? []);
	return Math.ceil(json.length / 4);
}
