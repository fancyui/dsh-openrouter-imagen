// Extract every file under a directory inside an ASAR, recreating the tree.
// Usage: node asar-extract-dir.mjs <archive> <dir/inside/asar> <output-dir>
import fs from 'node:fs';
import path from 'node:path';

const [archive, dir, outDir] = process.argv.slice(2);
const fd = fs.openSync(archive, 'r');
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, 0);
const headerSize = sizeBuf.readUInt32LE(4);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 8);
const jsonLen = headerBuf.readUInt32LE(4);
const header = JSON.parse(headerBuf.toString('utf8', 8, 8 + jsonLen));
const dataOffset = 8 + headerSize;

let node = header;
for (const part of dir.split('/').filter(Boolean)) {
  if (!node.files || !node.files[part]) {
    console.error(`not found: ${dir}`);
    process.exit(1);
  }
  node = node.files[part];
}

let count = 0;
const walk = (cur, prefix) => {
  for (const [name, child] of Object.entries(cur.files ?? {})) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (child.files) walk(child, rel);
    else {
      const dest = path.join(outDir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const buf = Buffer.alloc(child.size);
      fs.readSync(fd, buf, 0, child.size, dataOffset + Number(child.offset));
      fs.writeFileSync(dest, buf);
      count += 1;
    }
  }
};
walk(node, '');
fs.closeSync(fd);
console.log(`extracted ${count} files to ${outDir}`);
