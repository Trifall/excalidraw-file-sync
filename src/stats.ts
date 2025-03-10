import { logger } from './logger';

class StatsTracker {
	filesProcessed = 0;
	backupsCreated = 0;
	errors = 0;

	incrementFilesProcessed() {
		this.filesProcessed++;
	}

	incrementBackupsCreated() {
		this.backupsCreated++;
	}

	incrementErrors() {
		this.errors++;
	}

	logStats() {
		logger.info(
			`Stats: ${this.filesProcessed} files processed, ${this.backupsCreated} backups created, ${this.errors} errors`
		);
	}

	startPeriodicLogging(intervalMs = 3600000) {
		// Log stats every hour by default
		setInterval(() => this.logStats(), intervalMs);
	}
}

export const stats = new StatsTracker();
