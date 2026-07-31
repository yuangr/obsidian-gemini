import { requestUrl } from 'obsidian';
import { Logger } from './logger';
import { logDebugInfo } from '../api/utils/debug';

export interface FetchedInlineData {
	base64: string;
	mimeType: string;
}

/**
 * Extracts external image URLs from markdown text and fetches them.
 * Converts the fetched images into base64 InlineData objects.
 *
 * @param markdownText The markdown content to scan
 * @param logger Logger instance
 * @returns Array of fetched images ready for the model
 */
export async function extractAndFetchExternalImages(
	markdownText: string,
	logger: Logger
): Promise<FetchedInlineData[]> {
	if (!markdownText) return [];

	// Match markdown image syntax: ![alt](url)
	const regex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
	const matches = [...markdownText.matchAll(regex)];

	if (matches.length === 0) return [];

	// Deduplicate URLs to avoid fetching the same image multiple times
	const uniqueUrls = [...new Set(matches.map((match) => match[1]))];
	const results: FetchedInlineData[] = [];

	for (const url of uniqueUrls) {
		try {
			logDebugInfo(logger, 'Image Fetcher', `Fetching external image: ${url}`);

			const response = await requestUrl({
				url,
				method: 'GET',
				throw: false,
			});

			if (response.status >= 200 && response.status < 300) {
				// Convert ArrayBuffer to base64
				const buffer = response.arrayBuffer;
				const base64 = arrayBufferToBase64(buffer);

				// Determine MIME type
				const contentType = response.headers['content-type'] || response.headers['Content-Type'];
				let mimeType = typeof contentType === 'string' ? contentType : undefined;

				// Fallback to extension if content-type is missing or generic
				if (!mimeType || mimeType === 'application/octet-stream') {
					mimeType = guessMimeTypeFromUrl(url);
				}

				// Only add if it's actually an image
				if (mimeType.startsWith('image/')) {
					results.push({ base64, mimeType });
					logDebugInfo(logger, 'Image Fetcher', `Successfully fetched and converted ${url} (${mimeType})`);
				} else {
					logger.warn(`Fetched URL ${url} is not an image (mime type: ${mimeType})`);
				}
			} else {
				logger.warn(`Failed to fetch image ${url}. Status: ${response.status}`);
			}
		} catch (error) {
			logger.warn(`Error fetching external image ${url}: ${String(error)}`);
		}
	}

	return results;
}

/**
 * Fallback MIME type guesser based on URL extension
 */
function guessMimeTypeFromUrl(url: string): string {
	const lowerUrl = url.toLowerCase();
	if (lowerUrl.endsWith('.png') || lowerUrl.includes('.png?')) return 'image/png';
	if (
		lowerUrl.endsWith('.jpg') ||
		lowerUrl.endsWith('.jpeg') ||
		lowerUrl.includes('.jpg?') ||
		lowerUrl.includes('.jpeg?')
	)
		return 'image/jpeg';
	if (lowerUrl.endsWith('.gif') || lowerUrl.includes('.gif?')) return 'image/gif';
	if (lowerUrl.endsWith('.webp') || lowerUrl.includes('.webp?')) return 'image/webp';
	if (lowerUrl.endsWith('.svg') || lowerUrl.includes('.svg?')) return 'image/svg+xml';
	if (lowerUrl.endsWith('.bmp') || lowerUrl.includes('.bmp?')) return 'image/bmp';

	return 'application/octet-stream'; // Default
}

/**
 * Helper to convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	// Note: btoa is available in standard browser / Electron environments
	return btoa(binary);
}
