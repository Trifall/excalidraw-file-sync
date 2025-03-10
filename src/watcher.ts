import fs from 'fs';
import { watch } from 'node:fs/promises';
import { parseFileName, processFileGroup } from './fileProcessor';
import { logger } from './logger';
import { type Config } from './types';

// Watch function for file changes
export const watchFolder = async (config: Config): Promise<void> => {
	// Use a debounce mechanism to handle multiple rapid saves
	const pendingProcessing = new Set<string>();
	const processingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	// Function to process files after a debounce period
	const processAfterDelay = (baseName: string) => {
		if (processingTimeouts.has(baseName)) {
			const timeout = processingTimeouts.get(baseName);
			if (timeout) {
				clearTimeout(timeout);
			}
		}

		pendingProcessing.add(baseName);
		const timeout = setTimeout(async () => {
			try {
				await processFileGroup(config, baseName);
			} catch (error) {
				logger.error(`Error processing ${baseName}: ${error}`);
			}
			pendingProcessing.delete(baseName);
			processingTimeouts.delete(baseName);
		}, 1000); // 1 second debounce

		processingTimeouts.set(baseName, timeout);
	};

	const startWatcher = async () => {
		try {
			const watcher = watch(config.downloadsFolder, { recursive: false });

			for await (const event of watcher) {
				if (!event.filename || !event.filename.endsWith('.excalidraw')) continue;
				const { baseName } = parseFileName(event.filename);
				processAfterDelay(baseName);
			}
		} catch (error) {
			logger.error(`Watch error: ${error}`);
			// Try to restart watcher after a delay if directory is deleted and recreated
			setTimeout(startWatcher, 5000);
		}
	};

	try {
		// Initial scan to process any existing files
		const existingFiles = fs.readdirSync(config.downloadsFolder).filter((file) => file.endsWith('.excalidraw'));

		const processedBaseNames = new Set<string>();

		// Process files in parallel rather than sequentially
		const initialProcessing = existingFiles
			.map((file) => parseFileName(file).baseName)
			.filter((baseName) => !processedBaseNames.has(baseName))
			.map(async (baseName) => {
				processedBaseNames.add(baseName);
				await processFileGroup(config, baseName);
			});

		await Promise.all(initialProcessing);

		// Start watching for file changes
		await startWatcher();
	} catch (error) {
		logger.error(`Watch error: ${error}`);
		throw error;
	}
};
