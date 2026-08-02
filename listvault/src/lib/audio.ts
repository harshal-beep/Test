/**
 * Voice-note capture and conversion. iOS records AAC in an mp4 container;
 * models want plain WAV — so we decode whatever MediaRecorder produced and
 * re-encode 16 kHz mono 16-bit WAV (small enough to ship as base64).
 */

export interface Recorder {
  stop: () => Promise<Blob>
  cancel: () => void
}

export async function recordAudio(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const rec = new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
  rec.start()
  const cleanup = () => stream.getTracks().forEach((t) => t.stop())
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          cleanup()
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }))
        }
        rec.stop()
      }),
    cancel: () => {
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
      cleanup()
    }
  }
}

/** Decode any recorded blob → 16 kHz mono 16-bit WAV. */
export async function blobToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.max(1, Math.ceil(decoded.duration * targetRate))
    const off = new OfflineAudioContext(1, frames, targetRate)
    const src = off.createBufferSource()
    src.buffer = decoded
    src.connect(off.destination)
    src.start()
    const rendered = await off.startRendering()
    return encodeWav(rendered.getChannelData(0), targetRate)
  } finally {
    void ctx.close()
  }
}

function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(buf)
  const str = (off: number, s: string) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = () => reject(new Error('Could not read audio'))
    r.readAsDataURL(blob)
  })
