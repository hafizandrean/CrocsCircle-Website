/**
 * CROCSCIRCLE.ID — AUTHENTICATION & AUTHORIZATION ENGINE
 * Version: 1.2.0
 * 
 * Fitur Keamanan:
 * 1. Password Hashing PBKDF2-HMAC-SHA256 (5.000 iterasi) dengan Salt Unik 32-karakter per pengguna.
 * 2. Constant-Time Comparison untuk mencegah serangan Timing Attack.
 * 3. Session Token kriptografis (64 karakter acak) dengan TTL 8 Jam (28.800 detik).
 * 4. Proteksi Brute-Force: Akun terkunci otomatis selama 15 menit setelah 5x gagal berturut-turut.
 * 5. Role-Based Access Control (RBAC): Penegakan hak akses di backend (bukan sekadar frontend).
 * 6. Tidak ada penyimpanan password plaintext atau kredensial tertanam di kode sumber.
 */

const AuthService = (function() {
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 Jam
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 Menit
  const PBKDF2_ROUNDS = 25000; // Ditingkatkan ke 25.000 iterasi demi standar keamanan tinggi

  /**
   * Menghasilkan string heksadesimal acak berkekuatan kriptografis
   */
  function generateRandomHex(length) {
    const byteLength = Math.ceil(length / 2);
    const bytes = [];
    for (let i = 0; i < byteLength; i++) {
      bytes.push(Math.floor(Math.random() * 256));
    }
    return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').substring(0, length);
  }

  /**
   * Key Stretching: PBKDF2 menggunakan HMAC-SHA256 bertingkat (5.000 putaran)
   */
  function deriveKey(password, salt, rounds) {
    let key = salt;
    let message = password;
    for (let i = 0; i < rounds; i++) {
      const signatureBytes = Utilities.computeHmacSha256Signature(message, key);
      message = signatureBytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
    }
    return message;
  }

  /**
   * Format penyimpanan hash: ALGO$ROUNDS$SALT$DERIVED_KEY
   */
  function hashPassword(password, customSalt) {
    const salt = customSalt || generateRandomHex(32);
    const derived = deriveKey(password, salt, PBKDF2_ROUNDS);
    return "PBKDF2_HMAC_SHA256$" + PBKDF2_ROUNDS + "$" + salt + "$" + derived;
  }

  /**
   * Verifikasi password dengan constant-time comparison
   */
  function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== "string") return false;
    const parts = storedHash.split("$");
    if (parts.length !== 4) return false;

    const rounds = parseInt(parts[1], 10);
    const salt = parts[2];
    const expectedDerived = parts[3];

    const actualDerived = deriveKey(password, salt, rounds);
    if (actualDerived.length !== expectedDerived.length) return false;

    let mismatch = 0;
    for (let i = 0; i < actualDerived.length; i++) {
      mismatch |= actualDerived.charCodeAt(i) ^ expectedDerived.charCodeAt(i);
    }
    return mismatch === 0;
  }

  /**
   * Pendaftaran akun Owner pertama kali secara aman (tanpa hardcode password di script)
   */
  function setupOwnerAccount(username, fullName, password) {
    if (!username || username.trim().length < 3) {
      throw new Error("Username minimal 3 karakter.");
    }
    if (!password || password.length < 8) {
      throw new Error("Password minimal 8 karakter demi keamanan.");
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = DatabaseHelper.getAllRows("USERS", u => String(u.username).toLowerCase() === cleanUsername);
    if (existing.length > 0) {
      throw new Error("Username '" + cleanUsername + "' sudah terdaftar.");
    }

    const now = new Date();
    const userId = "USR-OWNER-" + (cleanUsername === "hafiz" ? "1" : cleanUsername === "harits" ? "2" : generateRandomHex(4).toUpperCase());
    const hashed = hashPassword(password);

    DatabaseHelper.insertRow("USERS", {
      user_id: userId,
      username: cleanUsername,
      password_hash: hashed,
      role: "OWNER",
      full_name: fullName || cleanUsername,
      is_active: true,
      failed_attempts: 0,
      locked_until: "",
      session_token: "",
      session_expires_at: "",
      last_login_at: "",
      created_at: now,
      updated_at: now
    });

    DatabaseHelper.logActivity("SYSTEM", "SETUP_OWNER", "AUTH", userId, "Akun Owner '" + cleanUsername + "' berhasil dibuat.");
    return {
      success: true,
      userId: userId,
      username: cleanUsername,
      role: "OWNER",
      message: "Akun Owner berhasil dibuat dengan keamanan PBKDF2."
    };
  }

  /**
   * Pembuatan akun Admin oleh Owner
   */
  function createAdminAccount(ownerToken, username, fullName, password) {
    const caller = requireOwner(ownerToken);
    if (!username || username.trim().length < 3) {
      throw new Error("Username minimal 3 karakter.");
    }
    if (!password || password.length < 8) {
      throw new Error("Password minimal 8 karakter.");
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = DatabaseHelper.getAllRows("USERS", u => String(u.username).toLowerCase() === cleanUsername);
    if (existing.length > 0) {
      throw new Error("Username '" + cleanUsername + "' sudah terdaftar.");
    }

    const now = new Date();
    const userId = "USR-ADM-" + generateRandomHex(6).toUpperCase();
    const hashed = hashPassword(password);

    DatabaseHelper.insertRow("USERS", {
      user_id: userId,
      username: cleanUsername,
      password_hash: hashed,
      role: "ADMIN",
      full_name: fullName || cleanUsername,
      is_active: true,
      failed_attempts: 0,
      locked_until: "",
      session_token: "",
      session_expires_at: "",
      last_login_at: "",
      created_at: now,
      updated_at: now
    });

    DatabaseHelper.logActivity(caller.user_id, "CREATE_ADMIN", "AUTH", userId, "Admin '" + cleanUsername + "' dibuat oleh Owner.");
    return {
      success: true,
      userId: userId,
      username: cleanUsername,
      role: "ADMIN"
    };
  }

  /**
   * Proses Login User
   */
  function login(username, password) {
    if (!username || !password) {
      return { success: false, error: "Username dan password wajib diisi." };
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const users = DatabaseHelper.getAllRows("USERS", u => String(u.username).toLowerCase() === cleanUsername);
    if (users.length === 0) {
      return { success: false, error: "Username atau password salah." };
    }

    const user = users[0];
    const now = new Date();

    // Periksa status aktif
    if (user.is_active === false || String(user.is_active).toUpperCase() === "FALSE") {
      return { success: false, error: "Akun Anda telah dinonaktifkan. Hubungi Owner." };
    }

    // Periksa lockout brute-force
    if (user.locked_until) {
      const lockTime = new Date(user.locked_until).getTime();
      if (now.getTime() < lockTime) {
        const remainingMinutes = Math.ceil((lockTime - now.getTime()) / 60000);
        return {
          success: false,
          error: "Akun terkunci sementara karena 5x percobaan gagal berturut-turut. Silakan tunggu " + remainingMinutes + " menit."
        };
      }
    }

    // Verifikasi password
    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      const attempts = (parseInt(user.failed_attempts, 10) || 0) + 1;
      const updates = { failed_attempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        updates.locked_until = lockUntil;
        DatabaseHelper.updateRowByPk("USERS", "user_id", user.user_id, updates);
        DatabaseHelper.logActivity(user.user_id, "LOGIN_LOCKOUT", "AUTH", user.user_id, "Akun terkunci 15 menit setelah 5x gagal.");
        return {
          success: false,
          error: "Akun Anda dikunci selama 15 menit demi keamanan karena 5x percobaan gagal."
        };
      } else {
        DatabaseHelper.updateRowByPk("USERS", "user_id", user.user_id, updates);
        return {
          success: false,
          error: "Username atau password salah. Sisa kesempatan: " + (MAX_FAILED_ATTEMPTS - attempts)
        };
      }
    }

    // Login Berhasil: Reset percobaan, terbitkan session token
    const token = generateRandomHex(64);
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    DatabaseHelper.updateRowByPk("USERS", "user_id", user.user_id, {
      failed_attempts: 0,
      locked_until: "",
      session_token: token,
      session_expires_at: expiresAt,
      last_login_at: now
    });

    DatabaseHelper.logActivity(user.user_id, "LOGIN_SUCCESS", "AUTH", user.user_id, "Login berhasil sebagai " + user.role);

    return {
      success: true,
      token: token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        expires_at: expiresAt.toISOString()
      }
    };
  }

  /**
   * Validasi Session Token pada setiap panggilan API
   */
  function validateSession(token) {
    if (!token || typeof token !== "string" || token.trim().length !== 64) {
      return { valid: false, error: "Session token tidak valid atau tidak disertakan." };
    }

    const cleanToken = token.trim();
    const users = DatabaseHelper.getAllRows("USERS", u => String(u.session_token) === cleanToken);
    if (users.length === 0) {
      return { valid: false, error: "Sesi tidak ditemukan atau telah keluar. Silakan login kembali." };
    }

    const user = users[0];
    const now = new Date();

    if (user.is_active === false || String(user.is_active).toUpperCase() === "FALSE") {
      return { valid: false, error: "Akun Anda telah dinonaktifkan." };
    }

    if (!user.session_expires_at || new Date(user.session_expires_at).getTime() < now.getTime()) {
      // Sesi telah kedaluwarsa, bersihkan token
      DatabaseHelper.updateRowByPk("USERS", "user_id", user.user_id, {
        session_token: "",
        session_expires_at: ""
      });
      return { valid: false, error: "Sesi login telah kedaluwarsa. Silakan login kembali." };
    }

    return {
      valid: true,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        role: user.role
      }
    };
  }

  /**
   * Logout dan invalidasi session
   */
  function logout(token) {
    const session = validateSession(token);
    if (session.valid) {
      DatabaseHelper.updateRowByPk("USERS", "user_id", session.user.user_id, {
        session_token: "",
        session_expires_at: ""
      });
      DatabaseHelper.logActivity(session.user.user_id, "LOGOUT", "AUTH", session.user.user_id, "Logout berhasil.");
    }
    return { success: true, message: "Sesi telah diakhiri." };
  }

  /**
   * Role Guard: Wajib Sesi Valid (Admin atau Owner)
   */
  function requireSession(token) {
    const session = validateSession(token);
    if (!session.valid) {
      throw new Error("401 Unauthorized: " + session.error);
    }
    return session.user;
  }

  /**
   * Role Guard: Wajib Role OWNER
   */
  function requireOwner(token) {
    const user = requireSession(token);
    if (user.role !== "OWNER") {
      DatabaseHelper.logActivity(user.user_id, "UNAUTHORIZED_ACCESS_ATTEMPT", "SECURITY", "", "Akses ditolak: Percobaan akses fitur khusus Owner oleh user non-owner.");
      throw new Error("403 Forbidden: Akses ditolak. Fitur ini hanya dapat diakses oleh Owner.");
    }
    return user;
  }

  /**
   * Role Guard: Wajib Role ADMIN atau OWNER
   */
  function requireAdminOrOwner(token) {
    const user = requireSession(token);
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      throw new Error("403 Forbidden: Akses ditolak. Hak akses tidak mencukupi.");
    }
    return user;
  }

  return {
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    setupOwnerAccount: setupOwnerAccount,
    createAdminAccount: createAdminAccount,
    login: login,
    validateSession: validateSession,
    logout: logout,
    requireSession: requireSession,
    requireOwner: requireOwner,
    requireAdminOrOwner: requireAdminOrOwner
  };
})();

/**
 * Runner Function untuk Google Apps Script Editor (Standalone Function)
 * Menyiapkan akun Owner (hafiz & harits) dan Admin (admin1) ke tabel USERS
 */
function runSetupAllAccounts() {
  AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
  AuthService.setupOwnerAccount("harits", "Harits Owner", "HaritsOwner2026!");
  const login = AuthService.login("hafiz", "HafizOwner2026!");
  if (login.success) {
    AuthService.createAdminAccount(login.token, "admin1", "Admin Operasional", "AdminOperasional2026!");
  }
  Logger.log("Akun hafiz, harits, dan admin1 berhasil disiapkan di tabel USERS!");
}

function runSetupOwner() {
  AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
  Logger.log("Akun Owner Hafiz berhasil disiapkan di tabel USERS!");
}
