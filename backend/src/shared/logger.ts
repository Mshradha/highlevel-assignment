type Fields = Record<string, unknown>;

// One JSON object per line, so logs can be searched and parsed by log tooling.
function write(level: "info" | "error", message: string, fields: Fields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, fields: Fields = {}) => write("info", message, fields),
  error: (message: string, fields: Fields = {}) => write("error", message, fields),
};
