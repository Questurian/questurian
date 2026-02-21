/**
 * Simple Logger Utility
 *
 * Provides structured logging for development and production
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogData {
  message: string
  level: LogLevel
  timestamp: string
  [key: string]: unknown
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'

  private formatLog(level: LogLevel, message: string, data?: Record<string, unknown>): LogData {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    }
  }

  private output(logData: LogData) {
    if (this.isDevelopment) {
      // Pretty print for development
      const emoji = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        debug: '🔍',
      }[logData.level]

      console.log(`${emoji} [${logData.level.toUpperCase()}] ${logData.message}`)
      if (Object.keys(logData).length > 3) {
        const { level: _level, message: _message, timestamp: _timestamp, ...extraData } = logData
        console.log('  ', extraData)
      }
    } else {
      // JSON for production (easier for log aggregators)
      console.log(JSON.stringify(logData))
    }
  }

  info(message: string, data?: Record<string, unknown>) {
    this.output(this.formatLog('info', message, data))
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.output(this.formatLog('warn', message, data))
  }

  error(message: string, data?: Record<string, unknown>) {
    this.output(this.formatLog('error', message, data))
  }

  debug(message: string, data?: Record<string, unknown>) {
    if (this.isDevelopment) {
      this.output(this.formatLog('debug', message, data))
    }
  }

  // HTTP request logging
  request(method: string, path: string, statusCode: number, duration: number, userId?: string) {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

    this.output(
      this.formatLog(level, `${method} ${path} ${statusCode}`, {
        method,
        path,
        statusCode,
        duration: `${duration}ms`,
        userId,
      })
    )
  }
}

export const logger = new Logger()
