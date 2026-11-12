// PM2 — jalankan dari root repo di STB:  pm2 start ecosystem.config.cjs
// Konfigurasi aplikasi dibaca dari file .env (lihat .env.example) lewat node --env-file (Node >= 20.6).
module.exports = {
  apps: [
    {
      name: 'zknet-cctv',
      script: 'server/dist/index.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1, // JANGAN dinaikkan: rate limit & manajer ffmpeg bersifat per-proses
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      kill_timeout: 5000, // beri waktu shutdown agar ffmpeg ikut dimatikan
      env: { NODE_ENV: 'production' },
    },
  ],
}
