import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
await mkdir(destination, { recursive: true });
for (const entry of ['index.html', 'app.js', 'art.js', 'rules.js', 'design.css', 'assets', 'data']) {
  await cp(path.join(root, entry), path.join(destination, entry), { recursive: true, force: true });
}
await writeFile(path.join(destination, '.nojekyll'), '');
console.log('Static website built in dist/.');
