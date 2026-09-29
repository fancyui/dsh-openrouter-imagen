// Minimal ASAR reader: list entries matching a regex, or extract one file.
// Usage: node asar-inspect.mjs <archive> find <regex>
//        node asar-inspect.mjs <archive> get <path/inside/asar> <output-file>
import fs from 'node:fs';

const [archive, cmd, ...args] = process.argv.slice(2);
const fd = fs.openSync(archive, 'r');
const sizeBuf = Buffer.alloc(8);
fs.readSync(fd, sizeBuf, 0, 8, 0);
const headerSize = sizeBuf.readUInt32LE(4);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 8);
const jsonLen = headerBuf.readUInt32LE(4);
const header = JSON.parse(headerBuf.toString('utf8', 8, 8 + jsonLen));
const dataOffset = 8 + headerSize;

function walk(node, prefix, cb) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      walk(child, prefix ? `${prefix}/${name}` : name, cb);
    }
  } else {
    cb(prefix, node);
  }
}

if (cmd === 'find') {
  const re = new RegExp(args[0], 'i');
  walk(header, '', (path, node) => {
    if (re.test(path)) console.log(`${path} ${node.unpacked ? '[unpacked]' : node.size ?? ''}`);
  });
} else if (cmd === 'get') {
  const [asarPath, out] = args;
  let node = header;
  for (const part of asarPath.split('/')) {
    if (!node.files || !node.files[part]) {
      console.error(`not found: ${asarPath}`);
      process.exit(1);
    }
    node = node.files[part];
  }
  if (node.files) {
    console.error(`is a directory: ${asarPath}`);
    process.exit(1);
  }
  const buf = Buffer.alloc(node.size);
  fs.readSync(fd, buf, 0, node.size, dataOffset + Number(node.offset));
  fs.writeFileSync(out, buf);
  console.log(`wrote ${out} (${node.size} bytes)`);
} else {
  console.error('unknown command');
  process.exit(1);
}
