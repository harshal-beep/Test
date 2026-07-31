// Generates public/icon-192.png and public/icon-512.png without any image
// dependencies — draws the icon into an RGBA buffer and encodes a PNG by hand.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const TEAL = [15, 118, 110]
const LIGHT = [240, 253, 250]
const MID = [13, 148, 136]
const DARK = [17, 94, 89]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  const s = size / 512
  const put = (x, y, [r, g, b]) => {
    const o = (y * size + x) * 4
    px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255
  }
  const rect = (x0, y0, w, h, color) => {
    for (let y = Math.round(y0 * s); y < Math.round((y0 + h) * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round((x0 + w) * s); x++)
        if (x >= 0 && y >= 0 && x < size && y < size) put(x, y, color)
  }
  rect(0, 0, 512, 512, TEAL)
  rect(120, 104, 272, 304, LIGHT)
  rect(164, 180, 40, 40, MID)
  rect(228, 190, 124, 20, DARK)
  rect(164, 260, 40, 40, MID)
  rect(228, 270, 124, 20, DARK)
  rect(164, 340, 40, 14, MID)
  rect(228, 350, 96, 20, DARK)
  return px
}

for (const size of [192, 512]) {
  writeFileSync(join(root, 'public', `icon-${size}.png`), encodePng(size, drawIcon(size)))
  console.log(`wrote public/icon-${size}.png`)
}
