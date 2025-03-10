import fs from 'fs';
import { logger } from './logger';

const LOCK_FILE = '/tmp/excalidraw-file-sync.lock';

export const acquireLock = (): boolean => {
	try {
		// Try to create lockfile
		fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: 'wx' });
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
			try {
				const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf-8'));
				try {
					// Check if process is still running
					process.kill(pid, 0);
					logger.error(`Another instance is already running (PID: ${pid})`);
					return false;
				} catch {
					// Process not running, remove stale lock
					fs.unlinkSync(LOCK_FILE);
					// Try again
					return acquireLock();
				}
			} catch {
				logger.error('Failed to read or clear stale lock file');
				return false;
			}
		}
		logger.error(`Failed to create lock file: ${error}`);
		return false;
	}
};

export const releaseLock = (): void => {
	try {
		fs.unlinkSync(LOCK_FILE);
	} catch (error) {
		logger.warn(`Failed to remove lock file: ${error}`);
	}
};
