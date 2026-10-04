import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.ROKUHARA_CONFIG || {};

const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY
);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentUser = null;
let currentProfile = null;
let currentCircle = null;
let circlesCache = [];
let recruitmentsCache = [];
let eventsCache = [];
let announcementsCache = [];
let activityCache = [];
let chatChannel = null;

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));

const formatDate = (value) => {
  if (!value) return '-';

  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

const formatShortDate = (value) => {
  if (!value) return '-';

  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

function toast(message, type = 'info') {
  const el = $('#toast');

  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('show');

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2800);
}

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function setHTML(selector, value) {
  const el = $(selector);
  if (el) el.innerHTML = value;
}

function show(selector) {
  $(selector)?.classList.remove('hidden');
}

function hide(selector) {
  $(selector)?.classList.add('hidden');
}

function toggle(selector, visible) {
  $(selector)?.classList.toggle('hidden', !visible);
}

function requireLogin() {
  if (currentUser) return true;

  toast('Login dulu untuk menggunakan fitur ini.', 'warning');
  openAuth('login');
  return false;
}

/* =========================================================
   AUTH
========================================================= */

function openAuth(mode = 'login') {
  show('#authModal');
  setAuthMode(mode);
}

function closeAuth() {
  hide('#authModal');
}

function setAuthMode(mode = 'login') {
  const isLogin = mode === 'login';

  toggle('#loginForm', isLogin);
  toggle('#registerForm', !isLogin);

  toggle('#forgotForm', mode === 'forgot');

  const authTitle = $('#authTitle');

  if (authTitle) {
    if (mode === 'register') {
      authTitle.textContent = 'Create Account';
    } else if (mode === 'forgot') {
      authTitle.textContent = 'Reset Password';
    } else {
      authTitle.textContent = 'Welcome Back';
    }
  }
}

function updateAuthUI(user, profile = null) {
  const loggedIn = Boolean(user);

  toggle('#loginBtn', !loggedIn);
  toggle('#registerBtn', !loggedIn);
  toggle('#profileBtn', loggedIn);
  toggle('#logoutBtn', loggedIn);
  toggle('#settingsBtn', loggedIn);

  const profileLabel =
    profile?.display_name ||
    profile?.username ||
    user?.email ||
    'Profile';

  setText('#profileBtn', profileLabel);

  setText(
    '#heroRokId',
    profile?.rok_id ? `#${profile.rok_id}` : '#ROKUHARA'
  );

  if (profile) {
    setText('#heroUsername', `@${profile.username || 'member'}`);
    setText('#heroDisplayName', profile.display_name || profile.username);
  }

  const role = profile?.role || 'member';

  document.body.dataset.role = role;
}

async function register() {
  const username = $('#registerUsername')?.value.trim();
  const displayName = $('#registerDisplayName')?.value.trim();
  const email = $('#registerEmail')?.value.trim();
  const password = $('#registerPassword')?.value;

  if (!username || !displayName || !email || !password) {
    toast('Semua field wajib diisi.', 'warning');
    return;
  }

  if (username.length < 3) {
    toast('Username minimal 3 karakter.', 'warning');
    return;
  }

  if (password.length < 6) {
    toast('Password minimal 6 karakter.', 'warning');
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
    toast(error.message, 'error');
    return;
  }

  if (!data.user) {
    toast('Register gagal.', 'error');
    return;
  }

  closeAuth();

  if (!data.session) {
    toast('Akun dibuat. Cek email untuk verifikasi.', 'success');
    return;
  }

  currentUser = data.user;
  await loadProfile(currentUser);

  toast('Akun berhasil dibuat!', 'success');
}

async function login() {
  const email = $('#loginEmail')?.value.trim();
  const password = $('#loginPassword')?.value;

  if (!email || !password) {
    toast('Email dan password wajib diisi.', 'warning');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  currentUser = data.user;

  closeAuth();

  await loadProfile(currentUser);

  toast('Login berhasil!', 'success');

  await refreshPrivateData();
}

async function logout() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    toast(error.message, 'error');
    return;
  }

  currentUser = null;
  currentProfile = null;

  closeAllModals();
  updateAuthUI(null);

  setHTML('#chatMessages', '');

  toast('Berhasil logout.', 'success');
}

async function forgotPassword() {
  const email = $('#forgotEmail')?.value.trim();

  if (!email) {
    toast('Masukkan email terlebih dahulu.', 'warning');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  toast('Link reset password sudah dikirim ke email.', 'success');
  setAuthMode('login');
}

/* =========================================================
   PROFILE
========================================================= */

async function loadProfile(user) {
  if (!user) {
    currentProfile = null;
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

  currentProfile = data;
  updateAuthUI(user, data);

  fillProfile(data, user);

  return data;
}

function fillProfile(profile, user = currentUser) {
  if (!profile) return;

  setText('#profileName', profile.display_name || profile.username);
  setText('#profileUsername', `@${profile.username || 'member'}`);
  setText('#profileRokId', profile.rok_id || '-');
  setText('#profileBio', profile.bio || 'Belum ada bio.');
  setText('#profileRole', roleLabel(profile.role));
  setText('#profileJoined', formatShortDate(profile.created_at));

  const email = user?.email || '-';
  setText('#profileEmail', email);

  const avatar =
    profile.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      profile.display_name || profile.username || 'R'
    )}&background=111827&color=fff`;

  const avatarEls = $$('.profile-avatar, #profileAvatar, #heroAvatar');

  avatarEls.forEach((el) => {
    if (el.tagName === 'IMG') {
      el.src = avatar;
      el.alt = profile.display_name || profile.username || 'Avatar';
    } else {
      el.style.backgroundImage = `url("${avatar}")`;
    }
  });

  const banner = $('#profileBanner');

  if (banner && profile.banner_url) {
    banner.style.backgroundImage = `url("${profile.banner_url}")`;
  }

  const editUsername = $('#editUsername');
  const editDisplayName = $('#editDisplayName');
  const editBio = $('#editBio');
  const editAvatar = $('#editAvatar');
  const editBanner = $('#editBanner');

  if (editUsername) editUsername.value = profile.username || '';
  if (editDisplayName) editDisplayName.value = profile.display_name || '';
  if (editBio) editBio.value = profile.bio || '';
  if (editAvatar) editAvatar.value = profile.avatar_url || '';
  if (editBanner) editBanner.value = profile.banner_url || '';
}

function openProfile() {
  if (!requireLogin()) return;

  fillProfile(currentProfile, currentUser);
  show('#profileModal');
}

function closeProfile() {
  hide('#profileModal');
}

function openEditProfile() {
  if (!requireLogin()) return;

  fillProfile(currentProfile, currentUser);

  toggle('#profileView', false);
  toggle('#profileEdit', true);
}

function cancelEditProfile() {
  toggle('#profileView', true);
  toggle('#profileEdit', false);
}

async function saveProfile() {
  if (!requireLogin()) return;

  const username = $('#editUsername')?.value.trim();
  const displayName = $('#editDisplayName')?.value.trim();
  const bio = $('#editBio')?.value.trim();
  const avatarUrl = $('#editAvatar')?.value.trim();
  const bannerUrl = $('#editBanner')?.value.trim();

  if (!username || !displayName) {
    toast('Username dan display name wajib diisi.', 'warning');
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      username,
      display_name: displayName,
      bio: bio || null,
      avatar_url: avatarUrl || null,
      banner_url: bannerUrl || null
    })
    .eq('id', currentUser.id)
    .select()
    .single();

  if (error) {
    toast(error.message, 'error');
    return;
  }

  currentProfile = data;

  updateAuthUI(currentUser, currentProfile);
  fillProfile(currentProfile, currentUser);

  cancelEditProfile();

  toast('Profile berhasil diperbarui.', 'success');
}

/* =========================================================
   CIRCLES
========================================================= */

async function loadCircles() {
  const { data, error } = await supabase
    .from('circles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Circle error:', error);
    setHTML(
      '#circlesGrid',
      `<div class="empty-state">Gagal memuat circle.</div>`
    );
    return;
  }

  circlesCache = data || [];

  renderCircles(circlesCache);

  setText('#circleCount', circlesCache.length);
  setText('#statCircles', circlesCache.length);
}

function renderCircles(list) {
  if (!list?.length) {
    setHTML(
      '#circlesGrid',
      `
      <div class="empty-state glass">
        <strong>Belum ada circle</strong>
        <span>Coba gunakan filter lain.</span>
      </div>
      `
    );
    return;
  }

  setHTML(
    '#circlesGrid',
    list.map((circle) => {
      const image =
        circle.avatar_url ||
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=80';

      return `
        <article class="circle-card glass" data-circle-id="${esc(circle.id)}">
          <div class="circle-cover"
            style="background-image:url('${esc(circle.banner_url || image)}')">
          </div>

          <div class="circle-card-body">
            <span class="card-tag">${esc(circle.tag || 'CIRCLE')}</span>

            <h3>${esc(circle.name)}</h3>

            <p>${esc(
              circle.description || 'Circle komunitas Rokuhara.'
            )}</p>

            <div class="card-meta">
              <span>${Number(circle.member_count || 0)} members</span>
              <span>${esc(circle.tag || 'ROK')}</span>
            </div>

            <button
              class="btn btn-primary circle-open"
              data-id="${esc(circle.id)}">
              View Circle
            </button>
          </div>
        </article>
      `;
    }).join('')
  );

  $$('.circle-open').forEach((button) => {
    button.addEventListener('click', () => {
      openCircle(button.dataset.id);
    });
  });
}

function filterCircles() {
  const search = ($('#circleSearch')?.value || '').toLowerCase().trim();
  const filter = $('#circleFilter')?.value || 'all';

  const result = circlesCache.filter((circle) => {
    const text = [
      circle.name,
      circle.description,
      circle.tag
    ]
      .join(' ')
      .toLowerCase();

    const searchMatch = !search || text.includes(search);

    let filterMatch = true;

    if (filter !== 'all') {
      filterMatch =
        String(circle.tag || '').toLowerCase() === filter.toLowerCase();
    }

    return searchMatch && filterMatch;
  });

  renderCircles(result);
}

async function openCircle(circleId) {
  const circle = circlesCache.find((item) => item.id === circleId);

  if (!circle) {
    toast('Circle tidak ditemukan.', 'error');
    return;
  }

  currentCircle = circle;

  setText('#circleModalTitle', circle.name);
  setText('#circleModalTag', circle.tag || 'CIRCLE');
  setText(
    '#circleModalDescription',
    circle.description || 'Belum ada deskripsi.'
  );
  setText('#circleModalRules', circle.rules || 'Belum ada rules.');
  setText(
    '#circleMemberCount',
    `${Number(circle.member_count || 0)} members`
  );

  const cover = $('#circleModalBanner');

  if (cover) {
    cover.style.backgroundImage = `url("${
      circle.banner_url ||
      circle.avatar_url ||
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'
    }")`;
  }

  await loadCircleMembership(circle.id);
  await loadCircleMembers(circle.id);

  show('#circleModal');
}

function closeCircle() {
  hide('#circleModal');
  currentCircle = null;
}

async function loadCircleMembership(circleId) {
  const joinBtn = $('#circleJoinBtn');

  if (!joinBtn) return;

  if (!currentUser) {
    joinBtn.textContent = 'Login to Join';
    joinBtn.dataset.action = 'login';
    return;
  }

  const { data, error } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', circleId)
    .eq('profile_id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn('Membership check:', error.message);
    joinBtn.textContent = 'Join Circle';
    joinBtn.dataset.action = 'join';
    return;
  }

  if (data) {
    joinBtn.textContent = 'Leave Circle';
    joinBtn.dataset.action = 'leave';
  } else {
    joinBtn.textContent = 'Join Circle';
    joinBtn.dataset.action = 'join';
  }
}

async function toggleCircleMembership() {
  if (!currentCircle) return;

  if (!requireLogin()) return;

  const button = $('#circleJoinBtn');
  const action = button?.dataset.action;

  if (action === 'leave') {
    const { error } = await supabase
      .from('circle_members')
      .delete()
      .eq('circle_id', currentCircle.id)
      .eq('profile_id', currentUser.id);

    if (error) {
      toast(error.message, 'error');
      return;
    }

    toast('Kamu keluar dari circle.', 'success');
  } else {
    const { error } = await supabase
      .from('circle_members')
      .insert({
        circle_id: currentCircle.id,
        profile_id: currentUser.id,
        role: 'member'
      });

    if (error) {
      toast(error.message, 'error');
      return;
    }

    toast('Berhasil join circle!', 'success');
  }

  await loadCircleMembership(currentCircle.id);
  await loadCircles();
  await loadCircleMembers(currentCircle.id);
}

async function loadCircleMembers(circleId) {
  const container = $('#circleMembersList');

  if (!container) return;

  const { data, error } = await supabase
    .from('circle_members')
    .select(`
      role,
      joined_at,
      profiles (
        id,
        username,
        display_name,
        avatar_url,
        role
      )
    `)
    .eq('circle_id', circleId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.warn('Members:', error.message);

    container.innerHTML = `
      <div class="empty-state">
        Member list belum bisa dimuat.
      </div>
    `;

    return;
  }

  if (!data?.length) {
    container.innerHTML = `
      <div class="empty-state">
        Belum ada member.
      </div>
    `;
    return;
  }

  container.innerHTML = data.map((member) => {
    const profile = member.profiles || {};

    const avatar =
      profile.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        profile.display_name || profile.username || 'R'
      )}`;

    return `
      <div class="member-row">
        <img
          class="member-avatar"
          src="${esc(avatar)}"
          alt=""
        />

        <div class="member-info">
          <strong>${esc(
            profile.display_name || profile.username || 'Member'
          )}</strong>

          <span>@${esc(profile.username || 'member')}</span>
        </div>

        <span class="role-badge">
          ${esc(member.role || 'member')}
        </span>
      </div>
    `;
  }).join('');
}

/* =========================================================
   ANNOUNCEMENTS
========================================================= */

async function loadAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      profiles (
        username,
        display_name,
        avatar_url
      )
    `)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Announcements:', error);
    setHTML(
      '#announcementsList',
      `<div class="empty-state">Gagal memuat announcement.</div>`
    );
    return;
  }

  announcementsCache = data || [];

  renderAnnouncements(announcementsCache);

  setText('#announcementCount', announcementsCache.length);
}

function renderAnnouncements(list) {
  if (!list?.length) {
    setHTML(
      '#announcementsList',
      `
      <article class="announcement glass">
        <span>Belum ada announcement.</span>
      </article>
      `
    );

    return;
  }

  setHTML(
    '#announcementsList',
    list.map((item) => {
      const author =
        item.profiles?.display_name ||
        item.profiles?.username ||
        'Rokuhara Team';

      return `
        <article class="announcement glass">
          <div class="announcement-top">
            <span class="eyebrow">
              ${esc(formatDate(item.created_at))}
            </span>

            ${
              item.pinned
                ? '<span class="status-badge">PINNED</span>'
                : ''
            }
          </div>

          <h3>${esc(item.title)}</h3>

          <p>${esc(item.content)}</p>

          <small>
            Posted by ${esc(author)}
          </small>
        </article>
      `;
    }).join('')
  );
}

/* =========================================================
   RECRUITMENT
========================================================= */

async function loadRecruitments() {
  const { data, error } = await supabase
    .from('recruitments')
    .select(`
      *,
      circles (
        name,
        tag
      ),
      profiles (
        username,
        display_name
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Recruitments:', error);
    setHTML(
      '#recruitmentsList',
      `<div class="empty-state">Gagal memuat recruitment.</div>`
    );
    return;
  }

  recruitmentsCache = data || [];

  renderRecruitments(recruitmentsCache);
}

function renderRecruitments(list) {
  if (!list.length) {
    setHTML(
      '#recruitmentsList',
      `
      <div class="empty-state glass">
        <strong>Belum ada recruitment</strong>
        <span>Belum ada circle yang membuka recruitment.</span>
      </div>
      `
    );
    return;
  }

  setHTML(
    '#recruitmentsList',
    list.map((item) => `
      <article class="recruitment-card glass">
        <div class="card-header">
          <span class="card-tag">
            ${esc(item.circles?.tag || 'RECRUITMENT')}
          </span>

          <span class="status-badge ${esc(item.status)}">
            ${esc(item.status)}
          </span>
        </div>

        <h3>${esc(item.title)}</h3>

        <p>${esc(item.description)}</p>

        ${
          item.requirements
            ? `<div class="requirements">
                <strong>Requirements</strong>
                <p>${esc(item.requirements)}</p>
              </div>`
            : ''
        }

        <div class="card-meta">
          <span>${esc(item.circles?.name || 'Circle')}</span>
          <span>${esc(formatShortDate(item.created_at))}</span>
        </div>

        <button
          class="btn btn-primary recruitment-apply"
          data-id="${esc(item.id)}"
          ${item.status !== 'open' ? 'disabled' : ''}>
          ${item.status === 'open' ? 'Apply' : 'Closed'}
        </button>
      </article>
    `).join('')
  );

  $$('.recruitment-apply').forEach((button) => {
    button.addEventListener('click', () => {
      openRecruitment(button.dataset.id);
    });
  });
}

function openRecruitment(id) {
  const item = recruitmentsCache.find((entry) => entry.id === id);

  if (!item) {
    toast('Recruitment tidak ditemukan.', 'error');
    return;
  }

  setText('#recruitmentModalTitle', item.title);
  setText(
    '#recruitmentModalCircle',
    item.circles?.name || 'Rokuhara Circle'
  );
  setText('#recruitmentModalDescription', item.description);
  setText(
    '#recruitmentModalRequirements',
    item.requirements || 'Tidak ada requirements khusus.'
  );

  const input = $('#recruitmentId');

  if (input) input.value = item.id;

  show('#recruitmentModal');
}

function closeRecruitment() {
  hide('#recruitmentModal');
}

async function submitRecruitment() {
  if (!requireLogin()) return;

  const recruitmentId = $('#recruitmentId')?.value;
  const message = $('#recruitmentMessage')?.value.trim() || null;

  if (!recruitmentId) {
    toast('Recruitment tidak valid.', 'error');
    return;
  }

  const { error } = await supabase
    .from('recruitment_applications')
    .insert({
      recruitment_id: recruitmentId,
      applicant_id: currentUser.id,
      message
    });

  if (error) {
    if (error.code === '23505') {
      toast('Kamu sudah apply recruitment ini.', 'warning');
    } else {
      toast(error.message, 'error');
    }

    return;
  }

  closeRecruitment();

  if ($('#recruitmentMessage')) {
    $('#recruitmentMessage').value = '';
  }

  toast('Application berhasil dikirim!', 'success');
}

/* =========================================================
   EVENTS
========================================================= */

async function loadEvents() {
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      profiles (
        username,
        display_name
      )
    `)
    .order('event_date', { ascending: true });

  if (error) {
    console.error('Events:', error);

    setHTML(
      '#eventsGrid',
      `<div class="empty-state">Gagal memuat event.</div>`
    );

    return;
  }

  eventsCache = data || [];

  renderEvents(eventsCache);
}

function renderEvents(list) {
  if (!list.length) {
    setHTML(
      '#eventsGrid',
      `
      <div class="empty-state glass">
        <strong>Belum ada event</strong>
        <span>Event Rokuhara akan muncul di sini.</span>
      </div>
      `
    );

    return;
  }

  setHTML(
    '#eventsGrid',
    list.map((event) => `
      <article class="event-card glass">
        <span class="card-tag">
          ${esc(event.status || 'UPCOMING')}
        </span>

        <h3>${esc(event.title)}</h3>

        <p>${esc(event.description)}</p>

        <div class="event-info">
          <span>📅 ${esc(formatDate(event.event_date))}</span>
          <span>📍 ${esc(event.location || 'Online')}</span>
          ${
            event.max_participants
              ? `<span>👥 Max ${Number(event.max_participants)}</span>`
              : ''
          }
        </div>

        <button
          class="btn btn-primary event-open"
          data-id="${esc(event.id)}">
          View Event
        </button>
      </article>
    `).join('')
  );

  $$('.event-open').forEach((button) => {
    button.addEventListener('click', () => {
      openEvent(button.dataset.id);
    });
  });
}

function openEvent(id) {
  const event = eventsCache.find((item) => item.id === id);

  if (!event) {
    toast('Event tidak ditemukan.', 'error');
    return;
  }

  setText('#eventModalTitle', event.title);
  setText('#eventModalDescription', event.description);
  setText('#eventModalDate', formatDate(event.event_date));
  setText('#eventModalLocation', event.location || 'Online');
  setText('#eventModalStatus', event.status || 'upcoming');

  const input = $('#eventId');

  if (input) input.value = event.id;

  show('#eventModal');

  loadEventParticipants(event.id);
}

function closeEvent() {
  hide('#eventModal');
}

async function loadEventParticipants(eventId) {
  const container = $('#eventParticipantsList');

  if (!container) return;

  const { data, error } = await supabase
    .from('event_participants')
    .select(`
      joined_at,
      profiles (
        username,
        display_name,
        avatar_url
      )
    `)
    .eq('event_id', eventId)
    .order('joined_at', { ascending: true });

  if (error) {
    container.innerHTML = '<span>Participant belum bisa dimuat.</span>';
    return;
  }

  if (!data?.length) {
    container.innerHTML = '<span>Belum ada participant.</span>';
    return;
  }

  container.innerHTML = data.map((row) => `
    <div class="member-row">
      <div class="member-info">
        <strong>${esc(
          row.profiles?.display_name ||
          row.profiles?.username ||
          'Member'
        )}</strong>

        <span>@${esc(row.profiles?.username || 'member')}</span>
      </div>
    </div>
  `).join('');
}

async function joinEvent() {
  if (!requireLogin()) return;

  const eventId = $('#eventId')?.value;

  if (!eventId) return;

  const { error } = await supabase
    .from('event_participants')
    .insert({
      event_id: eventId,
      profile_id: currentUser.id
    });

  if (error) {
    if (error.code === '23505') {
      toast('Kamu sudah join event ini.', 'warning');
    } else {
      toast(error.message, 'error');
    }

    return;
  }

  toast('Berhasil join event!', 'success');

  await loadEventParticipants(eventId);
}

async function leaveEvent() {
  if (!requireLogin()) return;

  const eventId = $('#eventId')?.value;

  if (!eventId) return;

  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('event_id', eventId)
    .eq('profile_id', currentUser.id);

  if (error) {
    toast(error.message, 'error');
    return;
  }

  toast('Kamu keluar dari event.', 'success');

  await loadEventParticipants(eventId);
}

/* =========================================================
   CHAT
========================================================= */

async function loadChatMessages(circleId = null) {
  const container = $('#chatMessages');

  if (!container || !currentUser) return;

  let query = supabase
    .from('chat_messages')
    .select(`
      *,
      profiles (
        username,
        display_name,
        avatar_url
      )
    `)
    .order('created_at', { ascending: true })
    .limit(100);

  if (circleId) {
    query = query.eq('circle_id', circleId);
  } else {
    query = query.is('circle_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Chat:', error);
    container.innerHTML = `
      <div class="empty-state">
        Chat gagal dimuat.
      </div>
    `;
    return;
  }

  renderChatMessages(data || []);
}

function renderChatMessages(messages) {
  const container = $('#chatMessages');

  if (!container) return;

  if (!messages.length) {
    container.innerHTML = `
      <div class="empty-state">
        Belum ada pesan.
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map((message) => {
    const own = message.sender_id === currentUser?.id;

    const name =
      message.profiles?.display_name ||
      message.profiles?.username ||
      'Member';

    return `
      <div class="chat-message ${own ? 'own' : ''}">
        <div class="chat-author">
          ${esc(name)}
        </div>

        <div class="chat-content">
          ${esc(message.content)}
        </div>

        <time>
          ${esc(formatDate(message.created_at))}
        </time>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
  if (!requireLogin()) return;

  const input = $('#chatInput');
  const content = input?.value.trim();

  if (!content) return;

  const circleId = currentCircle?.id || null;

  const { error } = await supabase
    .from('chat_messages')
    .insert({
      sender_id: currentUser.id,
      circle_id: circleId,
      content
    });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  input.value = '';
}

function openChat(circleId = null) {
  if (!requireLogin()) return;

  if (circleId) {
    currentCircle =
      circlesCache.find((circle) => circle.id === circleId) ||
      currentCircle;
  }

  setText(
    '#chatTitle',
    currentCircle ? `${currentCircle.name} Chat` : 'Rokuhara Community Chat'
  );

  show('#chatModal');

  loadChatMessages(currentCircle?.id || null);
  subscribeChat(currentCircle?.id || null);
}

function closeChat() {
  hide('#chatModal');

  if (chatChannel) {
    supabase.removeChannel(chatChannel);
    chatChannel = null;
  }
}

function subscribeChat(circleId = null) {
  if (!currentUser) return;

  if (chatChannel) {
    supabase.removeChannel(chatChannel);
  }

  chatChannel = supabase
    .channel(`rokuhara-chat-${circleId || 'global'}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: circleId
          ? `circle_id=eq.${circleId}`
          : 'circle_id=is.null'
      },
      () => {
        loadChatMessages(circleId);
      }
    )
    .subscribe();
}

/* =========================================================
   ACTIVITY
========================================================= */

async function loadActivities() {
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      profiles (
        username,
        display_name,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('Activities:', error.message);
    return;
  }

  activityCache = data || [];

  renderActivities(activityCache);
}

function renderActivities(list) {
  const container = $('#activityList');

  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        Belum ada aktivitas.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((item) => `
    <div class="activity-row">
      <div>
        <strong>
          ${esc(
            item.profiles?.display_name ||
            item.profiles?.username ||
            'Member'
          )}
        </strong>

        <p>${esc(item.content)}</p>
      </div>

      <time>${esc(formatDate(item.created_at))}</time>
    </div>
  `).join('');
}

/* =========================================================
   SETTINGS
========================================================= */

async function loadSettings() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('profile_id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn('Settings:', error.message);
    return;
  }

  if (!data) return;

  const notifications = $('#settingNotifications');
  const publicProfile = $('#settingPublicProfile');
  const online = $('#settingOnline');

  if (notifications) {
    notifications.checked = data.notifications_enabled;
  }

  if (publicProfile) {
    publicProfile.checked = data.public_profile;
  }

  if (online) {
    online.checked = data.show_online;
  }
}

async function saveSettings() {
  if (!requireLogin()) return;

  const payload = {
    profile_id: currentUser.id,
    notifications_enabled:
      $('#settingNotifications')?.checked ?? true,
    public_profile:
      $('#settingPublicProfile')?.checked ?? true,
    show_online:
      $('#settingOnline')?.checked ?? true,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('user_settings')
    .upsert(payload, {
      onConflict: 'profile_id'
    });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  toast('Settings berhasil disimpan.', 'success');
}

async function changePassword() {
  if (!requireLogin()) return;

  const password = $('#newPassword')?.value;
  const confirm = $('#confirmPassword')?.value;

  if (!password || !confirm) {
    toast('Isi password baru dan konfirmasi.', 'warning');
    return;
  }

  if (password.length < 6) {
    toast('Password minimal 6 karakter.', 'warning');
    return;
  }

  if (password !== confirm) {
    toast('Konfirmasi password tidak cocok.', 'warning');
    return;
  }

  const { error } = await supabase.auth.updateUser({
    password
  });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  if ($('#newPassword')) $('#newPassword').value = '';
  if ($('#confirmPassword')) $('#confirmPassword').value = '';

  toast('Password berhasil diubah.', 'success');
}

function openSettings() {
  if (!requireLogin()) return;

  show('#settingsModal');
  loadSettings();
}

function closeSettings() {
  hide('#settingsModal');
}

/* =========================================================
   ADMIN
========================================================= */

function getAdminRole() {
  return currentProfile?.role || 'member';
}

function isAdmin() {
  return [
    'founder',
    'group_owner',
    'event_admin'
  ].includes(getAdminRole());
}

function canManageCommunity() {
  return [
    'founder',
    'group_owner'
  ].includes(getAdminRole());
}

function canManageEvents() {
  return [
    'founder',
    'event_admin'
  ].includes(getAdminRole());
}

function openAdmin() {
  if (!requireLogin()) return;

  if (!isAdmin()) {
    toast('Kamu tidak punya akses admin.', 'error');
    return;
  }

  show('#adminModal');

  const role = getAdminRole();

  setText('#adminRole', roleLabel(role));

  toggle('#adminCommunityTools', canManageCommunity());
  toggle('#adminEventTools', canManageEvents());
}

function closeAdmin() {
  hide('#adminModal');
}

function roleLabel(role) {
  const roles = {
    member: 'Member',
    event_admin: 'Event Admin',
    group_owner: 'Group Owner',
    founder: 'Founder'
  };

  return roles[role] || 'Member';
}

/*
 * Catatan:
 * CRUD admin yang benar-benar aman harus memakai RLS/server-side.
 * Frontend hanya menampilkan panel berdasarkan role yang diterima
 * dari database. Jangan simpan secret/service-role key di browser.
 */

/* =========================================================
   NOTIFICATIONS
========================================================= */

async function loadNotifications() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn('Notifications:', error.message);
    return;
  }

  renderNotifications(data || []);
}

function renderNotifications(list) {
  const container = $('#notificationsList');

  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        Tidak ada notification.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((item) => `
    <div class="notification-row ${item.read ? '' : 'unread'}">
      <strong>${esc(item.title)}</strong>
      <p>${esc(item.content)}</p>
      <time>${esc(formatDate(item.created_at))}</time>
    </div>
  `).join('');
}

async function markNotificationsRead() {
  if (!currentUser) return;

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('profile_id', currentUser.id)
    .eq('read', false);

  if (error) {
    console.warn(error.message);
    return;
  }

  await loadNotifications();
}

/* =========================================================
   STATS
========================================================= */

async function loadStats() {
  const [
    circlesResult,
    announcementsResult,
    eventsResult,
    profilesResult
  ] = await Promise.all([
    supabase.from('circles').select('id', { count: 'exact', head: true }),
    supabase
      .from('announcements')
      .select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
  ]);

  if (circlesResult.count != null) {
    setText('#statCircles', circlesResult.count);
  }

  if (announcementsResult.count != null) {
    setText('#statAnnouncements', announcementsResult.count);
  }

  if (eventsResult.count != null) {
    setText('#statEvents', eventsResult.count);
  }

  if (profilesResult.count != null) {
    setText('#statMembers', profilesResult.count);
  }
}

/* =========================================================
   REALTIME
========================================================= */

function subscribeRealtime() {
  supabase
    .channel('rokuhara-announcements')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'announcements'
      },
      () => {
        loadAnnouncements();
      }
    )
    .subscribe();

  supabase
    .channel('rokuhara-circles')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'circles'
      },
      () => {
        loadCircles();
      }
    )
    .subscribe();

  supabase
    .channel('rokuhara-recruitments')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'recruitments'
      },
      () => {
        loadRecruitments();
      }
    )
    .subscribe();

  supabase
    .channel('rokuhara-events')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events'
      },
      () => {
        loadEvents();
      }
    )
    .subscribe();

  if (currentUser) {
    supabase
      .channel(`rokuhara-notifications-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${currentUser.id}`
        },
        () => {
          loadNotifications();
          toast('Kamu punya notification baru.', 'info');
        }
      )
      .subscribe();
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {
  $$('.nav-link[data-section]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      const target = link.dataset.section;
      const section = document.getElementById(target);

      if (section) {
        section.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }

      $('#mobileMenu')?.classList.remove('open');
    });
  });

  $('#mobileMenuBtn')?.addEventListener('click', () => {
    $('#mobileMenu')?.classList.toggle('open');
  });
}

/* =========================================================
   MODAL HELPERS
========================================================= */

function closeAllModals() {
  $$('.modal').forEach((modal) => {
    modal.classList.add('hidden');
  });
}

function setupModalClosing() {
  $$('.modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

/* =========================================================
   GLOBAL EVENT HANDLERS
========================================================= */

function setupEvents() {
  $('#loginBtn')?.addEventListener('click', () => openAuth('login'));

  $('#registerBtn')?.addEventListener(
    'click',
    () => openAuth('register')
  );

  $('#heroRegister')?.addEventListener(
    'click',
    () => openAuth('register')
  );

  $('#closeAuth')?.addEventListener('click', closeAuth);

  $('#switchRegister')?.addEventListener(
    'click',
    () => setAuthMode('register')
  );

  $('#switchLogin')?.addEventListener(
    'click',
    () => setAuthMode('login')
  );

  $('#switchForgot')?.addEventListener(
    'click',
    () => setAuthMode('forgot')
  );

  $('#switchLoginFromForgot')?.addEventListener(
    'click',
    () => setAuthMode('login')
  );

  $('#submitLogin')?.addEventListener('click', login);

  $('#submitRegister')?.addEventListener(
    'click',
    register
  );

  $('#submitForgot')?.addEventListener(
    'click',
    forgotPassword
  );

  $('#logoutBtn')?.addEventListener('click', logout);

  $('#profileBtn')?.addEventListener(
    'click',
    openProfile
  );

  $('#closeProfile')?.addEventListener(
    'click',
    closeProfile
  );

  $('#editProfileBtn')?.addEventListener(
    'click',
    openEditProfile
  );

  $('#cancelProfileEdit')?.addEventListener(
    'click',
    cancelEditProfile
  );

  $('#saveProfileBtn')?.addEventListener(
    'click',
    saveProfile
  );

  $('#profileLogout')?.addEventListener(
    'click',
    logout
  );

  $('#settingsBtn')?.addEventListener(
    'click',
    openSettings
  );

  $('#closeSettings')?.addEventListener(
    'click',
    closeSettings
  );

  $('#saveSettingsBtn')?.addEventListener(
    'click',
    saveSettings
  );

  $('#changePasswordBtn')?.addEventListener(
    'click',
    changePassword
  );

  $('#closeCircle')?.addEventListener(
    'click',
    closeCircle
  );

  $('#circleJoinBtn')?.addEventListener(
    'click',
    toggleCircleMembership
  );

  $('#circleChatBtn')?.addEventListener(
    'click',
    () => currentCircle && openChat(currentCircle.id)
  );

  $('#circleMembersBtn')?.addEventListener(
    'click',
    () => {
      if (currentCircle) {
        show('#membersModal');
      }
    }
  );

  $('#closeMembers')?.addEventListener(
    'click',
    () => hide('#membersModal')
  );

  $('#closeRecruitment')?.addEventListener(
    'click',
    closeRecruitment
  );

  $('#submitRecruitment')?.addEventListener(
    'click',
    submitRecruitment
  );

  $('#closeEvent')?.addEventListener(
    'click',
    closeEvent
  );

  $('#joinEventBtn')?.addEventListener(
    'click',
    joinEvent
  );

  $('#leaveEventBtn')?.addEventListener(
    'click',
    leaveEvent
  );

  $('#closeChat')?.addEventListener(
    'click',
    closeChat
  );

  $('#sendChatBtn')?.addEventListener(
    'click',
    sendChatMessage
  );

  $('#chatInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendChatMessage();
    }
  });

  $('#closeAdmin')?.addEventListener(
    'click',
    closeAdmin
  );

  $('#adminBtn')?.addEventListener(
    'click',
    openAdmin
  );

  $('#refresh')?.addEventListener(
    'click',
    refreshAll
  );

  $('#markNotificationsRead')?.addEventListener(
    'click',
    markNotificationsRead
  );

  $('#circleSearch')?.addEventListener(
    'input',
    filterCircles
  );

  $('#circleFilter')?.addEventListener(
    'change',
    filterCircles
  );

  $('#discord')?.setAttribute(
    'href',
    config.DISCORD_URL || '#'
  );

  $('#whatsapp')?.setAttribute(
    'href',
    config.WHATSAPP_URL || '#'
  );
}

/* =========================================================
   REFRESH
========================================================= */

async function refreshPrivateData() {
  if (!currentUser) return;

  await Promise.allSettled([
    loadNotifications(),
    loadSettings()
  ]);
}

async function refreshAll() {
  const refreshButton = $('#refresh');

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  await Promise.allSettled([
    loadCircles(),
    loadAnnouncements(),
    loadRecruitments(),
    loadEvents(),
    loadActivities(),
    loadStats(),
    refreshPrivateData()
  ]);

  if (refreshButton) {
    refreshButton.disabled = false;
  }

  toast('Data diperbarui.', 'success');
}

/* =========================================================
   DATABASE STATUS
========================================================= */

async function checkDatabase() {
  setText('#dbStatus', 'Database: connecting...');

  const { error } = await supabase
    .from('circles')
    .select('id')
    .limit(1);

  if (error) {
    console.error('Database:', error);

    setText('#dbStatus', 'Database: error');
    return false;
  }

  setText('#dbStatus', 'Database: connected');
  return true;
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {
  setupEvents();
  setupNavigation();
  setupModalClosing();

  const dbReady = await checkDatabase();

  if (!dbReady) {
    toast('Database belum bisa terhubung.', 'error');
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  currentUser = session?.user || null;

  await Promise.allSettled([
    loadCircles(),
    loadAnnouncements(),
    loadRecruitments(),
    loadEvents(),
    loadActivities(),
    loadStats()
  ]);

  if (currentUser) {
    await loadProfile(currentUser);
    await refreshPrivateData();
  } else {
    updateAuthUI(null);
  }

  supabase.auth.onAuthStateChange(
    async (_event, sessionState) => {
      currentUser = sessionState?.user || null;

      if (currentUser) {
        await loadProfile(currentUser);
        await refreshPrivateData();
      } else {
        currentProfile = null;
        updateAuthUI(null);
      }
    }
  );

  subscribeRealtime();

  console.log('Rokuhara V5 initialized.');
}

init();