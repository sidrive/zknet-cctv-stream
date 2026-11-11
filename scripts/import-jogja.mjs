// Impor CCTV Pemerintah Kota Yogyakarta (HLS publik) ke database zknet-cctv-stream.
// Sumber data: https://cctv.jogjakota.go.id/ (endpoint home/getdata)
// Jalankan: node scripts/import-jogja.mjs [--fetch] [--no-verify] [--proxy] [--dry]
//   --fetch     : ambil ulang daftar kamera dari situs (butuh internet), lalu impor
//   --no-verify : lewati cek HTTP ke tiap stream
//   --proxy     : aktifkan proxy server (URL sumber disembunyikan, bandwidth server kena beban)
//   --dry       : hanya tampilkan, tidak menulis DB
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const FETCH = args.has('--fetch')
const VERIFY = !args.has('--no-verify')
const PROXY = args.has('--proxy')
const DRY = args.has('--dry')

const DB_PATH = path.resolve('data/cctv.db')
const SLUG = 'cctv-jogja'
const CLUSTER_NAME = 'CCTV Kota Yogyakarta'
const DATA_URL = 'https://cctv.jogjakota.go.id/home/getdata'

// [url, judul, lokasi] — snapshot 2026-11-11
const SNAPSHOT = [
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_apmd.stream/playlist.m3u8", "Simpang APMD (PTZ)", "BACIRO, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_jlagran.stream/playlist.m3u8", "Simpang Jlagran (PTZ)", "PRINGGOKUSUMAN, GEDONGTENGEN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_joktengkulon.stream/playlist.m3u8", "Simpang Jokteng Kulon (PTZ)", "GEDONGKIWO, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_joktengwetan.stream/playlist.m3u8", "Simpang Jokteng Wetan", "PANEMBAHAN, KRATON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_pkumuh.stream/playlist.m3u8", "Simpang PKU Muh. (PTZ)", "NGUPASAN, GONDOMANAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_serangan.stream/playlist.m3u8", "Simpang Serangan (PTZ)", "NGAMPILAN, NGAMPILAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_tungkak.stream/playlist.m3u8", "Simpang Tungkak (PTZ)", "WIROGUNAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_tunjung.stream/playlist.m3u8", "Simpang Tunjung (PTZ)", "BAUSASRAN, DANUREJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_ukdw.stream/playlist.m3u8", "Simpang UKDW (PTZ)", "KLITREN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_wirobrajan.stream/playlist.m3u8", "Simpang Wirobrajan (PTZ)", "WIROBRAJAN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/bpbd/BPBD_gajahwong2.stream/playlist.m3u8", "Sungai Gajah Wong 2", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/bpbd/BPBD_kaliwinongo.stream/playlist.m3u8", "Sungai Winongo", "PRINGGOKUSUMAN, GEDONGTENGEN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/bpbd/BPBD_ngentak.stream/playlist.m3u8", "Sungai Ngentak", "SINDUHARJO, NGAGLIK, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Ibu_Ruswo.stream/playlist.m3u8", "Simpang Ibu Ruswo (PTZ)", "PRAWIRODIRJAN, GONDOMANAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_bpk.stream/playlist.m3u8", "Simpang BPK (PTZ)", "TEGALREJO, TEGALREJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_jogokaryan.stream/playlist.m3u8", "Simpang Jogokariyan V. Selatan", "BRONTOKUSUMAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JlMentriSupeno.stream/playlist.m3u8", "Simpang APPI - JL.Mentri Supeno", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_KyaiMojo.stream/playlist.m3u8", "Simpang Kiai Mojo 1 (Barat)", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_KyaiMojo2.stream/playlist.m3u8", "Simpang Kiai Mojo 2 (Timur)", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit1.stream/playlist.m3u8", "Simpang Pingit 1 - Jl.Tentara Pelajar", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit2.stream/playlist.m3u8", "Simpang Pingit 2 - Jl. Tentara Pelajar", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit3.stream/playlist.m3u8", "Simpang Pingit 3 - Jl. Tentara Pelajar", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Gambiran1.stream/playlist.m3u8", "Simpang Gambiran 1 - Jl.Veteran", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Gambiran2.stream/playlist.m3u8", "Simpang Gambiran 2 - Jl.Veteran", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JlMentriSupeno2.stream/playlist.m3u8", "Simpang APPI 2 - Jl.Mentri Supeno", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SopMerah1.stream/playlist.m3u8", "Simpang Karang Tunggal (S3 Jl. Kol.Sugiyono - Jl. Sisingamangaraja) 1", "BRONTOKUSUMAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SopMerah2.stream/playlist.m3u8", "Simpang Karang Tunggal (S3 Jl. Kol.Sugiyono - Jl. Sisingamangaraja) 2", "BRONTOKUSUMAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_JoktengWetan.stream/playlist.m3u8", "Simpang Jokteng Wetan - Jl. Parangtritis (PTZ)", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_PasarGading1.stream/playlist.m3u8", "Simpang Pasar Gading 1 (Timur)", "MANTRIJERON, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_PasarGading2.stream/playlist.m3u8", "Simpang Pasar Gading 2 (Barat)", "MANTRIJERON, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SugengJeroni1.stream/playlist.m3u8", "Simpang Sugeng Jeroni (Bugisan) 1", "PATANGPULUHAN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_SugengJeroni2.stream/playlist.m3u8", "Simpang Sugeng Jeroni (Bugisan) 2", "PATANGPULUHAN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Parkiran_Ngabean.stream/playlist.m3u8", "Parkiran Ngabean", "NGAMPILAN, NGAMPILAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit4.stream/playlist.m3u8", "Simpang Pingit 4 - Jl. Tentara Pelajar", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_mirota.stream/playlist.m3u8", "Simpang Mirota (PTZ)", "TERBAN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_tamansari.stream/playlist.m3u8", "Simpang Taman Sari (PTZ)", "GEDONGKIWO, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_semaki_1.stream/playlist.m3u8", "RTHP Semaki  1", "SEMAKI, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_semaki_2.stream/playlist.m3u8", "RTHP Semaki 2", "SEMAKI, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_klitren_2.stream/playlist.m3u8", "RTHP Klitren 2", "KLITREN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_gunungketur_1.stream/playlist.m3u8", "RTHP Gunungketur 1", "PURWO KINANTI, PAKUALAMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_gunungketur_2.stream/playlist.m3u8", "RTHP Gunungketur 2", "GUNUNG KETUR, PAKUALAMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_brontokusuman_blkgKel_2.stream/playlist.m3u8", "RTHP Brontokusuman (blkg Kel) 2", "BRONTOKUSUMAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_segoro_amarto_tegalrejo_2.stream/playlist.m3u8", "RTHP Segoro Amarto Tegalrejo 2", "TEGALREJO, TEGALREJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_pakudaya_pakuncen_1.stream/playlist.m3u8", "RTHP Pakudaya Pakuncen 1", "PAKUNCEN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_pakudaya_pakuncen_2.stream/playlist.m3u8", "RTHP Pakudaya Pakuncen 2", "PAKUNCEN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Amongrogo_View_Timur.stream/playlist.m3u8", "Simpang Amongrogo View Timur", "SEMAKI, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Utara.stream/playlist.m3u8", "Simpang Demangan View Utara", "KLITREN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Selatan.stream/playlist.m3u8", "Simpang Demangan View Selatan", "DEMANGAN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Timur.stream/playlist.m3u8", "Simpang Demangan View Timur", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_DeBritto_View_Utara.stream/playlist.m3u8", "Simpang DeBritto View Utara", "CATUR TUNGGAL, DEPOK, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Rejowinangun_View_Timur.stream/playlist.m3u8", "Simpang Rejowinangun View Timur", "REJOWINANGUN, KOTAGEDE, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Balaikota_View_Utara.stream/playlist.m3u8", "Simpang Balaikota View Timur", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Balaikota_View_Timur.stream/playlist.m3u8", "Simpang Balaikota View Utara-Barat", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Gedongkuning.stream/playlist.m3u8", "Simpang Gedongkuning (PTZ)", "BANGUNTAPAN, BANGUNTAPAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Pasar_Demangan_View_Selatan.stream/playlist.m3u8", "Pasar Demangan View Selatan", "DEMANGAN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Galeria_TimurSelatan.stream/playlist.m3u8", "Simpang Galeria (PTZ)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_JatiKencana.stream/playlist.m3u8", "Simpang Jati Kencana (PTZ)", "TEGALREJO, TEGALREJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Borobudur_Plaza.stream/playlist.m3u8", "Simpang Borobudur Plaza", "KRICAK, TEGALREJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Tugu.stream/playlist.m3u8", "Simpang Tugu (PTZ)", "GOWONGAN, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_S4_Bausasran.stream/playlist.m3u8", "Simpang Bausasran (PTZ)", "TEGALPANGGUNG, DANUREJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Lampu_Merah_Pingit5.stream/playlist.m3u8", "Simpang Pingit 5 (PTZ)", "BUMIJO, JETIS, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/balaikota/Balaikota_Gerbang_Masuk_Utara_View_Timur-Luar.stream/playlist.m3u8", "Gerbang Masuk Utara V. Timur (Luar)", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/balaikota/Balaikota_Gerbang_Timur_PKK_View_Utara-Luar.stream/playlist.m3u8", "Gerbang Timur PKK V. Utara (Luar)", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/balaikota/Balaikota_Gerbang_Timur_PKK_View_Selatan-Luar.stream/playlist.m3u8", "Gerbang Timur PKK V. Selatan (Luar)", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Balaikota_PTZ.stream/playlist.m3u8", "Simpang Balaikota (PTZ)", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Mandala_Krida_PTZ.stream/playlist.m3u8", "Simpang Mandala Krida (PTZ)", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Basen.stream/playlist.m3u8", "Simpang Basen", "PRENGGAN, KOTAGEDE, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Melia_Purosani.stream/playlist.m3u8", "Simpang Melia Purosani (PTZ)", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Patangpuluhan.stream/playlist.m3u8", "Simpang Patangpuluhan (PTZ)", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Atmosukarto.stream/playlist.m3u8", "Simpang Atmosukarto (PTZ)", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Pasar_Telo_View_Selatan.stream/playlist.m3u8", "Simpang Pasar Telo View Selatan", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Pasar_Telo_View_Utara.stream/playlist.m3u8", "Simpang Pasar Telo View Utara", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/Jl-Nyoman-Oka.stream/playlist.m3u8", "Jl. Nyoman Oka (Gereja Kotabaru)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/Jl-Sajiono.stream/playlist.m3u8", "Jl. Sajiono (Roemi)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-Yos-Sudarso.stream/playlist.m3u8", "Jl. Yos Sudarso (Mie Gacoan)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-Wardhani.stream/playlist.m3u8", "Jl. Wardhani (Selatan-Timur SMPN 5)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-Ahmad-Jazuli.stream/playlist.m3u8", "Jl. Ahmad Jazuli (Apotek K24)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-FM-Noto-Raminten.stream/playlist.m3u8", "Jl. F.M. Noto (Raminten)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/ANPR-Jl-FM-Noto-Gardu-Aniem.stream/playlist.m3u8", "Jl. F.M. Noto (Gardu ANIEM)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kotabaru/Jl-Juadi.stream/playlist.m3u8", "Jl. Juadi (Pojok Utara-Barat Telkom)", "KOTABARU, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kecamatan/KemMJ-TimurKemantren.stream/playlist.m3u8", "KemMJ-Timur Kemantren", "SURYODININGRATAN, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kecamatan/KemMJ-PendopoKemantren.stream/playlist.m3u8", "KemMJ-Pendopo Kemantren", "SURYODININGRATAN, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/kecamatan/KemMJ-JalanSelatanKemantren.stream/playlist.m3u8", "KemMJ-Jalan Selatan Kemantren", "SURYODININGRATAN, MANTRIJERON, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Selatan.stream/playlist.m3u8", "Simpang Wirosaban View Selatan", "SOROSUTAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Utara.stream/playlist.m3u8", "Simpang Wirosaban View Utara", "SOROSUTAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Barat.stream/playlist.m3u8", "Simpang Wirosaban View Barat", "SOROSUTAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Wirosaban_View_Timur.stream/playlist.m3u8", "Simpang Wirosaban View Timur", "SOROSUTAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Jogokariyan_View_Utara.stream/playlist.m3u8", "Simpang Jogokariyan V. Utara", "Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_gajahwong_edupark_3.stream/playlist.m3u8", "RTHP Gajah Wong Edu Park 3", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_gajahwong_edupark_2.stream/playlist.m3u8", "RTHP Gajah Wong Edu Park 2", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_gajahwong_edupark_1.stream/playlist.m3u8", "RTHP Gajah Wong Edu Park 1", "PANDEYAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Tegalgendu.stream/playlist.m3u8", "Simpang Tegalgendu V. Selatan", "GIWANGAN, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Letjen_Suprapto_KS_Tubun_View_Selatan.stream/playlist.m3u8", "Simpang Letjen Suprapto-KS. Tubun V. Selatan", "NGAMPILAN, NGAMPILAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Letjen_Suprapto_KS_Tubun_View_Utara.stream/playlist.m3u8", "Simpang Letjen Suprapto-KS. Tubun V. Utara", "NGAMPILAN, NGAMPILAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/tps-liar/S3_Jl_Mas%20Suharto-Jl_Tegalpanggung.stream/playlist.m3u8", "Jl. Mas Suharto V. Selatan (Depan LASERCOM)", "TEGALPANGGUNG, DANUREJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/tps-liar/S3_Jl_Mas%20Suharto-Jl_Tukangan.stream/playlist.m3u8", "Jl. Mas Suharto V. Utara (Barat Sari Wangi Parfum)", "TEGALPANGGUNG, DANUREJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_jopraban_3.stream/playlist.m3u8", "RTHP Jopraban 3", "WIROBRAJAN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_jopraban_2.stream/playlist.m3u8", "RTHP Jopraban 2", "WIROBRAJAN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_jopraban_1.stream/playlist.m3u8", "RTHP Jopraban 1", "WIROBRAJAN, WIROBRAJAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Demangan_View_Timur.stream/playlist.m3u8", "Simpang Demangan View Timur", "DEMANGAN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/rthp/rthp_bumen.stream/playlist.m3u8", "RTHP Bumen", "PURBAYAN, KOTAGEDE, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/dprd-kota/depan-dprd-v-utara.stream/playlist.m3u8", "Depan DPRD V. Utara", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/dprd-kota/depan-dprd-v-selatan.stream/playlist.m3u8", "Depan DPRD V. Selatan", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/dprd-kota/depan-dprd-pos-security.stream/playlist.m3u8", "Depan DPRD Pos Security", "MUJA MUJU, UMBULHARJO, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Pasar_Telo_PTZ.stream/playlist.m3u8", "Simpang Pasar Telo (PTZ)", "BRONTOKUSUMAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Mantrigawen_PTZ.stream/playlist.m3u8", "Simpang Mantrigawen (PTZ)", "KEPARAKAN, MERGANGSAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Utara-Timur_Gardena_Jl_Urip%20Sumoharjo_V_Timur.stream/playlist.m3u8", "Utara-Timur Gardena (Jl. Urip Sumoharjo) V. Timur", "KLITREN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_Mirota_View_Barat.stream/playlist.m3u8", "Simpang Mirota V. Barat (FIX)", "TERBAN, GONDOKUSUMAN, Yogyakarta"],
  ["https://cctvjss.jogjakota.go.id/atcs/ATCS_Simpang_JatiKencana_Fix.stream/playlist.m3u8", "Simpang Jati Kencana V. Barat", "BENER, TEGALREJO, Yogyakarta"],
]

const newId = () => crypto.randomBytes(8).toString('base64url')

async function fetchList() {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 30000)
  try {
    const r = await fetch(DATA_URL, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'x-requested-with': 'XMLHttpRequest',
        'user-agent': 'Mozilla/5.0 zknet-cctv-import/1.0',
        referer: 'https://cctv.jogjakota.go.id/',
      },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const rows = await r.json()
    return rows
      .filter((x) => x.cctv_link)
      .map((x) => {
        const raw = x.cctv_link.trim()
        // beberapa URL mengandung spasi mentah -> harus di-encode agar valid
        const url = raw.includes(' ') ? encodeURI(raw) : raw
        const loc = [x.kelurahan_nama, x.kecamatan_nama, 'Yogyakarta'].filter(Boolean).join(', ')
        return [url, String(x.cctv_title ?? '').trim(), loc || 'Kota Yogyakarta']
      })
  } finally {
    clearTimeout(t)
  }
}

async function alive(url) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 12000)
  try {
    // url sudah di-encode saat dibangun; jangan encode ulang (spasi jadi %2520 -> 404)
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'zknet-cctv-import/1.0' } })
    if (!r.ok) return false
    const txt = await r.text()
    return txt.includes('#EXTM3U')
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

const cams = FETCH ? await fetchList() : SNAPSHOT

console.log(`Database : ${DB_PATH}`)
console.log(`Sumber   : ${FETCH ? 'live fetch (cctv.jogjakota.go.id)' : 'snapshot lokal'}`)
console.log(`Verifikasi: ${VERIFY ? 'ya' : 'tidak'} | proxy: ${PROXY ? 'ON' : 'OFF'} | dry-run: ${DRY ? 'ya' : 'tidak'}`)
console.log(`Kamera   : ${cams.length}`)
console.log('')

let ok = cams
if (VERIFY) {
  const results = []
  const queue = [...cams]
  let done = 0
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      for (;;) {
        const item = queue.shift()
        if (!item) return
        const live = await alive(item[0])
        results.push([item, live])
        done++
        if (done % 10 === 0 || done === cams.length) process.stdout.write(`\r  cek ${done}/${cams.length}...`)
      }
    }),
  )
  process.stdout.write('\r'.padEnd(40) + '\r')
  // urutan asli dipertahankan
  const liveSet = new Map(results.map(([it, l]) => [it[0], l]))
  ok = cams.filter((it) => liveSet.get(it[0]))
  const dead = cams.filter((it) => !liveSet.get(it[0]))
  console.log(`  live: ${ok.length} | mati: ${dead.length}`)
  for (const [, name] of dead) console.log(`   - LEWATI (mati): ${name}`)
  console.log('')
}

if (DRY) {
  console.log(`Akan mengimpor ${ok.length} kamera ke cluster "${CLUSTER_NAME}" (slug: ${SLUG}).`)
  for (const [url, name] of ok) console.log(`  ${name}  ->  ${url}`)
  process.exit(0)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

const upsertCluster = db.prepare(
  `INSERT INTO clusters(id,slug,name,description,access_mode,sort)
   VALUES(@id,@slug,@name,@description,'public',@sort)
   ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=excluded.description`,
)
const findCluster = db.prepare('SELECT id FROM clusters WHERE slug=?')
const existsCam = db.prepare('SELECT id FROM cameras WHERE source_url=?')
const insertCam = db.prepare(
  `INSERT INTO cameras(id,name,description,location,cluster_id,source_type,source_url,proxy,transcode,access_mode,listed,enabled,sort)
   VALUES(@id,@name,@description,@location,@cluster_id,'hls',@source_url,@proxy,0,'public',1,1,@sort)`,
)
const deleteCam = db.prepare('DELETE FROM cameras WHERE source_url=?')

db.transaction(() => {
  upsertCluster.run({
    id: findCluster.get(SLUG)?.id ?? newId(),
    slug: SLUG,
    name: CLUSTER_NAME,
    description: 'Kamera CCTV publik Pemerintah Kota Yogyakarta.',
    sort: 1,
  })
  const clusterId = findCluster.get(SLUG).id
  let added = 0
  let skipped = 0
  ok.forEach(([url, name, loc], i) => {
    if (existsCam.get(url)) {
      skipped++
      return
    }
    insertCam.run({
      id: newId(),
      name,
      description: '',
      location: loc ?? 'Kota Yogyakarta',
      cluster_id: clusterId,
      source_url: url,
      proxy: PROXY ? 1 : 0,
      sort: i,
    })
    added++
  })
  console.log(`Selesai. cluster id=${clusterId} | ditambah=${added} | dilewati(sudah ada)=${skipped}`)
})()

const total = db.prepare('SELECT COUNT(*) c FROM cameras').get().c
console.log(`Total kamera di database sekarang: ${total}`)
db.close()
