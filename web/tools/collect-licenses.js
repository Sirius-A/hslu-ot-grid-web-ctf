'use strict';

/*
 * Builds the open-source inventory that the portal's About page serves.
 *
 * Walks the real installed runtime dependency tree (not a hand written list)
 * starting from the "dependencies" of a package, and records name, version,
 * declared license and the verbatim license text of every package in it.
 * Packages declared by the application itself are flagged as direct.
 *
 * Usage: node collect-licenses.js <package-root> <output.json> <scope-label>
 */

const fs = require('fs');
const path = require('path');

const LICENSE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'License',
  'License.md',
  'license',
  'license.md',
  'COPYING',
  'COPYING.md',
  'LICENSE-MIT',
  'LICENSE-APACHE'
];

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** Resolves a package directory the way Node does: nearest node_modules wins. */
const resolvePackageDir = (name, fromDir, root) => {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir || !dir.startsWith(root)) {
      return undefined;
    }
    dir = parent;
  }
};

const normalizeLicense = pkg => {
  if (typeof pkg.license === 'string') {
    return pkg.license;
  }
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) {
    return pkg.license.type;
  }
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map(entry => entry.type ?? entry).join(' OR ');
  }
  return 'see package metadata';
};

const readLicenseText = (dir, pkg) => {
  const chunks = [];
  for (const candidate of LICENSE_FILES) {
    const file = path.join(dir, candidate);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      chunks.push(`----- ${candidate} -----\n\n${fs.readFileSync(file, 'utf8').trim()}`);
    }
  }
  if (chunks.length) {
    return chunks.join('\n\n');
  }
  const lines = [
    `${pkg.name} ${pkg.version}`,
    `License: ${normalizeLicense(pkg)}`,
    pkg.homepage ? `Homepage: ${pkg.homepage}` : undefined,
    '',
    'The package does not ship a license file. The license identifier above is',
    'taken from its package metadata.'
  ];
  return lines.filter(line => line !== undefined).join('\n');
};

const collect = (root, scope) => {
  const rootPkg = readJson(path.join(root, 'package.json'));
  if (!rootPkg) {
    throw new Error(`no package.json in ${root}`);
  }

  const found = new Map();
  const directNames = new Set(Object.keys(rootPkg.dependencies ?? {}));
  const queue = [...directNames].map(name => ({ name, from: root }));
  const seen = new Set();

  while (queue.length) {
    const { name, from } = queue.shift();
    const dir = resolvePackageDir(name, from, root);
    if (!dir) {
      continue;
    }
    const pkg = readJson(path.join(dir, 'package.json'));
    if (!pkg) {
      continue;
    }
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    found.set(key, {
      name: pkg.name,
      version: pkg.version,
      license: normalizeLicense(pkg),
      homepage: pkg.homepage ?? pkg.repository?.url ?? undefined,
      description: typeof pkg.description === 'string' ? pkg.description.slice(0, 300) : undefined,
      direct: directNames.has(pkg.name),
      scope,
      text: readLicenseText(dir, pkg)
    });

    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      queue.push({ name: dep, from: dir });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const [, , root, outFile, scope = 'app'] = process.argv;
if (!root || !outFile) {
  console.error('usage: collect-licenses.js <package-root> <output.json> <scope-label>');
  process.exit(1);
}

const packages = collect(path.resolve(root), scope);
fs.writeFileSync(path.resolve(outFile), JSON.stringify(packages));
console.log(`[licenses] ${scope}: ${packages.length} packages -> ${outFile}`);
