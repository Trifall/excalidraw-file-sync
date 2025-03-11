# Excalidraw File Sync

An app (installable as a service) that monitors a directory for Excalidraw files, **moves** them to a designated folder, and manages backups automatically.

## Why?

Excalidraw saving is much simpler on chromium browsers due to the file-system API capabilities that they have, but unfortunately Firefox doesn't have those.

On chromium browsers, the browser simply overwrites the file, so all you really have to do is save the original file into the target folder, and every subsequent save will target and overwrite the original file.

Firefox (and its derivatives), however, create a new file with a version suffix instead of overwriting the save file of the previous one (i.e `save.excalidraw, save(1).excalidraw, save(2).excalidraw`). I also didn't want to switch the browser-download-folder save path because it can become quite confusing, and sometimes just forget what the set path was.;

I made this application so I don't have to worry about that annoyance, and can backup my Excalidraw drawings with backup versions from my self-hosted instance to my Syncthing shared folder by simply pressing CTRL+S.

![excalidraw-file-sync-diagram](https://github.com/user-attachments/assets/3c51c8d6-dd96-4630-9db1-16e70dbc1ac5)


## Features

- Watches a downloads folder for new `.excalidraw` files
- Automatically backs up existing files before overwriting
- Handles multiple file versions (e.g., `drawing.excalidraw`, `drawing(1).excalidraw`)
- Timestamps backups based on last modified time
- Handles edge cases like simultaneous saves and duplicate timestamps
- Configurable via command-line arguments or config file
- Tracks statistics on files processed, backups created, and errors
- Rudimentary checks so you don't set the directory folders to the same path. It is bypassable, but it will likely break the application :)

## Technologies Used / Tech Stack

- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- TypeScript - Language
- Oxlint - Linter
- Prettier - Code formatter
- Husky - Git hooks
- Systemd - Service management (Linux)

## Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- Linux with systemd (for service installation; build manually if wanting to integrate on Windows)

### Steps

1. Clone this repository or download the files, then install packages:

   ```bash
   git clone https://github.com/Trifall/excalidraw-file-sync.git
   cd excalidraw-file-sync
   bun i
   ```

2. For installing for development or a custom build, see
   [Development](#development). For production and systemd service installation,
   see [Production](#production).

### Development

1. (Optional) Configure the application before installation:

   You can prepare a configuration file by copying and editing the example:

   ```bash
   cp config.json.example config.json
   nano config.json
   ```

   The installer will detect and use this file automatically.

2. For running quickly in development:

   ```bash
   # Using config file:
   bun dev --configPath config.json

   # Or specifying paths directly:
   bun dev --downloadsFolder=/path/to/downloads --syncFolder=/path/to/sync --backupsFolder=/path/to/backups
   ```

### Production

> **Install via Script (systemd service)**

#### Pre-installation Configuration

For a more streamlined installation, you can:

1. Create a `config.json` file in the project root before running the installer:

   ```bash
   cp config.json.example config.json
   nano config.json
   ```

2. Edit the paths according to your needs:

   ```json
   {
    "downloadsFolder": "/path/to/downloads",
    "syncFolder": "/path/to/sync",
    "backupsFolder": "/path/to/backups"
   }
   ```

3. The installer will automatically detect and use this file, skipping the manual configuration prompts.

#### Run the Installation Script

1. Make the installation script executable:

   ```bash
   chmod +x install.sh
   ```

2. Run the installation script:

   ```bash
   sudo ./install.sh
   ```

   The script will:

   - Check if Bun is installed
   - Build the application
   - Install it to `/opt/excalidraw-file-sync/`
   - Look for a `config.json` in the current directory, or ask for configuration values
   - Validate and create directories if needed (with your permission)
   - Create a config file at `/etc/excalidraw-file-sync/config.json`
   - Set up and enable the systemd service

   If an existing installation is detected, you'll be asked if you want to overwrite it.

## Configuration

You can configure the file watcher in three ways (in order of precedence):

1. Command-line arguments (manually running, forced overrides):

   ```bash
   bun /opt/excalidraw-file-sync/dist/main.js --downloadsFolder=/path/to/downloads --syncFolder=/path/to/sync --backupsFolder=/path/to/backups
   ```

   Or using a config file path:

   ```bash
   bun /opt/excalidraw-file-sync/dist/main.js --configPath=/path/to/config.json
   ```

2. System configuration file (recommended, created during installation):

   ```bash
   # Edit the system configuration
   sudo nano /etc/excalidraw-file-sync/config.json

   # After editing, restart the service
   sudo systemctl restart excalidraw-file-sync.service
   ```

   The config file format:

   ```json
   {
    "downloadsFolder": "/path/to/downloads",
    "syncFolder": "/path/to/sync",
    "backupsFolder": "/path/to/backups"
   }
   ```

3. Default locations (if no configuration is provided):
   - Downloads folder: `~/Downloads`
   - Sync folder: `~/ExcalidrawSync`
   - Backups folder: `~/ExcalidrawSync/backups`

## Usage

Once installed and running, the service will automatically:

1. Monitor your downloads folder for `.excalidraw` files
2. When a new file is detected, it will:
   - Back up any existing file with the same name in the sync folder
   - Move the newest version to the sync folder
   - Back up any intermediate versions
3. Track statistics about operations performed

## Statistics

The service tracks the following statistics:

- Total files processed
- Number of backups created
- Errors encountered

These statistics are logged:

- Hourly (by default)
- When the service is shut down
- Can be viewed in the system service logs

## Backup Format

Backups are stored in the format:

```plaintext
<backups_folder>/<filename_without_extension>/<filename_without_extension>-<timestamp>.excalidraw
```

If a file with the same timestamp already exists, it will use:

```plaintext
<backups_folder>/<filename_without_extension>/<filename_without_extension>-<timestamp>-<random_12_digit_number>.excalidraw
```

## Troubleshooting

Check the service status:

```bash
sudo systemctl status excalidraw-file-sync
```

View logs (includes statistics):

```bash
journalctl -u excalidraw-file-sync
```

Check permissions:

```bash
# Ensure the service user has appropriate permissions to all folders
ls -la /path/to/downloads
ls -la /path/to/sync
ls -la /path/to/backups
```

## Uninstallation

To uninstall the service:

```bash
# Stop and disable the service
sudo systemctl stop excalidraw-file-sync
sudo systemctl disable excalidraw-file-sync

# Remove the service file
sudo rm /etc/systemd/system/excalidraw-file-sync.service
sudo systemctl daemon-reload

# Remove the app and config files
sudo rm -rf /opt/excalidraw-file-sync
sudo rm -rf /etc/excalidraw-file-sync
```

## License

MIT
