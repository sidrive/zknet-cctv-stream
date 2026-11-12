import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
export const config = {
    port: Number(env.PORT ?? 8080),
    dataDir: path.resolve(env.DATA_DIR ?? path.join(here, '../../data')),
    // Folder sementara untuk segmen HLS hasil ffmpeg. Hanya buffer bergulir, BUKAN rekaman.
    streamTmpDir: path.resolve(env.STREAM_TMP_DIR ?? path.join(os.tmpdir(), 'zknet-cctv')),
    webDir: path.resolve(env.WEB_DIR ?? path.join(here, '../../web/dist')),
    jwtSecret: env.JWT_SECRET || '',
    // Jika diisi, wizard setup admin pertama wajib menyertakan token ini.
    setupToken: env.SETUP_TOKEN || '',
    ffmpegPath: env.FFMPEG_PATH ?? 'ffmpeg',
    ffmpegIdleSeconds: Number(env.FFMPEG_IDLE_SECONDS ?? 30),
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    cookieSecure: env.COOKIE_SECURE === '1' || env.COOKIE_SECURE === 'true',
};
