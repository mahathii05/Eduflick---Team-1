/* ============================================================
   EduFlick AI — login.html logic
   Requirement #1: register/login flow
   ============================================================ */

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const message = document.getElementById("form-message");

function showMessage(text, kind) {
  message.textContent = text;
  message.className = "form-message" + (kind ? ` form-message--${kind}` : "");
}

function showLogin() {
  tabLogin.classList.add("tab--active");
  tabRegister.classList.remove("tab--active");
  loginForm.hidden = false;
  registerForm.hidden = true;
  showMessage("", null);
}

function showRegister() {
  tabRegister.classList.add("tab--active");
  tabLogin.classList.remove("tab--active");
  registerForm.hidden = false;
  loginForm.hidden = true;
  showMessage("", null);
}

tabLogin.addEventListener("click", showLogin);
tabRegister.addEventListener("click", showRegister);

// If the visitor already has a session, skip straight to the
// right onboarding step (or the roadmap if they're all set up).
(async function redirectIfSignedIn() {
  const session = await getSession();
  if (session) {
    const profile = await getProfile(session.user.id);
    routeForProfile(profile);
  }
})();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("Signing in…", null);

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  const profile = await getProfile(data.user.id);
  routeForProfile(profile);
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("Creating your account…", null);

  const name     = document.getElementById("register-name").value.trim();
  const email    = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  // ── NEW: read the selected role from the role cards ──────
  const role = document.querySelector('input[name="role"]:checked')?.value ?? "student";
  // ─────────────────────────────────────────────────────────

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  // If "Confirm email" is enabled in Supabase Auth settings,
  // there's no session yet — ask the learner to verify first.
  if (!data.session) {
    showMessage("Account created. Check your email to confirm, then log in.", "ok");
    showLogin();
    return;
  }

  // ── NEW: save the chosen role to the profiles table ──────
  // The handle_new_user trigger already created the profiles row.
  // This upsert simply adds the role to it.
  if (data.user) {
    const { error: profileError } = await sb
      .from("profiles")
      .upsert({ id: data.user.id, full_name: name, role: role });

    if (profileError) {
      console.error("Could not save role:", profileError.message);
    }
  }
  // ─────────────────────────────────────────────────────────

  // Email confirmation disabled (recommended for this prototype):
  // the on_auth_user_created trigger has already created the
  // profiles row, so send the learner straight to track selection.
  routeForProfile({ onboarding_complete: false, track_id: null, role: role });
});
