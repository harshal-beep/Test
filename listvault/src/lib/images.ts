/**
 * Client-side image prep. Phone photos are multi-megabyte; everything uploaded
 * from HaMaara is decoded, resized and re-encoded as JPEG first.
 */

function load(file: File): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ img, revoke: () => URL.revokeObjectURL(url) })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not process the image'))),
      'image/jpeg',
      quality
    )
  )
}

/** Square center-crop, ≤512px — for profile photos. */
export async function processAvatar(file: File): Promise<Blob> {
  const { img, revoke } = await load(file)
  try {
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const size = Math.min(512, side)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process the image')
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    return await encode(canvas, 0.85)
  } finally {
    revoke()
  }
}

/** Keeps the original aspect ratio, long edge ≤1280px — for memory photos. */
export async function processPhoto(file: File): Promise<Blob> {
  const { img, revoke } = await load(file)
  try {
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process the image')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await encode(canvas, 0.82)
  } finally {
    revoke()
  }
}
