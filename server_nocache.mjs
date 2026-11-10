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
    if (req.method === 'HEAD') {
      res.writeHead(200, { ...NO_CACHE, 'Content-Type': type, 'Content-Length': st.size });
      return res.end();
    }
    res.writeHead(200, { ...NO_CACHE, 'Content-Type': type, 'Content-Length': st.size });
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
