import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST ?? '127.0.0.1';
const initialPort = Number.parseInt(process.env.PORT ?? '5173', 10);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg']
]);

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`);
    const cleanPath = requestUrl.pathname === '/' ? '/index.html' : decodeURIComponent(requestUrl.pathname);
    const filePath = path.normalize(path.join(root, cleanPath));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500);
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});

function listen(port, attemptsLeft = 10) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const address = server.address();
    console.log(`VUno running at http://${host}:${address.port}/`);
  });
}

listen(initialPort);
