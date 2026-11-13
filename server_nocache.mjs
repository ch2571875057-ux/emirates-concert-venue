// Node 静态服务器 —— 与 server_nocache.py 行为等价的兜底实现。
// 用途：本机没有可用的 Python 时（例如只有 Microsoft Store 的占位 python.exe），
//       由 启动服务器.bat 自动切到这条路径，仍然能起 http://127.0.0.1:8141/。
// 关键点：所有响应都带 no-store，改完源码刷新即生效，不会命中浏览器缓存。
//
// 用法：node server_nocache.mjs              （默认 8141，服务本文件所在目录）
//       PORT=9000 node server_nocache.mjs    （换端口）
//       node server_nocache.mjs --check      （只自检，不监听）

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8141);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  // 歌单音频：m4a 是 Apple 试听片段的容器（ISO BMFF + AAC）
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function send(res, code, body, extra) {
  res.writeHead(code, { ...NO_CACHE, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}
const plain = { 'Content-Type': 'text/plain; charset=utf-8' };

// 解析 Range 头。只支持单区间的 "bytes=a-b" / "bytes=a-" / "bytes=-n"，
// 这已经覆盖浏览器播放音频/视频时的全部实际用法；多区间直接忽略（回 200 全量）。
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    // 后缀区间：bytes=-500 表示最后 500 字节
    const n = Number(rawEnd);
    if (!Number.isFinite(n) || n <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { unsatisfiable: true };
  if (start > end || start >= size) return { unsatisfiable: true };
  if (end >= size) end = size - 1;
  return { start, end };
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, '400 bad request\n', plain);
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // 目录穿越防护：解析后必须仍在 ROOT 之内
  const filePath = path.resolve(ROOT, '.' + pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, '403 forbidden\n', plain);
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, '404 ' + pathname + '\n', plain);
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const size = st.size;

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        ...NO_CACHE, 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes',
      });
      return res.end();
    }

    // 音频/视频播放器会先发 Range 探测，必须回 206，否则 Safari/iOS 直接不播
    const range = parseRange(req.headers.range, size);
    if (range && range.unsatisfiable) {
      res.writeHead(416, {
        ...NO_CACHE, 'Content-Type': 'text/plain; charset=utf-8',
        'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes',
      });
      return res.end('416 range not satisfiable\n');
    }

    if (range) {
      const len = range.end - range.start + 1;
      res.writeHead(206, {
        ...NO_CACHE,
        'Content-Type': type,
        'Content-Length': len,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Accept-Ranges': 'bytes',
      });
      const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }

    res.writeHead(200, {
      ...NO_CACHE, 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes',
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

if (process.argv.includes('--check')) {
  console.log('node-ok ' + process.version);
  process.exit(0);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[错误] 端口 ${PORT} 已被占用，请关掉占用它的程序后重试。`);
  } else {
    console.error('[错误] ' + err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('concert1 本地服务器（Node, no-cache）');
  console.log(`  serving http://${HOST}:${PORT}/  from  ${ROOT}`);
  console.log('  关掉这个窗口即停止服务。');
});
