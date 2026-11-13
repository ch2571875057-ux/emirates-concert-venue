# -*- coding: utf-8 -*-
# 本地静态服务器（禁缓存版）：每次请求都拿最新文件，改完刷新即生效
import http.server
import functools
import mimetypes
import os
import re

PORT = int(os.environ.get('PORT') or 8141)

# SimpleHTTPRequestHandler 自带的类型表里没有 gltf 系列，补上，
# 免得 .glb 被当成 application/octet-stream（能读，但工具链看着别扭）
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('model/gltf+json', '.gltf')
mimetypes.add_type('application/wasm', '.wasm')
# 歌单音频：显式声明，免得不同机器上 play 列表不一致
mimetypes.add_type('audio/mp4', '.m4a')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('audio/ogg', '.ogg')
mimetypes.add_type('audio/aac', '.aac')
mimetypes.add_type('audio/wav', '.wav')

# 单区间 Range 解析：bytes=a-b / bytes=a- / bytes=-n
RANGE_RE = re.compile(r'^bytes=(\d*)-(\d*)$')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def _range(self, size):
        """返回 (start, end) 或 None（无 Range）；不可满足返回 'bad'。"""
        header = self.headers.get('Range')
        if not header:
            return None
        m = RANGE_RE.match(header.strip())
        if not m:
            return None
        raw_start, raw_end = m.group(1), m.group(2)
        if raw_start == '' and raw_end == '':
            return None
        if raw_start == '':
            n = int(raw_end)
            if n <= 0:
                return 'bad'
            return (max(0, size - n), size - 1)
        start = int(raw_start)
        end = size - 1 if raw_end == '' else int(raw_end)
        if start > end or start >= size:
            return 'bad'
        return (start, min(end, size - 1))

    def do_GET(self):
        # SimpleHTTPRequestHandler 本身不处理 Range（实测回 200 全量），
        # 而音频播放器需要 206 才能 seek / 在 iOS 上播放，这里前置处理。
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().do_GET()
        size = os.path.getsize(path)
        rng = self._range(size)
        if rng is None:
            return super().do_GET()
        if rng == 'bad':
            self.send_response(416)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        start, end = rng
        length = end - start + 1
        ctype = self.guess_type(path)
        with open(path, 'rb') as f:
            f.seek(start)
            self.send_response(206)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
            self.send_header('Content-Length', str(length))
            self.end_headers()
            self.wfile.write(f.read(length))


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=os.path.dirname(os.path.abspath(__file__)))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    print('concert1 本地服务器（Python, no-cache）')
    print('  serving http://127.0.0.1:%d/' % PORT)
    print('  关掉这个窗口即停止服务。')
    server.serve_forever()
