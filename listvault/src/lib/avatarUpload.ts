/**
 * Turn any picked photo into a small square avatar: center-crop, downscale to
 * ≤512px, encode as JPEG. Keeps multi-MB iOS camera photos off the network.
 */
export async function processAvatar(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Could not read that image'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const size = Math.min(512, side)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process the image')
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size
    )
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('Could not process the image')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
