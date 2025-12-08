import os from "os";

export const QUARANTINE_FOLDER = "_FileZen_Quarantine";
export const SETTINGS_FILENAME = "filezen-settings.json";
export const DB_FILENAME = "filezen-db.json";

// Defaults
export const DEFAULT_MAX_FILE_MB = 100;
export const DEFAULT_STALE_YEARS = 2;
export const DEFAULT_INCLUDE_PATHS = [os.homedir()];
export const DEFAULT_EXCLUDE_PATHS = [
    "node_modules", ".git", ".vscode", "AppData", "Library", "/System", "C:\\Windows"
];

// System Limits & Tuning
export const WORKER_POOL_SIZE = Math.max(1, os.cpus().length - 1);
export const MAX_IN_MEMORY_QUEUE = 5_000;
export const MAX_MEMORY_MB = 500;
export const SCHEMA_VERSION = 1;
