type LogLevel = "info" | "warn" | "error";

type LogPayload = {
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
};

function serializeError(error: unknown) {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return { value: String(error) };
}

function write(level: LogLevel, payload: LogPayload) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message: payload.message,
    context: payload.context ?? {},
    error: serializeError(payload.error)
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    write("info", { message, context });
  },
  warn(message: string, context?: Record<string, unknown>) {
    write("warn", { message, context });
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    write("error", { message, error, context });
  }
};
