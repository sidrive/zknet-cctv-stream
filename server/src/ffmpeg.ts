import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import type { CameraRow } from './access.js'

interface Session {
  proc: ChildProcess
  dir: string
  lastSeen: number
  ready: Promise<void>
}

const redact = (s: string) => s.replace(/(\w+:\/\/)[^@/\s]+@/g, '$1***@')

/**
 * Mengubah sumber RTSP/RTMP/SRT menjadi HLS agar bisa diputar browser.
 * - Berjalan ON-DEMAND: ffmpeg hanya hidup selama ada penonton, mati setelah idle.
 * - Segmen hanya buffer bergulir di folder sementara (delete_segments) — tidak ada rekaman.
 */
class FfmpegManager {
  private sessions = new Map<string, Session>()
  private timer: NodeJS.Timeout

  constructor() {
    fs.rmSync(config.streamTmpDir, { recursive: true, force: true })
    fs.mkdirSync(config.streamTmpDir, { recursive: true })
    this.timer = setInterval(() => this.sweep(), 5000)
    this.timer.unref()
  }

  dirFor(camId: string) {
    return path.join(config.streamTmpDir, camId.replace(/[^\w-]/g, '_'))
  }

  touch(camId: string) {
    const s = this.sessions.get(camId)
    if (s) s.lastSeen = Date.now()
  }

  ensure(cam: CameraRow): Promise<void> {
    const existing = this.sessions.get(cam.id)
    if (existing) {
      existing.lastSeen = Date.now()
      return existing.ready
    }
    const dir = this.dirFor(cam.id)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })

    const input = cam.source_url
    const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin']
    if (/^rtsps?:/i.test(input)) args.push('-rtsp_transport', 'tcp')
    args.push('-i', input, '-an')
    if (cam.transcode) {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-g', '50', '-pix_fmt', 'yuv420p')
    } else {
      args.push('-c:v', 'copy')
    }
    args.push(
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
      '-hls_segment_filename', path.join(dir, 'seg%d.ts'),
      path.join(dir, 'index.m3u8'),
    )

    const proc = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-2000)
    })
    const ready = new Promise<void>((resolve, reject) => {
      const playlist = path.join(dir, 'index.m3u8')
      const started = Date.now()
      const poll = setInterval(() => {
        if (fs.existsSync(playlist)) {
          clearInterval(poll)
          resolve()
        } else if (Date.now() - started > 20000) {
          clearInterval(poll)
          reject(new Error('ffmpeg tidak menghasilkan playlist (timeout)'))
        }
      }, 300)
      proc.once('exit', (code) => {
        clearInterval(poll)
        reject(new Error(`ffmpeg berhenti (kode ${code}): ${redact(stderr).trim().slice(-300)}`))
      })
      proc.once('error', (e) => {
        clearInterval(poll)
        reject(new Error(`ffmpeg gagal dijalankan: ${e.message}`))
      })
    })
    ready.catch(() => undefined) // jangan jadi unhandled rejection

    const session: Session = { proc, dir, lastSeen: Date.now(), ready }
    this.sessions.set(cam.id, session)
    proc.once('exit', () => {
      if (this.sessions.get(cam.id) === session) this.sessions.delete(cam.id)
      fs.rm(dir, { recursive: true, force: true }, () => undefined)
    })
    return ready
  }

  stop(camId: string) {
    this.sessions.get(camId)?.proc.kill('SIGKILL')
  }

  private sweep() {
    const limit = config.ffmpegIdleSeconds * 1000
    for (const [id, s] of this.sessions) {
      if (Date.now() - s.lastSeen > limit) {
        s.proc.kill('SIGKILL')
        this.sessions.delete(id)
      }
    }
  }

  stopAll() {
    clearInterval(this.timer)
    for (const s of this.sessions.values()) s.proc.kill('SIGKILL')
    this.sessions.clear()
  }

  activeCount() {
    return this.sessions.size
  }
}

export const ffmpeg = new FfmpegManager()
