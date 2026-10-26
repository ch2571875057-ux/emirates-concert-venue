# 本地静态服务器（禁缓存版）：每次请求都拿最新文件，改完刷新即生效
import http.server
import functools

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory='.')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 8141), handler)
    print('serving http://127.0.0.1:8141/ (no-cache)')
    server.serve_forever()
