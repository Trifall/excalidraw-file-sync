#!/usr/bin/env bun

import { loadConfig } from './config';
import { acquireLock, releaseLock } from './lock';
import { logger } from './logger';
import { stats } from './stats';
import { watchFolder } from './watcher';

// Main function
const main = async (): Promise<void> => {
	try {
		if (!acquireLock()) {
			process.exit(1);
		}

		// Start periodic stats logging
		stats.startPeriodicLogging();

		// Load configuration
		const config = loadConfig();

		logger.info('Configuration validated successfully. Starting watcher...');

		// Start watching for file changes
		await watchFolder(config);
	} catch (error) {
		logger.error(`Fatal error: ${error}`);
		releaseLock();
		process.exit(1);
	}
};

// Signal handlers for graceful shutdown
process.on('SIGINT', () => {
	logger.info('Received SIGINT, shutting down gracefully...');
	// Log final stats before exiting
	stats.logStats();
	releaseLock();
	process.exit(0);
});

process.on('SIGTERM', () => {
	logger.info('Received SIGTERM, shutting down gracefully...');
	// Log final stats before exiting
	stats.logStats();
	releaseLock();
	process.exit(0);
});

// Run the main function
main();
