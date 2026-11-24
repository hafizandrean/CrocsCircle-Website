/**
 * CROCSCIRCLE.ID — PRE-ORDER (PO) ENGINE
 * Version: 1.2.0
 * 
 * Modul Pengelolaan Pre-Order, Pembayaran Bertahap & Pengakuan Omzet:
 * 1. Pembuatan PO Customer (Mendukung Multi-Produk).
 * 2. Pembayaran Bertahap (DP vs Pelunasan) dengan Riwayat Pembayaran Terpisah (PEMBAYARAN_PO).
 * 3. Tiga Dimensi Status Independen:
 *    - Payment Status: UNPAID, PARTIAL, PAID.
 *    - Procurement Status: NOT_ORDERED, ORDERED, IN_TRANSIT, RECEIVED.
 *    - Fulfillment Status: NOT_DELIVERED, DELIVERED, CANCELLED.
 * 4. Aturan Pengakuan Omzet Baku:
 *    - DP dan pembayaran parsial BUKAN omzet bulanan.
 *    - Omzet hanya diakui saat status pembayaran LUNAS (PAID).
 *    - Tanggal pengakuan omzet menggunakan settlement_date (tanggal pelunasan penuh).
 * 5. Integrasi Stok: Booking/Reservasi stok saat barang ada, dan pemotongan saat penyerahan (DELIVERED).
 * 6. Pembatalan: Pelepasan reservasi otomatis dan pencatatan audit refund.
 */

const POService = (function() {

  /**
   * Membuat Pesanan Pre-Order Baru (Mendukung Multi-Produk dalam 1 Batch Pemesanan)
   * 
   * @param {Object} poData
   *   - order_date: Date|string
   *   - customer_name: string
   *   - customer_contact: string (Nomor WhatsApp)
   *   - supplier: string (Vendor pengadaan)
   *   - estimated_arrival: Date|string
   *   - notes: string
   *   - created_by: string
   *   - initial_payment: Object (opsional: { amount, payment_method, notes })
   *   - items: Array of { variant_id, quantity, selling_price, notes }
   */
  function createPreOrder(poData) {
    if (!poData) throw new Error("Data PO wajib diisi.");
    if (!poData.customer_name || poData.customer_name.trim() === "") {
      throw new Error("Nama customer wajib diisi.");
    }

    // Normalisasi input jika dikirim dari single-item form
    if ((!poData.items || !Array.isArray(poData.items) || poData.items.length === 0) && poData.variant_id) {
      poData.items = [{
        variant_id: poData.variant_id,
        quantity: poData.quantity || 1,
        selling_price: poData.agreed_price !== undefined ? poData.agreed_price : poData.selling_price,
        notes: poData.notes || ""
      }];
    }

    if (!poData.supplier && poData.supplier_info) {
      poData.supplier = poData.supplier_info;
    }
    if (!poData.estimated_arrival && poData.target_eta) {
      poData.estimated_arrival = poData.target_eta;
    }

    if ((!poData.initial_payment || !poData.initial_payment.amount) && Number(poData.initial_dp) > 0) {
      poData.initial_payment = {
        amount: Number(poData.initial_dp),
        payment_method: poData.initial_dp_method || "TRANSFER_BCA",
        notes: "DP Awal Pre-Order"
      };
    }

    if (!poData.items || !Array.isArray(poData.items) || poData.items.length === 0) {
      throw new Error("PO harus memiliki minimal 1 item produk.");
    }

    return DatabaseHelper.withLock(30000, function() {
      const now = new Date();
      const orderDate = poData.order_date ? new Date(poData.order_date) : now;
      const createdBy = poData.created_by || "SYSTEM";
      const poGroupId = "POG-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);

      const createdItems = [];
      let totalOrderAmount = 0;

      // 1. Buat Baris untuk Setiap Item PO
      for (let i = 0; i < poData.items.length; i++) {
        const item = poData.items[i];
        const qty = parseInt(item.quantity, 10);
        const price = parseFloat(item.selling_price);

        if (!item.variant_id) throw new Error("Item PO ke-" + (i + 1) + " tidak memiliki variant_id.");
        if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas item PO ke-" + (i + 1) + " harus lebih dari 0.");
        if (isNaN(price) || price < 0) throw new Error("Harga jual item PO ke-" + (i + 1) + " tidak valid.");

        const subtotal = qty * price;
        totalOrderAmount += subtotal;

        const poId = "PO-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 10000) + "-" + (i + 1);

        const poRecord = {
          po_id: poId,
          order_date: orderDate,
          customer_name: poData.customer_name.trim(),
          customer_contact: poData.customer_contact || "",
          variant_id: item.variant_id,
          quantity: qty,
          selling_price: price,
          total_order: subtotal,
          supplier: poData.supplier || "",
          estimated_arrival: poData.estimated_arrival ? new Date(poData.estimated_arrival) : "",
          payment_status: "UNPAID",
          procurement_status: "NOT_ORDERED",
          fulfillment_status: "NOT_DELIVERED",
          settlement_date: "",
          notes: (poData.notes ? poData.notes + " | " : "") + "Group: " + poGroupId + (item.notes ? " | " + item.notes : ""),
          created_by: createdBy
        };

        DatabaseHelper.insertRow("PRE_ORDER", poRecord);
        createdItems.push(poRecord);
      }

      // 2. Jika ada Pembayaran Awal (DP)
      if (poData.initial_payment && Number(poData.initial_payment.amount) > 0) {
        const dpAmount = Number(poData.initial_payment.amount);
        const paymentDate = poData.initial_payment.payment_date ? new Date(poData.initial_payment.payment_date) : now;
        
        // Alokasikan DP ke item-item PO secara berurutan
        let remainingDp = dpAmount;
        createdItems.forEach(item => {
          if (remainingDp <= 0) return;
          const take = Math.min(item.total_order, remainingDp);
          remainingDp -= take;

          recordPayment(item.po_id, {
            amount: take,
            payment_method: poData.initial_payment.payment_method || "QRIS",
            payment_date: paymentDate,
            notes: (poData.initial_payment.notes || "DP Awal") + " [Group Total: " + dpAmount + "]",
            created_by: createdBy
          });
        });
      }

      DatabaseHelper.logActivity(
        createdBy,
        "CREATE_PRE_ORDER",
        "PRE_ORDER",
        poGroupId,
        "PO dibuat untuk " + poData.customer_name + " (" + createdItems.length + " item). Total tagihan: Rp" + totalOrderAmount
      );

      return {
        success: true,
        poGroupId: poGroupId,
        po_id: createdItems.length > 0 ? createdItems[0].po_id : null,
        totalOrderAmount: totalOrderAmount,
        total_amount: totalOrderAmount,
        items: createdItems
      };
    });
  }

  /**
   * Mencatat Pembayaran untuk Item PO Tertentu (DP atau Pelunasan)
   */
  function recordPayment(poId, paymentData) {
    if (!poId) throw new Error("poId wajib diisi.");
    if (!paymentData) throw new Error("paymentData wajib diisi.");

    return DatabaseHelper.withLock(30000, function() {
      const rawAmt = paymentData.amount !== undefined ? paymentData.amount : paymentData.payment_amount;
      const amount = parseFloat(rawAmt);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Nominal pembayaran harus lebih dari 0.");
      }

      const poRow = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", poId);
      if (!poRow) throw new Error("PO dengan ID " + poId + " tidak ditemukan.");

      // Cek Idempotency Key
      if (paymentData.idempotency_key) {
        const existingIdemp = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => p.notes && String(p.notes).includes(paymentData.idempotency_key));
        if (existingIdemp.length > 0) {
          const p = existingIdemp[0];
          return {
            success: true,
            idempotent: true,
            payment_id: p.payment_id,
            po_id: p.po_id,
            amount_paid: Number(p.amount) || 0,
            payment_status: poRow.payment_status,
            new_status: poRow.payment_status
          };
        }
      }

      const now = new Date();
      const paymentDate = paymentData.payment_date ? new Date(paymentData.payment_date) : now;
      const createdBy = paymentData.created_by || "SYSTEM";

      // Validasi Periode Buku: Mencegah pembayaran PO dicatat pada periode yang sudah CLOSED
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(paymentDate);
      }
      const paymentId = "POP-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);

      // 1. Simpan baris riwayat pembayaran di PEMBAYARAN_PO
      const paymentRecord = {
        payment_id: paymentId,
        po_id: poId,
        payment_date: paymentDate,
        amount: amount,
        payment_method: paymentData.payment_method || "QRIS",
        notes: (paymentData.notes || "") + (paymentData.idempotency_key ? " [IDEMP:" + paymentData.idempotency_key + "]" : ""),
        created_by: createdBy
      };
      DatabaseHelper.insertRow("PEMBAYARAN_PO", paymentRecord);

      // 2. Hitung akumulasi seluruh pembayaran untuk PO ini
      const allPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => String(p.po_id) === String(poId));
      const totalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const totalOrder = Number(poRow.total_order) || 0;
      const remainingBalance = Math.max(0, totalOrder - totalPaid);

      // 3. Tentukan status pembayaran baru dan tanggal pelunasan (settlement_date)
      let newPaymentStatus = "UNPAID";
      let settlementDate = poRow.settlement_date || "";
      let allocatedHpp = Number(poRow.allocated_hpp) || 0;
      let hppStatus = poRow.hpp_status || "PENDING_ALLOCATION";

      if (totalPaid >= totalOrder) {
        newPaymentStatus = "PAID";
        // SETTLEMENT_DATE: Pengakuan omzet baku pada tanggal pelunasan penuh!
        settlementDate = paymentDate;

        // Jika allocated_hpp belum ada, coba cari snapshot HPP dari batch persediaan aktif
        if (allocatedHpp <= 0) {
          try {
            const activeBatches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
              return String(b.variant_id) === String(poRow.variant_id) && (Number(b.remaining_qty) > 0 || Number(b.quantity) > 0);
            });
            if (activeBatches.length > 0) {
              const hppUnit = parseFloat(activeBatches[0].unit_cost) || 0;
              allocatedHpp = hppUnit * (parseInt(poRow.quantity, 10) || 1);
              hppStatus = "RECOGNIZED";
            }
          } catch (e) {}
        }
      } else if (totalPaid > 0) {
        newPaymentStatus = "PARTIAL";
        settlementDate = ""; // Belum diakui sebagai omzet
      }

      // 4. Update tabel PRE_ORDER
      DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", poId, {
        payment_status: newPaymentStatus,
        settlement_date: settlementDate,
        allocated_hpp: allocatedHpp,
        hpp_status: hppStatus
      });

      DatabaseHelper.logActivity(
        createdBy,
        "RECORD_PO_PAYMENT",
        "PRE_ORDER",
        poId,
        "Pembayaran " + paymentId + " sebesar Rp" + amount + " (" + newPaymentStatus + "). Total terbayar: Rp" + totalPaid + "/" + totalOrder
      );

      return {
        success: true,
        payment_id: paymentId,
        po_id: poId,
        amount_paid: amount,
        total_paid: totalPaid,
        total_order: totalOrder,
        remaining_balance: remainingBalance,
        payment_status: newPaymentStatus,
        new_status: newPaymentStatus,
        settlement_date: settlementDate ? (settlementDate instanceof Date ? Utilities.formatDate(settlementDate, "GMT+7", "yyyy-MM-dd") : String(settlementDate).substring(0, 10)) : ""
      };
    });
  }

  /**
   * Mengambil data PO lengkap beserta riwayat pembayarannya
   */
  function getPOById(poId) {
    if (!poId) throw new Error("poId wajib diisi.");
    const po = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", poId);
    if (!po) return null;

    const payments = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => String(p.po_id) === String(poId));
    const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalOrder = Number(po.total_order) || 0;

    return {
      po: po,
      payments: payments,
      total_paid: totalPaid,
      remaining_balance: Math.max(0, totalOrder - totalPaid)
    };
  }

  /**
   * Memperbarui Status Pengadaan Supplier (Procurement Status)
   */
  function updateProcurementStatus(poId, newStatus, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const validStatuses = ["NOT_ORDERED", "ORDERED", "IN_TRANSIT", "RECEIVED"];
      if (!validStatuses.includes(newStatus)) {
        throw new Error("Status pengadaan tidak valid: " + newStatus);
      }

      const po = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", poId);
      if (!po) throw new Error("PO " + poId + " tidak ditemukan.");

      DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", poId, {
        procurement_status: newStatus
      });

      DatabaseHelper.logActivity(createdBy, "UPDATE_PO_PROCUREMENT", "PRE_ORDER", poId, "Status pengadaan diubah menjadi " + newStatus);
      return { success: true, poId: poId, procurement_status: newStatus };
    });
  }

  /**
   * Alokasi / Booking Stok untuk PO ketika Barang Fisik Telah Tersedia
   */
  function allocateStockForPO(poId, stockCategory, createdBy) {
    const po = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", poId);
    if (!po) throw new Error("PO " + poId + " tidak ditemukan.");
    if (po.fulfillment_status === "DELIVERED" || po.fulfillment_status === "CANCELLED") {
      throw new Error("Tidak dapat mereservasi PO yang sudah selesai atau dibatalkan.");
    }

    const category = stockCategory || "OWNED";
    const res = InventoryService.reserveStock(poId, po.variant_id, po.quantity, category, createdBy);

    // Cari snapshot biaya perolehan HPP untuk varian ini dari batch persediaan aktif
    let allocatedHpp = Number(po.allocated_hpp) || 0;
    let hppStatus = po.hpp_status || "PENDING_ALLOCATION";
    try {
      const activeBatches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
        return String(b.variant_id) === String(po.variant_id) && (Number(b.remaining_qty) > 0 || Number(b.quantity) > 0);
      });
      if (activeBatches.length > 0) {
        const hppUnit = parseFloat(activeBatches[0].unit_cost) || 0;
        allocatedHpp = hppUnit * (parseInt(po.quantity, 10) || 1);
        hppStatus = "RECOGNIZED";
      }
    } catch (e) {}

    DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", poId, {
      allocated_hpp: allocatedHpp,
      hpp_status: hppStatus
    });

    DatabaseHelper.logActivity(createdBy, "ALLOCATE_PO_STOCK", "PRE_ORDER", poId, "Stok " + po.quantity + " unit berhasil di-booking untuk PO " + poId + (allocatedHpp > 0 ? " (HPP: Rp" + allocatedHpp + ")" : ""));
    return Object.assign({}, res, { allocated_hpp: allocatedHpp, hpp_status: hppStatus });
  }

  /**
   * Penyerahan Barang PO kepada Pelanggan (Fulfillment)
   */
  function fulfillPO(poId, stockCategory, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const po = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", poId);
      if (!po) throw new Error("PO " + poId + " tidak ditemukan.");
      if (po.fulfillment_status === "DELIVERED") {
        throw new Error("PO ini sudah pernah diserahkan sebelumnya.");
      }
      if (po.fulfillment_status === "CANCELLED") {
        throw new Error("Tidak dapat menyerahkan PO yang telah dibatalkan.");
      }

      const category = stockCategory || "OWNED";
      // Eksekusi pemotongan fisik & pelepasan reservasi di InventoryService
      InventoryService.fulfillReservedStock(poId, po.variant_id, po.quantity, category, createdBy);

      DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", poId, {
        fulfillment_status: "DELIVERED"
      });

      DatabaseHelper.logActivity(createdBy, "FULFILL_PO", "PRE_ORDER", poId, "Barang PO " + poId + " diserahkan kepada customer.");
      return { success: true, poId: poId, fulfillment_status: "DELIVERED" };
    });
  }

  /**
   * Pembatalan Pesanan PO & Pencatatan Refund Akumulatif
   * 
   * @param {string} poId
   * @param {string} reason
   * @param {number} [refundAmount] Nominal refund yang dikembalikan ke pelanggan (opsional)
   * @param {string} [paymentMethod] Metode pengembalian uang (misal: TRANSFER_BCA)
   * @param {string} [stockCategory] Kategori stok ('OWNED' atau 'CONSIGNMENT')
   * @param {string} [createdBy] User yang mengeksekusi
   * @param {string} [idempotencyKey]
   */
  function cancelPO(poId, reason, refundAmount, paymentMethod, stockCategory, createdBy, idempotencyKey) {
    return DatabaseHelper.withLock(30000, function() {
      const po = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", poId);
      if (!po) throw new Error("PO " + poId + " tidak ditemukan.");
      if (po.fulfillment_status === "DELIVERED") {
        throw new Error("PO yang sudah diserahkan (DELIVERED) tidak dapat dibatalkan melalui fungsi ini.");
      }
      // Cek Idempotency Key refund
      if (idempotencyKey) {
        const existingRef = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => p.notes && String(p.notes).includes(idempotencyKey));
        if (existingRef.length > 0) {
          return {
            success: true,
            idempotent: true,
            poId: poId,
            fulfillment_status: po.fulfillment_status,
            payment_status: po.payment_status
          };
        }
      }

      // Validasi pembatalan berulang
      if (po.fulfillment_status === "CANCELLED") {
        if (po.payment_status === "REFUNDED") {
          throw new Error("PO ini sudah dibatalkan dan seluruh dana telah direfund penuh (Maksimal refund sisa: Rp0).");
        }
        if (!refundAmount || parseFloat(refundAmount) <= 0) {
          throw new Error("PO ini sudah dibatalkan sebelumnya.");
        }
      }

      const now = new Date();
      const creator = createdBy || "SYSTEM";

      // 1. Hitung Seluruh Pembayaran dan Refund Sebelumnya
      const allPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => String(p.po_id) === String(poId));
      let totalPaidReceived = 0;
      let totalPreviousRefund = 0;

      allPayments.forEach(p => {
        const amt = Number(p.amount) || 0;
        if (amt > 0) totalPaidReceived += amt;
        else if (amt < 0) totalPreviousRefund += Math.abs(amt);
      });

      const maxRefundAllowed = Math.max(0, totalPaidReceived - totalPreviousRefund);
      const refundAmt = refundAmount !== undefined && refundAmount !== null ? parseFloat(refundAmount) : 0;

      // 2. Validasi Refund Akumulatif
      if (refundAmt > 0) {
        if (refundAmt > maxRefundAllowed) {
          throw new Error("Nominal refund (Rp" + refundAmt.toLocaleString("id-ID") + ") melebihi sisa dana yang dapat direfund (Rp" + maxRefundAllowed.toLocaleString("id-ID") + " dari total pembayaran diterima Rp" + totalPaidReceived.toLocaleString("id-ID") + ").");
        }

        // Catat pengembalian dana di PEMBAYARAN_PO sebagai nilai negatif
        const refundId = "REF-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
        DatabaseHelper.insertRow("PEMBAYARAN_PO", {
          payment_id: refundId,
          po_id: poId,
          payment_date: now,
          amount: -refundAmt,
          payment_method: paymentMethod || "TRANSFER_BCA",
          notes: "Refund Pembatalan PO: " + (reason || "Pembatalan pesanan") + (idempotencyKey ? " [Ref: " + idempotencyKey + "]" : ""),
          created_by: creator
        });
      }

      // 3. Lepaskan reservasi stok fisik jika belum dibatalkan sebelumnya
      let reservationReleased = false;
      if (po.fulfillment_status !== "CANCELLED") {
        try {
          if (typeof InventoryService !== "undefined" && InventoryService.releaseReservation) {
            InventoryService.releaseReservation(poId, po.variant_id, po.quantity, stockCategory || "OWNED", creator);
            reservationReleased = true;
          }
        } catch (e) {
          // Abaikan jika memang belum di-reserve
        }
      }

      // 4. Tentukan status pembayaran baru
      const newTotalRefund = totalPreviousRefund + (refundAmt > 0 ? refundAmt : 0);
      let newPaymentStatus = po.payment_status;

      if (totalPaidReceived > 0) {
        if (newTotalRefund >= totalPaidReceived) {
          newPaymentStatus = "REFUNDED";
        } else if (newTotalRefund > 0) {
          newPaymentStatus = "PARTIAL_REFUNDED";
        }
      } else {
        newPaymentStatus = "UNPAID";
      }

      // 5. Update tabel PRE_ORDER
      DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", poId, {
        fulfillment_status: "CANCELLED",
        payment_status: newPaymentStatus,
        notes: (po.notes ? po.notes + " | " : "") + "DIBATALKAN: " + (reason || "Tanpa alasan")
      });

      DatabaseHelper.logActivity(
        creator,
        "CANCEL_PO",
        "PRE_ORDER",
        poId,
        "PO " + poId + " dibatalkan. Alasan: " + reason + ". Refund: Rp" + refundAmt + " (" + newPaymentStatus + "). Reservasi dilepas: " + reservationReleased
      );

      return {
        success: true,
        poId: poId,
        fulfillment_status: "CANCELLED",
        payment_status: newPaymentStatus,
        refund_amount: refundAmt,
        total_paid_received: totalPaidReceived,
        total_refunded: newTotalRefund,
        reservation_released: reservationReleased
      };
    });
  }

  /**
   * Mengambil Daftar Pre-Order Terfilter untuk Antarmuka Admin
   * 
   * @param {Object} [filters] { payment_status, procurement_status, fulfillment_status, startDate, endDate, search }
   * @param {string} [callerToken]
   */
  function getPOList(filters, callerToken) {
    filters = filters || {};
    const allPOs = DatabaseHelper.getAllRows("PRE_ORDER");
    const allVariants = DatabaseHelper.getAllRows("VARIAN_PRODUK");
    const allProducts = DatabaseHelper.getAllRows("MASTER_PRODUK");
    const allPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PO");

    const variantMap = {};
    allVariants.forEach(v => { variantMap[v.variant_id] = v; });

    const productMap = {};
    allProducts.forEach(p => { productMap[p.product_id] = p; });

    const paymentByPo = {};
    allPayments.forEach(p => {
      if (!paymentByPo[p.po_id]) paymentByPo[p.po_id] = [];
      paymentByPo[p.po_id].push(p);
    });

    const filtered = allPOs.filter(po => {
      if (!po.po_id) return false;

      // Filter Tanggal
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        const oDate = new Date(po.order_date);
        if (oDate < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        const oDate = new Date(po.order_date);
        if (oDate > end) return false;
      }

      // Filter Status
      if (filters.payment_status && filters.payment_status !== "ALL") {
        if (String(po.payment_status).toUpperCase() !== String(filters.payment_status).toUpperCase()) return false;
      }
      if (filters.procurement_status && filters.procurement_status !== "ALL") {
        if (String(po.procurement_status).toUpperCase() !== String(filters.procurement_status).toUpperCase()) return false;
      }
      if (filters.fulfillment_status && filters.fulfillment_status !== "ALL") {
        if (String(po.fulfillment_status).toUpperCase() !== String(filters.fulfillment_status).toUpperCase()) return false;
      }

      // Filter Search
      if (filters.search) {
        const q = String(filters.search).toLowerCase();
        const v = variantMap[po.variant_id] || {};
        const p = productMap[v.product_id] || {};
        const matchId = String(po.po_id).toLowerCase().includes(q);
        const matchCust = String(po.customer_name).toLowerCase().includes(q);
        const matchPhone = String(po.customer_contact).toLowerCase().includes(q);
        const matchProd = String(p.product_name).toLowerCase().includes(q);
        const matchSku = String(v.sku).toLowerCase().includes(q);
        if (!matchId && !matchCust && !matchPhone && !matchProd && !matchSku) return false;
      }

      return true;
    });

    // Urutkan berdasarkan tanggal pemesanan menurun
    filtered.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    // Petakan dengan informasi varian dan pembayaran
    const resultList = filtered.map(po => {
      const v = variantMap[po.variant_id] || {};
      const p = productMap[v.product_id] || {};
      const payments = paymentByPo[po.po_id] || [];

      let totalPaid = 0;
      let totalRefund = 0;
      payments.forEach(pay => {
        const amt = Number(pay.amount) || 0;
        if (amt > 0) totalPaid += amt;
        else if (amt < 0) totalRefund += Math.abs(amt);
      });

      const netPaid = Math.max(0, totalPaid - totalRefund);
      const totalOrder = Number(po.total_order) || 0;
      const remainingBalance = Math.max(0, totalOrder - netPaid);

      return {
        po_id: po.po_id,
        order_date: po.order_date,
        customer_name: po.customer_name,
        customer_contact: po.customer_contact,
        variant_id: po.variant_id,
        sku: v.sku || "-",
        product_name: p.product_name || "Produk PO",
        model: p.model || "",
        color: v.color || "-",
        size: v.size || "-",
        quantity: Number(po.quantity) || 1,
        selling_price: Number(po.selling_price) || 0,
        total_order: totalOrder,
        supplier: po.supplier || "-",
        estimated_arrival: po.estimated_arrival,
        payment_status: po.payment_status,
        procurement_status: po.procurement_status,
        fulfillment_status: po.fulfillment_status,
        settlement_date: po.settlement_date,
        total_paid: netPaid,
        gross_paid: totalPaid,
        total_refund: totalRefund,
        remaining_balance: remainingBalance,
        notes: po.notes || "",
        created_by: po.created_by || "SYSTEM"
      };
    });

    return {
      success: true,
      count: resultList.length,
      pre_orders: resultList
    };
  }

  /**
   * Mengambil Omzet PO Resmi yang Diakui pada Bulan dan Tahun Tertentu
   * HANYA mengambil PO yang status pembayarannya PAID dan settlement_date berada pada periode tersebut.
   */
  function getRecognizedMonthlyPO(month, year) {
    let targetMonth, targetYear;
    if (typeof month === 'string' && month.includes('-') && (!year || isNaN(year))) {
      const parts = month.split('-');
      targetYear = parseInt(parts[0], 10);
      targetMonth = parseInt(parts[1], 10);
    } else {
      targetMonth = parseInt(month, 10);
      targetYear = parseInt(year, 10);
    }

    const paidPOs = DatabaseHelper.getAllRows("PRE_ORDER", po => {
      if (po.payment_status !== "PAID" || !po.settlement_date) return false;
      const sDate = new Date(po.settlement_date);
      return (sDate.getMonth() + 1) === targetMonth && sDate.getFullYear() === targetYear;
    });

    const totalRecognizedOmzet = paidPOs.reduce((sum, po) => sum + (Number(po.total_order) || 0), 0);
    let totalRecognizedHpp = 0;
    const pendingHppPOs = [];

    paidPOs.forEach(po => {
      const hppVal = Number(po.allocated_hpp) || 0;
      if (hppVal > 0) {
        totalRecognizedHpp += hppVal;
      } else {
        pendingHppPOs.push(po);
      }
    });

    return {
      month: targetMonth,
      year: targetYear,
      count: paidPOs.length,
      totalOmzet: totalRecognizedOmzet,
      totalHpp: totalRecognizedHpp,
      pendingHppCount: pendingHppPOs.length,
      pendingHppRecords: pendingHppPOs,
      records: paidPOs
    };
  }

  return {
    createPreOrder: createPreOrder,
    recordPayment: recordPayment,
    getPOById: getPOById,
    getPOList: getPOList,
    updateProcurementStatus: updateProcurementStatus,
    allocateStockForPO: allocateStockForPO,
    fulfillPO: fulfillPO,
    cancelPO: cancelPO,
    getRecognizedMonthlyPO: getRecognizedMonthlyPO
  };
})();
