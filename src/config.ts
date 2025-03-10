import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseArgs } from 'util';
import { logger } from './logger';
import { type CLIArgs, type Config } from './types';

// Parse command line arguments
export const parseCliArgs = (): Partial<CLIArgs> => {
	const { values } = parseArgs({
		options: {
			downloadsFolder: {
				type: 'string',
				short: 'd',
			},
			syncFolder: {
				type: 'string',
				short: 's',
			},
			backupsFolder: {
				type: 'string',
				short: 'b',
			},
			configPath: {
				type: 'string',
				short: 'c',
			},
		},
	});

	return {
		downloadsFolder: values.downloadsFolder as string | undefined,
		syncFolder: values.syncFolder as string | undefined,
		backupsFolder: values.backupsFolder as string | undefined,
		configPath: values.configPath as string | undefined,
	};
};

// Load configuration from file
export const loadConfigFromFile = (configPath: string): Partial<Config> => {
	try {
		if (!fs.existsSync(configPath)) {
			return {};
		}
		const configContent = fs.readFileSync(configPath, 'utf-8');
		return JSON.parse(configContent);
	} catch (error) {
		logger.error(`Error loading config file: ${error}`);
		return {};
	}
};

// Merge configurations with precedence: CLI > Config File > Default
export const mergeConfig = (cliConfig: Partial<Config>, fileConfig: Partial<Config>): Config => {
	// Use os.homedir() for best reliability instead of "~"
	const homeDir = import.meta.env.HOME || process.env.HOME || os.homedir() || '~';

	if (!homeDir) {
		logger.error("Couldn't determine home directory.");
	}

	const defaultConfig: Config = {
		downloadsFolder: path.join(homeDir, 'Downloads'),
		syncFolder: path.join(homeDir, 'ExcalidrawSync'),
		backupsFolder: path.join(homeDir, 'ExcalidrawSync', 'backups'),
	};

	// Ensure paths are absolute
	const downloadsFolder = path.resolve(
		cliConfig.downloadsFolder || fileConfig.downloadsFolder || defaultConfig.downloadsFolder
	);
	const syncFolder = path.resolve(cliConfig.syncFolder || fileConfig.syncFolder || defaultConfig.syncFolder);
	const backupsFolder = path.resolve(
		cliConfig.backupsFolder || fileConfig.backupsFolder || defaultConfig.backupsFolder
	);

	logger.info(`Using Folder Configuration:`);
	logger.info(`Watching Folder: ${downloadsFolder}`);
	logger.info(`Sync Folder: ${syncFolder}`);
	logger.info(`Backups Folder: ${backupsFolder}`);

	return {
		downloadsFolder,
		syncFolder,
		backupsFolder,
	};
};

// Validate folder paths and create if necessary
export const validateFolders = (config: Config): void => {
	const { randomUUID } = require('crypto');
	const folders = [config.downloadsFolder, config.syncFolder, config.backupsFolder];

	for (const folder of folders) {
		if (!fs.existsSync(folder)) {
			try {
				fs.mkdirSync(folder, { recursive: true });
				logger.info(`Created folder: ${folder}`);
			} catch (error) {
				throw new Error(`Failed to create folder ${folder}: ${error}`);
			}
		}

		try {
			// Test write permissions by creating and removing a test file
			const testFilePath = path.join(folder, `.test-${randomUUID()}`);
			fs.writeFileSync(testFilePath, '');
			fs.unlinkSync(testFilePath);
		} catch (error) {
			throw new Error(`No write permission for folder ${folder}: ${error}`);
		}
	}
};

// Load and validate configuration
export const loadConfig = (): Config => {
	const cliArgs = parseCliArgs();

	// If all directory paths are provided via CLI, skip loading config file
	if (cliArgs.downloadsFolder && cliArgs.syncFolder && cliArgs.backupsFolder) {
		const config = mergeConfig(cliArgs, {});
		validateFolders(config);
		return config;
	}

	// Otherwise load config file if needed
	const configPath = cliArgs.configPath || '/etc/excalidraw-file-sync/config.json';
	const fileConfig = fs.existsSync(configPath) ? loadConfigFromFile(configPath) : {};
	const config = mergeConfig(cliArgs, fileConfig);

	validateFolders(config);
	return config;
};
