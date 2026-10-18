type Fields = Record<string, unknown>;
type Level = "info" | "warn" | "error";

// One JSON object per line, so logs can be searched and parsed by log tooling.
function write(level: Level, message: string, fields: Fields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "info") {
    console.log(line);
  } else {
    console.error(line);
  }
}

export const logger = {
  info: (message: string, fields: Fields = {}) => write("info", message, fields),
  warn: (message: string, fields: Fields = {}) => write("warn", message, fields),
  error: (message: string, fields: Fields = {}) => write("error", message, fields),
};
