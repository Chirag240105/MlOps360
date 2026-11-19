import {config, type LogLevel} from './config.ts';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

export interface LogMetadata {
  requestId?: string;
  component?: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  private readonly minPriority: number;

  constructor(
    private readonly serviceName: string = config.appName,
    level: LogLevel = config.logLevel,
  ) {
    this.minPriority = LEVEL_PRIORITY[level];
  }

  private emit(level: LogLevel, message: string, meta?: LogMetadata): void {
    if (LEVEL_PRIORITY[level] < this.minPriority) {
      return;
    }

    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...meta,
    };

    const serialized = JSON.stringify(record);
    if (level === 'ERROR') {
      console.error(serialized);
    } else if (level === 'WARN') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  debug(message: string, meta?: LogMetadata): void {
    this.emit('DEBUG', message, meta);
  }

  info(message: string, meta?: LogMetadata): void {
    this.emit('INFO', message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.emit('WARN', message, meta);
  }

  error(message: string, meta?: LogMetadata): void {
    this.emit('ERROR', message, meta);
  }
}

export const logger = new StructuredLogger();
