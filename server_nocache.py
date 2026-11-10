# 本地静态服务器（禁缓存版）：每次请求都拿最新文件，改完刷新即生效
import http.server
import functools
import mimetypes
import os

PORT = int(os.environ.get('PORT') or 8141)

# SimpleHTTPRequestHandler 自带的类型表里没有 gltf 系列，补上，
# 免得 .glb 被当成 application/octet-stream（能读，但工具链看着别扭）
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('model/gltf+json', '.gltf')
mimetypes.add_type('application/wasm', '.wasm')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=os.path.dirname(os.path.abspath(__file__)))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    print('concert1 本地服务器（Python, no-cache）')
    print('  serving http://127.0.0.1:%d/' % PORT)
    print('  关掉这个窗口即停止服务。')
    server.serve_forever()
