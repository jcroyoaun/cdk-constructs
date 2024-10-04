enum LogLevel {
  INFO,
  SUCCESS,
  WARN,
  ERROR,
  DEBUG
}

enum Color {
  Reset = "\x1b[0m",
  Blue = "\x1b[34m",
  Green = "\x1b[32m",
  Yellow = "\x1b[33m",
  Red = "\x1b[31m",
  Cyan = "\x1b[36m",
  Magenta = "\x1b[35m"
}

export class Logger {
  private static instance: Logger;
  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private logWithColor(level: LogLevel, message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    let colorCode: Color;
    let levelStr: string;

    switch (level) {
      case LogLevel.INFO:
        colorCode = Color.Blue;
        levelStr = 'INFO';
        break;
      case LogLevel.SUCCESS:
        colorCode = Color.Green;
        levelStr = 'SUCCESS';
        break;
      case LogLevel.WARN:
        colorCode = Color.Yellow;
        levelStr = 'WARN';
        break;
      case LogLevel.ERROR:
        colorCode = Color.Red;
        levelStr = 'ERROR';
        break;
      case LogLevel.DEBUG:
        colorCode = Color.Magenta;
        levelStr = 'DEBUG';
        break;
    }

    const contextStr = context ? `[${context}] ` : '';
    console.log(`${colorCode}[${levelStr}] ${timestamp} ${contextStr}${message}${Color.Reset}`);
  }

  info(message: string, context?: string): void {
    this.logWithColor(LogLevel.INFO, message, context);
  }

  success(message: string, context?: string): void {
    this.logWithColor(LogLevel.SUCCESS, message, context);
  }

  warn(message: string, context?: string): void {
    this.logWithColor(LogLevel.WARN, message, context);
  }

  error(message: string, context?: string): void {
    this.logWithColor(LogLevel.ERROR, message, context);
  }

  debug(message: string, context?: string): void {
    this.logWithColor(LogLevel.DEBUG, message, context);
  }

  logObject(obj: any, context?: string): void {
    this.info('Object contents:', context);
    console.log(JSON.stringify(obj, null, 2));
  }
}

export const logger = Logger.getInstance();