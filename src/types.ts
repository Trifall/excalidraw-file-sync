export type Config = {
	downloadsFolder: string;
	syncFolder: string;
	backupsFolder: string;
};

export type CLIArgs = {
	configPath: string;
} & Config;
