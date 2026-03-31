import config from '../config/config.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const logLevelMap: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

const currentLogLevel = logLevelMap[config.logLevel.toLowerCase()] || LogLevel.INFO;

function jsonForLog(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
    return v;
  });
}

function formatMessage(level: string, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${jsonForLog(data)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}`;
}

export const logger = {
  debug: (message: string, data?: any) => {
    if (currentLogLevel <= LogLevel.DEBUG) {
      console.debug(formatMessage('DEBUG', message, data));
    }
  },
  
  info: (message: string, data?: any) => {
    if (currentLogLevel <= LogLevel.INFO) {
      console.info(formatMessage('INFO', message, data));
    }
  },
  
  warn: (message: string, data?: any) => {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(formatMessage('WARN', message, data));
    }
  },
  
  error: (message: string, error?: any) => {
    if (currentLogLevel <= LogLevel.ERROR) {
      const errorData = error instanceof Error 
        ? { message: error.message, stack: error.stack }
        : error;
      console.error(formatMessage('ERROR', message, errorData));
    }
  },
};

export default logger;

