const fs = require('fs');
const path = require('path');
const base = path.join('g:', 'WORKING', 'Backend');
const server = fs.readFileSync(path.join(base, 'Server.js'), 'utf8');
const useRe = /app\.use\(['"]([^'"]+)['"],\s*([a-zA-Z0-9_]+)\)/g;
const routesVarRe = /const\s+([a-zA-Z0-9_]+)\s*=\s*require\(['"]\.\/routes\/([a-zA-Z0-9_-]+)['"]\)/g;
const varToFile = {};
let match;
while ((match = routesVarRe.exec(server))) {
  varToFile[match[1]] = match[2];
}
const baseByFile = {};
while ((match = useRe.exec(server))) {
  const basePath = match[1];
  const varName = match[2];
  const file = varToFile[varName];
  if (file) {
    baseByFile[file] = basePath;
  }
}
const routesDir = path.join(base, 'routes');
const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));
const endpoints = [];
for (const file of routeFiles) {
  const basePath = baseByFile[path.basename(file, '.js')] || '';
  const content = fs
    .readFileSync(path.join(routesDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const routeRe = /router\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g;
  let r;
  while ((r = routeRe.exec(content))) {
    const method = r[1].toUpperCase();
    const route = r[2];
    const full = (`${basePath}${route}`).replace(/\/+?/g, '/');
    endpoints.push({ method, path: full, file });
  }
}
const postmanPath = path.join(base, 'Postman_Collection_FoodDelivery_Complete.json');
const postman = JSON.parse(fs.readFileSync(postmanPath, 'utf8'));
const postmanUrls = new Set();
function walkItems(items) {
  for (const item of items || []) {
    if (item.request && item.request.url) {
      let raw = item.request.url.raw || '';
      if (!raw && item.request.url.host) {
        raw = `http://{{BASE_URL}}/${(item.request.url.path || []).join('/')}`;
      }
      raw = raw.replace('{{BASE_URL}}', 'http://localhost');
      try {
        const u = new URL(raw);
        postmanUrls.add(u.pathname);
      } catch (e) {
        if (raw.startsWith('/')) {
          postmanUrls.add(raw);
        }
      }
    }
    if (item.item) walkItems(item.item);
  }
}
walkItems(postman.item);
const missing = endpoints.filter((e) => !postmanUrls.has(e.path));
missing.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
console.log('Missing routes in Postman:', missing.length);
for (const e of missing) {
  console.log(`${e.method} ${e.path} (${e.file})`);
}
