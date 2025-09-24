// logger.js
import winston from 'winston';
import util from 'util';

// ===== Levels & Colors =====
const levels = { error:0, warn:1, info:2, http:3, verbose:4, debug:5, silly:6 };
const level = () => (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const colors = { error:'red', warn:'yellow', info:'green', http:'magenta', debug:'white' };
winston.addColors(colors);

// ===== Helpers =====
function redact(str = '') {
  // Ẩn API keys, tokens cơ bản
  return String(str)
    .replace(/(api[-_ ]?key|x-goog-api-key|authorization)\s*[:=]\s*[^,\s]+/gi, '$1=***')
    .replace(/[A-Za-z0-9_\-]{20,}/g, (m) => (m.length > 32 ? m.slice(0,6)+'***'+m.slice(-4) : m));
}

// stringify an toàn, không chết vì vòng tham chiếu
function safeStringify(obj, depth = 4) {
  try {
    // Ưu tiên util.inspect để tránh circular
    return util.inspect(obj, { depth, colors: false, maxArrayLength: 50, breakLength: 120 });
  } catch {
    // Fallback JSON với replacer chống circular
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    }, 2);
  }
}

// Rút gọn AxiosError để log gọn – không dính ClientRequest/IncomingMessage vòng tham chiếu
function compactAxiosError(err) {
  if (!err || typeof err !== 'object') return err;
  const out = {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: err.stack,
    status: err.response?.status,
    statusText: err.response?.statusText,
    data: err.response?.data,     // thường đủ để debug
    url: err.config?.url,
    method: err.config?.method,
  };
  if (err.config?.headers) {
    // Redact header nhạy cảm
    out.headers = Object.fromEntries(
      Object.entries(err.config.headers).map(([k,v]) => [k, redact(String(v))])
    );
  }
  return out;
}

// ===== Formats =====
const base = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(), // hỗ trợ printf %o, %s
];

// Console: có màu
const consoleFormat = winston.format.combine(
  ...base,
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...rest } = info;
    let log = `${timestamp} ${level}: ${message}`;
    if (stack) log += `\n${stack}`;

    // Symbol(splat)
    const splat = info[Symbol.for('splat')];
    if (splat && splat.length) {
      const splatStr = splat.map((x) =>
        typeof x === 'object' ? safeStringify(x) : String(x)
      ).join(' ');
      log += ` ${splatStr}`;
    }

    // Metadata còn lại
    const safeRest = { ...rest };
    // Nếu có AxiosError “thô”, rút gọn nó
    if (safeRest.error instanceof Error && safeRest.error.isAxiosError) {
      safeRest.error = compactAxiosError(safeRest.error);
    }
    const keys = Object.keys(safeRest);
    if (keys.length) {
      for (const k of keys) {
        const v = safeRest[k];
        const valStr = (typeof v === 'object' && v !== null) ? safeStringify(v) : String(v);
        log += `\n  ${k}: ${redact(valStr)}`;
      }
    }
    return log;
  })
);

// File: không màu, không ANSI
const fileFormat = winston.format.combine(
  ...base,
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...rest } = info;
    let log = `${timestamp} ${level}: ${redact(message)}`;
    if (stack) log += `\n${redact(stack)}`;

    const splat = info[Symbol.for('splat')];
    if (splat && splat.length) {
      const splatStr = splat.map((x) =>
        typeof x === 'object' ? safeStringify(x) : String(x)
      ).join(' ');
      log += ` ${redact(splatStr)}`;
    }

    const safeRest = { ...rest };
    if (safeRest.error instanceof Error && safeRest.error.isAxiosError) {
      safeRest.error = compactAxiosError(safeRest.error);
    }
    const keys = Object.keys(safeRest);
    if (keys.length) {
      for (const k of keys) {
        const v = safeRest[k];
        const valStr = (typeof v === 'object' && v !== null) ? safeStringify(v) : String(v);
        log += `\n  ${k}: ${redact(valStr)}`;
      }
    }
    return log;
  })
);

// ===== Transports =====
const transports = [
  new winston.transports.Console({ format: consoleFormat }),
  new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: fileFormat }),
  new winston.transports.File({ filename: 'logs/all.log', format: fileFormat }),
];

const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
});

export default logger;
