// CrocsCircle.ID — Admin Authentication Client Script (Vanilla JS)

const AUTH_CONFIG = {
  TOKEN_KEY: "crocscircle_admin_token",
  USER_KEY: "crocscircle_admin_user",
  API_LOGIN: "/api/login",
  API_SESSION: "/api/session",
  API_LOGOUT: "/api/logout"
};

// Toggle password visibility
function togglePasswordVisibility() {
  const pwdInput = document.getElementById("passwordInput");
  const icon = document.getElementById("togglePasswordIcon");
  if (!pwdInput || !icon) return;

  if (pwdInput.type === "password") {
    pwdInput.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    pwdInput.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

// Handle login form submission
async function handleLoginSubmit(event) {
  event.preventDefault();

  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const errorAlert = document.getElementById("loginErrorAlert");
  const errorMsg = document.getElementById("loginErrorMessage");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError("Username dan password wajib diisi.");
    return;
  }

  // Set loading state
  errorAlert.style.display = "none";
  submitBtn.disabled = true;
  btnText.style.display = "none";
  btnSpinner.style.display = "inline-flex";

  try {
    const response = await fetch(AUTH_CONFIG.API_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (result.success && result.token) {
      // Simpan session token & user info
      sessionStorage.setItem(AUTH_CONFIG.TOKEN_KEY, result.token);
      sessionStorage.setItem(AUTH_CONFIG.USER_KEY, JSON.stringify(result.user));

      // Redirect ke dashboard admin
      window.location.href = "admin.html";
    } else {
      showError(result.error || "Gagal masuk. Periksa kembali username dan password Anda.");
    }
  } catch (err) {
    showError("Terjadi kendala koneksi ke server. Silakan coba lagi.");
  } finally {
    submitBtn.disabled = false;
    btnText.style.display = "inline-flex";
    btnSpinner.style.display = "none";
  }

  function showError(msg) {
    errorMsg.innerText = msg;
    errorAlert.style.display = "flex";
  }
}

// Check if user is already logged in
document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
  if (token) {
    try {
      const res = await fetch(AUTH_CONFIG.API_SESSION, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success && data.user) {
        // User already has valid session, redirect directly to admin portal
        window.location.href = "admin.html";
      } else {
        // Token invalid or expired, clear storage
        sessionStorage.removeItem(AUTH_CONFIG.TOKEN_KEY);
        sessionStorage.removeItem(AUTH_CONFIG.USER_KEY);
      }
    } catch (e) {
      // Ignore network errors on login page
    }
  }
});
