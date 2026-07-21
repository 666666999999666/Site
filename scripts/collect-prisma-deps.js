// 收集 prisma CLI 运行所需的完整依赖树
const fs = require('fs');
const path = require('path');

const srcDir = '/app/node_modules';
const destDir = '/prisma-bundle';

const deps = new Set();

function collect(pkg, visited = new Set()) {
  if (visited.has(pkg)) return;
  visited.add(pkg);
  try {
    const p = require(path.join(srcDir, pkg, 'package.json'));
    const all = { ...(p.dependencies || {}), ...(p.peerDependencies || {}) };
    for (const dep of Object.keys(all)) {
      // 不跳过 @prisma/* 包，也递归收集它们的依赖
      if (dep !== 'prisma') {
        deps.add(dep);
        collect(dep, visited);
      }
    }
  } catch(e) {}
}

// 从 prisma 入口开始收集所有依赖
collect('prisma');

// 复制所有收集到的包
for (const dep of deps) {
  const src = path.join(srcDir, dep);
  if (fs.existsSync(src)) {
    const parts = dep.split('/');
    if (parts.length > 1) {
      const scopeDir = path.join(destDir, parts[0]);
      if (!fs.existsSync(scopeDir)) fs.mkdirSync(scopeDir, {recursive: true});
    }
    try {
      fs.cpSync(src, path.join(destDir, dep), {recursive: true});
    } catch(e) { console.error('skip', dep, e.message); }
  }
}

console.log('Collected', deps.size, 'packages for prisma CLI');
