// app.js
// Zentrale Logik: Auth-Check, Login, Logout, Hilfsfunktionen

// ─── AUTH-CHECK ───────────────────────────────────────────────
// Diese Funktion wird auf trainer.html und swimmer.html aufgerufen.
// Sie prüft, ob der Nutzer eingeloggt ist und die richtige Rolle hat.
async function checkAuth(requiredRole) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  // Rolle aus der users-Tabelle laden
  const { data: userData, error } = await db
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error || !userData) {
    await db.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  // Falsche Rolle → weiterleiten
  if (userData.role !== requiredRole) {
    if (userData.role === 'trainer') {
      window.location.href = 'trainer.html';
    } else {
      window.location.href = 'swimmer.html';
    }
    return null;
  }

  return session.user;
}

// ─── LOGOUT ───────────────────────────────────────────────────
async function logout() {
  await db.auth.signOut();
  window.location.href = 'login.html';
}

// ─── DATUM FORMATIEREN ────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── ZEIT FORMATIEREN (Sekunden → mm:ss,hh) ──────────────────
function formatTime(seconds) {
  if (!seconds && seconds !== 0) return '–';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const h = Math.round((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')},${String(h).padStart(2, '0')}`;
}

// ─── ZEIT PARSEN (mm:ss,hh → Sekunden) ──────────────────────
function parseTime(str) {
  // Erlaubt: 1:23,45 oder 1:23.45
  const match = str.trim().match(/^(\d+):(\d{2})[,.](\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
}

// ─── FEHLERMELDUNG ANZEIGEN ───────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}
function hideError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('visible');
}

// ─── TAB-NAVIGATION ───────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
  // Ersten Tab aktivieren
  const first = document.querySelector('.tab-btn');
  if (first) first.click();
}
