#!/usr/bin/env bash
set -e

# Configuration
APP_NAME="excalidraw-file-sync"
INSTALL_DIR="/opt/${APP_NAME}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
CONFIG_FILE="/etc/${APP_NAME}/config.json"
CURRENT_USER=$(whoami)

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root (use sudo)"
  exit 1
fi

# Get the actual username if script is run with sudo
if [ -n "$SUDO_USER" ]; then
  ACTUAL_USER="$SUDO_USER"
else
  ACTUAL_USER="$CURRENT_USER"
fi

# Function to find bun executable
find_bun() {
  # Common locations for bun installation
  USER_HOME=$(eval echo ~${ACTUAL_USER})
  POSSIBLE_PATHS=(
    "${USER_HOME}/.bun/bin/bun"
    "${USER_HOME}/.local/share/bun/bin/bun"
    "${USER_HOME}/.local/bin/bun"
    "/usr/local/bin/bun"
    "/usr/bin/bun"
  )

  # Check if bun exists in any of these locations
  for path in "${POSSIBLE_PATHS[@]}"; do
    if [ -x "$path" ]; then
      echo "$path"
      return 0
    fi
  done

  # If not found in common locations, try to ask the user
  if [ -x "$(sudo -u "$ACTUAL_USER" which bun 2>/dev/null)" ]; then
    sudo -u "$ACTUAL_USER" which bun
    return 0
  fi

  # Ask the user directly
  echo "Could not automatically find bun executable."
  read -p "Please enter the full path to bun executable: " custom_path

  if [ -x "$custom_path" ]; then
    echo "$custom_path"
    return 0
  else
    echo "The provided path is not executable or does not exist."
    return 1
  fi
}

# Find bun path
BUN_PATH=$(find_bun)
if [ -z "$BUN_PATH" ]; then
  echo "Error: Could not find bun executable. Please install bun from https://bun.sh/"
  exit 1
fi

echo "Using bun at: $BUN_PATH"

echo "Installing ${APP_NAME}..."

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_CONFIG_FILE="${SCRIPT_DIR}/config.json"

# Check if installation directory already exists
if [ -d "$INSTALL_DIR" ]; then
  echo "Installation directory already exists at ${INSTALL_DIR}"
  read -p "Would you like to overwrite the existing installation? (y/n): " OVERWRITE
  if [[ $OVERWRITE =~ ^[Yy]$ ]]; then
    echo "Removing existing installation..."
    rm -rf "$INSTALL_DIR"
  else
    echo "Installation cancelled."
    exit 0
  fi
fi

# Build the application
echo "Building application..."
cd "$SCRIPT_DIR"
sudo -u "$ACTUAL_USER" "$BUN_PATH" run build

# Create installation directory
echo "Creating installation directory at ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"

# Copy files
echo "Copying application files..."
cp -r "$SCRIPT_DIR/dist" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"

# Configuration setup
echo "Setting up configuration..."

# Create config directory
mkdir -p "$(dirname "$CONFIG_FILE")"

# Function to validate path
validate_path() {
  if [ ! -d "$1" ]; then
    read -p "Directory $1 does not exist. Create it? (y/n): " CREATE
    if [[ $CREATE =~ ^[Yy]$ ]]; then
      mkdir -p "$1"
      chown "$ACTUAL_USER:$ACTUAL_USER" "$1"
    else
      echo "Installation cancelled: directory does not exist"
      exit 1
    fi
  fi
}

# Add this function after the existing validate_path function
validate_folder_conflicts() {
  local downloads="$1"
  local sync="$2"
  local backups="$3"

  # Resolve to absolute paths
  downloads=$(realpath -m "$downloads")
  sync=$(realpath -m "$sync")
  backups=$(realpath -m "$backups")

  if [ "$downloads" = "$sync" ]; then
    echo "Error: Downloads folder cannot be the same as sync folder"
    exit 1
  fi

  if [ "$downloads" = "$backups" ]; then
    echo "Error: Downloads folder cannot be the same as backups folder"
    exit 1
  fi

  if [[ "$sync" == "$downloads"* ]]; then
    echo "Error: Sync folder cannot be inside downloads folder"
    exit 1
  fi

  if [[ "$backups" == "$downloads"* ]]; then
    echo "Error: Backups folder cannot be inside downloads folder"
    exit 1
  fi
}

# Check if local config.json exists
if [ -f "$LOCAL_CONFIG_FILE" ]; then
  echo "Found config.json in the script directory. Using this configuration."
  cp "$LOCAL_CONFIG_FILE" "$CONFIG_FILE"

  # Load values from config file to validate paths
  DOWNLOADS_FOLDER=$(grep -o '"downloadsFolder"[^,}]*' "$CONFIG_FILE" | cut -d'"' -f4)
  SYNC_FOLDER=$(grep -o '"syncFolder"[^,}]*' "$CONFIG_FILE" | cut -d'"' -f4)
  BACKUPS_FOLDER=$(grep -o '"backupsFolder"[^,}]*' "$CONFIG_FILE" | cut -d'"' -f4)

  # Add this line to validate folder conflicts
  validate_folder_conflicts "$DOWNLOADS_FOLDER" "$SYNC_FOLDER" "$BACKUPS_FOLDER"

  # Validate paths from config file
  validate_path "$DOWNLOADS_FOLDER"
  validate_path "$SYNC_FOLDER"
  validate_path "$BACKUPS_FOLDER"
else
  echo "No config.json found in the script directory. Using manual path configuration."

  # Ask for configuration values with sensible defaults
  HOME_DIR=$(eval echo ~${ACTUAL_USER})
  read -p "Downloads folder path [${HOME_DIR}/Downloads]: " DOWNLOADS_FOLDER
  DOWNLOADS_FOLDER=${DOWNLOADS_FOLDER:-"${HOME_DIR}/Downloads"}

  read -p "Sync folder path [${HOME_DIR}/ExcalidrawSync]: " SYNC_FOLDER
  SYNC_FOLDER=${SYNC_FOLDER:-"${HOME_DIR}/ExcalidrawSync"}

  read -p "Backups folder path [${HOME_DIR}/ExcalidrawSync/backups]: " BACKUPS_FOLDER
  BACKUPS_FOLDER=${BACKUPS_FOLDER:-"${HOME_DIR}/ExcalidrawSync/backups"}

  # Add validation before creating folders
  validate_folder_conflicts "$DOWNLOADS_FOLDER" "$SYNC_FOLDER" "$BACKUPS_FOLDER"

  # Validate the provided paths
  validate_path "$DOWNLOADS_FOLDER"
  validate_path "$SYNC_FOLDER"
  validate_path "$BACKUPS_FOLDER"

  # Create config file
  cat >"$CONFIG_FILE" <<EOF
{
  "downloadsFolder": "${DOWNLOADS_FOLDER}",
  "syncFolder": "${SYNC_FOLDER}",
  "backupsFolder": "${BACKUPS_FOLDER}"
}
EOF
fi

# Set permissions for config file
chown "$ACTUAL_USER:$ACTUAL_USER" "$CONFIG_FILE"
chmod 644 "$CONFIG_FILE"

# Create the systemd service file with config path
echo "Creating systemd service..."
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Excalidraw File Watcher Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${BUN_PATH} ${INSTALL_DIR}/dist/main.js --configPath=${CONFIG_FILE}
Restart=on-failure
User=${ACTUAL_USER}
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Set proper ownership and permissions
echo "Setting permissions..."
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"
chmod 644 "$SERVICE_FILE"

# Stop the service if it's already running
if systemctl is-active --quiet "$APP_NAME.service"; then
  echo "Stopping existing service..."
  systemctl stop "$APP_NAME.service"
fi

# Reload systemd, enable and start the service
echo "Enabling and starting the service..."
systemctl daemon-reload
systemctl enable "$APP_NAME.service"
systemctl start "$APP_NAME.service"

echo "Installation complete. Service is running and will start automatically on boot."
echo "You can check the status with: systemctl status ${APP_NAME}.service"
echo "Configuration is stored at: ${CONFIG_FILE}"
