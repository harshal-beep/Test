/**
 * Voice-note capture. We tap raw PCM straight off the microphone with Web
 * Audio instead of MediaRecorder — iOS Safari records AAC/mp4 that its own
 * decodeAudioData often cannot decode back, so there must be no decode step.
 * stop() resolves to a ready 16 kHz mono 16-bit WAV.
 */

export interface Recorder {
  stop: () => Promise<Blob>
  cancel: () => void
}

export async function recordAudio(targetRate = 16000): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  await ctx.resume()
  const sourceRate = ctx.sampleRate

  const source = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  // Safari only fires onaudioprocess when the graph reaches the destination;
  // route through a muted gain so the mic never plays back out loud.
  const mute = ctx.createGain()
  mute.gain.value = 0

  const chunks: Float32Array[] = []
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  source.connect(proc)
  proc.connect(mute)
  mute.connect(ctx.destination)

  let done = false
  const teardown = () => {
    if (done) return
    done = true
    proc.onaudioprocess = null
    try {
      source.disconnect()
      proc.disconnect()
      mute.disconnect()
    } catch {
      /* graph already torn down */
    }
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  return {
    stop: async () => {
      teardown()
      const pcm = mergeChunks(chunks)
      if (pcm.length === 0) throw new Error('No audio captured — try again')
      return encodeWav(downsample(pcm, sourceRate, targetRate), targetRate)
    },
    cancel: teardown
  }
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

/** Block-average downsample — the averaging doubles as a crude low-pass, fine for speech. */
function downsample(pcm: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return pcm
  const ratio = from / to
  const out = new Float32Array(Math.floor(pcm.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(pcm.length, Math.max(start + 1, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = start; j < end; j++) sum += pcm[j]
    out[i] = sum / (end - start)
  }
  return out
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
