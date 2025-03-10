import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { stats } from './stats';
import { type Config } from './types';

// Parse base name and version from file name
export const parseFileName = (fileName: string): { baseName: string; version: number | null } => {
	const match = fileName.match(/^(.+?)(?:\((\d+)\))?\.excalidraw$/);
	if (!match) {
		return { baseName: fileName.replace(/\.excalidraw$/, ''), version: null };
	}
	return {
		baseName: match[1],
		version: match[2] ? parseInt(match[2], 10) : null,
	};
};

// Get all files with the same base name
export const getFileVariants = (folder: string, baseName: string): string[] => {
	return fs
		.readdirSync(folder)
		.filter((file) => {
			const { baseName: currentBaseName } = parseFileName(file);
			return file.endsWith('.excalidraw') && currentBaseName === baseName;
		})
		.map((file) => path.join(folder, file));
};

// Get the most recent file from a list
export const getMostRecentFile = (files: string[]): string | null => {
	if (files.length === 0) return null;

	return files.reduce((latest, current) => {
		try {
			const latestMtime = fs.statSync(latest).mtimeMs;
			const currentMtime = fs.statSync(current).mtimeMs;
			return currentMtime > latestMtime ? current : latest;
		} catch (error) {
			// File may have been deleted between listing and stat
			logger.warn(`Failed to stat file ${current}: ${error}`);
			return latest;
		}
	});
};

// Create backup file path
export const createBackupFilePath = (backupsFolder: string, baseName: string, timestamp: number): string => {
	const backupDir = path.join(backupsFolder, baseName);
	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	let backupPath = path.join(backupDir, `${baseName}-${timestamp}.excalidraw`);

	// Handle same timestamp edge case
	if (fs.existsSync(backupPath)) {
		const randomSuffix = Math.floor(Math.random() * 1000000000000)
			.toString()
			.padStart(12, '0');
		backupPath = path.join(backupDir, `${baseName}-${timestamp}-${randomSuffix}.excalidraw`);
	}

	return backupPath;
};

// Process all files with the same base name
export const processFileGroup = async (config: Config, baseName: string): Promise<void> => {
	try {
		const variantFiles = getFileVariants(config.downloadsFolder, baseName);
		if (variantFiles.length === 0) return;

		// Verify files still exist and are accessible before processing
		const existingFiles = await Promise.all(
			variantFiles.map(async (file) => {
				try {
					await fs.promises.access(file, fs.constants.R_OK | fs.constants.W_OK);
					return file;
				} catch {
					logger.warn(`File ${file} is no longer accessible, skipping`);
					return null;
				}
			})
		);

		const validFiles = existingFiles.filter((f): f is string => f !== null);
		if (validFiles.length === 0) return;

		const mostRecentFile = getMostRecentFile(validFiles);
		if (!mostRecentFile) return;

		// Ensure file still exists before proceeding
		try {
			await fs.promises.access(mostRecentFile, fs.constants.F_OK);
		} catch {
			logger.warn(`File ${mostRecentFile} no longer exists, skipping processing`);
			return;
		}

		// Check if the file already exists in the sync folder
		const syncFilePath = path.join(config.syncFolder, `${baseName}.excalidraw`);
		if (fs.existsSync(syncFilePath)) {
			// Backup the existing file in sync folder
			const syncFileStats = fs.statSync(syncFilePath);
			const backupPath = createBackupFilePath(config.backupsFolder, baseName, Math.floor(syncFileStats.mtimeMs));

			await fs.promises.copyFile(syncFilePath, backupPath);
			logger.info(`Backed up existing file to: ${backupPath}`);
			stats.incrementBackupsCreated();
		}

		// Move the most recent file to the sync folder
		await fs.promises.copyFile(mostRecentFile, syncFilePath);
		await fs.promises.unlink(mostRecentFile);
		logger.info(`Moved most recent file to sync folder: ${syncFilePath}`);
		stats.incrementFilesProcessed();

		// Backup and remove all other variant files
		const backupOperations = validFiles
			.filter((variantFile) => variantFile !== mostRecentFile)
			.map(async (variantFile) => {
				let fileStats;
				try {
					fileStats = fs.statSync(variantFile);
				} catch (err) {
					logger.warn(`Could not stat file ${variantFile}: ${err}`);
					return;
				}
				const backupPath = createBackupFilePath(config.backupsFolder, baseName, Math.floor(fileStats.mtimeMs));

				await fs.promises.copyFile(variantFile, backupPath);
				await fs.promises.unlink(variantFile);
				logger.info(`Backed up variant file to: ${backupPath}`);
				stats.incrementBackupsCreated();
			});

		await Promise.all(backupOperations);
	} catch (error) {
		logger.error(`Error processing file group ${baseName}: ${error}`);
		stats.incrementErrors();
		throw error;
	}
};
