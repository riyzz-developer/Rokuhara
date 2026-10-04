import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.ROKUHARA_CONFIG || {};
const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY
);

const $ = (selector) => document.querySelector(selector);

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');

  setTimeout(() => {
    el.classList.remove('show');
  }, 2500);
}

function openAuth(mode = 'login') {
  $('#authModal').classList.remove('hidden');
  setAuthMode(mode);
}

function closeAuth() {
  $('#authModal').classList.add('hidden');
}

function setAuthMode(mode) {
  const login = mode === 'login';

  $('#loginForm').classList.toggle('hidden', !login);
  $('#registerForm').classList.toggle('hidden', login);
}

function updateAuthUI(user, profile = null) {
  const loggedIn = !!user;

  $('#loginBtn').classList.toggle('hidden', loggedIn);
  $('#registerBtn').classList.toggle('hidden', loggedIn);
  $('#profileBtn').classList.toggle('hidden', !loggedIn);
  $('#logoutBtn').classList.toggle('hidden', !loggedIn);

  if (profile?.rok_id) {
    $('#heroRokId').textContent = `#${profile.rok_id}`;
  } else {
    $('#heroRokId').textContent = '#ROKUHARA';
  }

  if (loggedIn) {
    $('#profileBtn').textContent =
      profile?.display_name ||
      profile?.username ||
      user.email ||
      'Profile';

    fillProfile(profile, user);
  }
}

function fillProfile(profile, user) {
  if (!profile) return;

  const name =
    profile.display_name ||
    profile.username ||
    user?.email ||
    'Rokuhara Member';

  const username = profile.username || 'username';
  const rokId = profile.rok_id || 'ROKUHARA';
  const bio = profile.bio || 'Belum ada bio.';
  const role = profile.role || 'member';

  $('#profileName').textContent = name;
  $('#profileUsername').textContent = `@${username}`;
  $('#profileRokId').textContent = `#${rokId}`;
  $('#profileBio').textContent = bio;

  $('#profileRole').textContent = {
    founder: 'Founder',
    group_owner: 'Group Owner',
    event_admin: 'Event Admin',
    member: 'Member'
  }[role] || 'Member';

  $('#profileJoined').textContent = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : '-';

  const initial = name.trim().charAt(0).toUpperCase() || 'R';
  $('#profileAvatar').textContent = initial;
}

function openProfile() {
  $('#profileModal').classList.remove('hidden');
}

function closeProfile() {
  $('#profileModal').classList.add('hidden');
}

function openEditProfile() {
  $('#editDisplayName').value =
    $('#profileName').textContent || '';

  const bio = $('#profileBio').textContent.trim();

  $('#editBio').value =
    bio === 'Belum ada bio.' ? '' : bio;

  $('#editProfileForm').classList.remove('hidden');
  $('#editProfileBtn').classList.add('hidden');
}

function cancelEditProfile() {
  $('#editProfileForm').classList.add('hidden');
  $('#editProfileBtn').classList.remove('hidden');
}

async function saveProfile() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    toast('Lu harus login dulu.');
    return;
  }

  const displayName = $('#editDisplayName').value.trim();
  const bio = $('#editBio').value.trim();

  if (!displayName) {
    toast('Display name wajib diisi.');
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      bio: bio || null
    })
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) {
    console.error('Update profile error:', error);
    toast(error.message);
    return;
  }

  fillProfile(data, user);
  updateAuthUI(user, data);

  $('#editProfileForm').classList.add('hidden');
  $('#editProfileBtn').classList.remove('hidden');

  toast('Profile berhasil diperbarui!');
}

async function loadProfile(user) {
  if (!user) {
    updateAuthUI(null);
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Profile error:', error);
    updateAuthUI(user);
    return null;
  }

  updateAuthUI(user, data);
  return data;
}

async function register() {
  const username = $('#registerUsername').value.trim();
  const displayName = $('#registerDisplayName').value.trim();
  const email = $('#registerEmail').value.trim();
  const password = $('#registerPassword').value;

  if (!username || !displayName || !email || !password) {
    toast('Semua field wajib diisi.');
    return;
  }

  if (password.length < 6) {
    toast('Password minimal 6 karakter.');
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: displayName
      }
    }
  });

  if (error) {
    toast(error.message);
    return;
  }

  if (!data.user) {
    toast('Register gagal.');
    return;
  }



  toast('Akun berhasil dibuat!');
  closeAuth();

  await loadProfile(data.user);
}

async function login() {
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;

  if (!email || !password) {
    toast('Email dan password wajib diisi.');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    toast(error.message);
    return;
  }

  toast('Login berhasil!');
  closeAuth();

  await loadProfile(data.user);
}

async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    toast(error.message);
    return;
  }

  updateAuthUI(null);
  toast('Berhasil logout.');
}

async function loadCircles() {
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  $('#circlesGrid').innerHTML = (data || []).map((circle) => `
    <article class="glass">
      <span class="card-tag">${esc(circle.tag || 'CIRCLE')}</span>
      <h3>${esc(circle.name)}</h3>
      <p>${esc(circle.description || 'Rokuhara Circle')}</p>
      <small>${Number(circle.member_count || 0)} members</small>
    </article>
  `).join('');
}

async function loadAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  $('#announcementsList').innerHTML = data?.length
    ? data.map((item) => `
        <article class="announcement glass">
          <span class="eyebrow">
            ${new Date(item.created_at).toLocaleString('id-ID')}
          </span>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.content)}</p>
        </article>
      `).join('')
    : `
      <article class="announcement glass">
        <span>Belum ada announcement.</span>
      </article>
    `;
}

async function init() {
  $('#dbStatus').textContent = 'Database: connecting...';

  const { data: { session } } = await supabase.auth.getSession();

  $('#dbStatus').textContent = 'Database: connected';

  await Promise.all([
    loadCircles(),
    loadAnnouncements(),
    loadProfile(session?.user || null)
  ]);

  supabase.auth.onAuthStateChange(async (_event, sessionState) => {
    await loadProfile(sessionState?.user || null);
  });
}

$('#profileBtn').onclick = openProfile;
$('#closeProfile').onclick = closeProfile;
$('#profileLogout').onclick = logout;

$('#editProfileBtn').onclick = openEditProfile;
$('#cancelProfileEdit').onclick = cancelEditProfile;
$('#saveProfileBtn').onclick = saveProfile;

$('#profileModal').addEventListener('click', (event) => {
  if (event.target.id === 'profileModal') {
    closeProfile();
  }
});

$('#loginBtn').onclick = () => openAuth('login');
$('#registerBtn').onclick = () => openAuth('register');
$('#heroRegister').onclick = () => openAuth('register');
$('#closeAuth').onclick = closeAuth;

$('#switchRegister').onclick = () => setAuthMode('register');
$('#switchLogin').onclick = () => setAuthMode('login');

$('#submitLogin').onclick = login;
$('#submitRegister').onclick = register;
$('#logoutBtn').onclick = logout;

$('#refresh').onclick = async () => {
  await Promise.all([
    loadCircles(),
    loadAnnouncements()
  ]);

  toast('Data diperbarui.');
};

$('#discord').href = config.DISCORD_URL || '#';
$('#whatsapp').href = config.WHATSAPP_URL || '#';

$('#authModal').addEventListener('click', (event) => {
  if (event.target.id === 'authModal') {
    closeAuth();
  }
});

init();
