/**
 * CROCSCIRCLE.ID — COMPREHENSIVE DATA CROSS-CHECK & MAPPING AUDIT
 * Melakukan verifikasi silang (cross-reference) seluruh baris transaksi Excel.
 */

// 1. PENJUALAN BULAN OKTOBER
// Di sheet Bulan Oktober:
// - Total Omzet Offline: 0
// - Total Omzet PO Lunas: 290.000 (Adat Classic 280k + Adat Gbits 10k)
// - Total HPP: 124.000 (Adat Classic 120k + Adat Gbits 4k)
// - Laba Kotor: 166.000
// - Beban Operasional: 61.000 (Bensin 50k + Tol 11k)
// - Laba Bersih: 105.000
// - Gaji Hafiz (20%): 21.000
// - Gaji Harits (20%): 21.000
// - Sisa Keuntungan (60%): 63.000
// - Dana Darurat (10% dari sisa): 6.300

console.log("=== CROSS-CHECK OKTOBER 2026 ===");
const oktOmzet = 290000;
const oktHPP = 124000;
const oktLabaKotor = oktOmzet - oktHPP;
const oktBeban = 50000 + 11000;
const oktLabaBersih = oktLabaKotor - oktBeban;
console.log("Omzet:", oktOmzet);
console.log("HPP:", oktHPP);
console.log("Laba Kotor:", oktLabaKotor);
console.log("Beban Operasional:", oktBeban);
console.log("Laba Bersih:", oktLabaBersih);
console.log("Gaji Hafiz 20%:", oktLabaBersih * 0.2);
console.log("Gaji Harits 20%:", oktLabaBersih * 0.2);
console.log("Sisa Laba:", oktLabaBersih * 0.6);

// 2. PENJUALAN BULAN NOVEMBER
// Di sheet Bulan November:
// A. Offline Sales: 25 baris transaksi
// - 01 Nov (Mingguan 1): Loopy 380k, Gbits 20k, Gbits 20k = 420.000
// - 08 Nov (Mingguan 2): Loopy 380k, Loopy 380k, Mcqueen 380k, Classic 280k, Bape 380k, Gbits 6 baris (110k) = 1.910.000
// - 15 Nov (Mingguan 3):
//   - Classic Abu M6: 250k
//   - Classic Light Grey M8: 280k
//   - Loopy Pink M5: 380k
//   - Loopy Pink M4: 380k
//   - Bape Hitam M7: 380k
//   - Platform Bone M6: 350k
//   - Classic Abu M7: 280k
//   - Classic Hitam M8: 280k
//   - Gbits: 3 baris @ 20k = 60k
//   Total Offline 15 Nov = 2.640.000
// Total Omzet Offline = 420.000 + 1.910.000 + 2.640.000 = 4.970.000!

console.log("\n=== CROSS-CHECK NOVEMBER 2026: OFFLINE SALES ===");
const mingguan1 = 380000 + 20000 + 20000;
const mingguan2 = 380000 + 380000 + 380000 + 280000 + 380000 + 20000*5 + 10000;
const mingguan3 = 250000 + 280000 + 380000 + 380000 + 380000 + 350000 + 280000 + 280000 + 20000*3;
console.log("Mingguan 1 (01 Nov):", mingguan1);
console.log("Mingguan 2 (08 Nov):", mingguan2);
console.log("Mingguan 3 (15 Nov):", mingguan3);
console.log("Total Omzet Offline:", mingguan1 + mingguan2 + mingguan3);

// B. PO Lunas di Bulan November:
// 1. Daniandra: 380.000 (Tgl Pesan 01 Nov, Lunas 14 Nov)
// 2. Ica: 390.000 (Tgl Pesan 01 Nov, Lunas 01 Nov)
// 3. bu desi: 380.000 (Tgl Pesan 06 Nov, Lunas 08 Nov)
// 4. Bu Ira: 280.000 (Tgl Pesan 06 Nov, Lunas 15 Nov)
// 5. ka hasbi: 280.000 (Tgl Pesan 10 Nov, Lunas 15 Nov)
// 6. Ozan: 20.000 (13 Nov)
// 7. Ozan: 20.000 (13 Nov)
// 8. Ka rida: 350.000 (15 Nov)
// 9. Adeknya Harits: 100.000 (16 Nov - Gbits 5 pcs @ 20k)
// Total PO Lunas di sheet Bulan November = 380k + 390k + 380k + 280k + 280k + 20k + 20k + 350k + 100k = 2.200.000!

console.log("\n=== CROSS-CHECK NOVEMBER 2026: PO LUNAS ===");
const poLunasNov = 380000 + 390000 + 380000 + 280000 + 280000 + 20000 + 20000 + 350000 + 100000;
console.log("Total Omzet PO Lunas:", poLunasNov);
console.log("TOTAL OMZET NOVEMBER (Offline + PO):", (mingguan1 + mingguan2 + mingguan3) + poLunasNov);

// C. PO yang MASIH DP (Belum Lunas):
// 1. bu ii: Harga 350k, DP 175k (Sisa 175k)
// 2. Ibu Koko (M7): Harga 380k, DP 350k (Sisa 30k)
// 3. Ibu Koko (M3): Harga 380k, DP 350k (Sisa 30k)
// 4. Ka Ozi: Harga 450k, DP 170k (Sisa 280k)
// Total DP Masuk dari PO Belum Lunas = 175k + 350k + 350k + 170k = 1.045.000!
console.log("\n=== PO STATUS DP (BELUM LUNAS / RESTRICTED CASH) ===");
console.log("Total DP Belum Lunas: Rp", (175000 + 350000 + 350000 + 170000).toLocaleString('id-ID'));
