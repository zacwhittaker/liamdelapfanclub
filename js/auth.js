(function () {
  'use strict';

  const cfg = window.LDFC_CONFIG;
  if (!cfg || !window.supabase) return;

  const supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  function discordAvatar(user) {
    const meta = user.user_metadata || {};
    if (meta.avatar_url && String(meta.avatar_url).indexOf('http') === 0) return meta.avatar_url;
    if (meta.picture) return meta.picture;
    const id = meta.provider_id || meta.sub;
    if (id && meta.avatar) {
      return 'https://cdn.discordapp.com/avatars/' + id + '/' + meta.avatar + '.png?size=128';
    }
    return null;
  }

  function displayName(user) {
    const meta = user.user_metadata || {};
    return meta.full_name || meta.name || meta.preferred_username || meta.custom_claims?.global_name || 'Member';
  }

  async function isInGuild(providerToken) {
    if (!providerToken) return false;
    try {
      const res = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: 'Bearer ' + providerToken },
      });
      if (!res.ok) return false;
      const guilds = await res.json();
      return guilds.some(function (g) {
        return g.id === cfg.discordGuildId;
      });
    } catch (e) {
      return false;
    }
  }

  async function verifyMember(session) {
    if (!session) return false;
    const ok = await isInGuild(session.provider_token);
    if (!ok) {
      await supabase.auth.signOut();
      return false;
    }
    return true;
  }

  function renderHeader(session, user) {
    const el = document.getElementById('site-auth');
    if (!el) return;

    if (session && user) {
      const avatar = discordAvatar(user);
      const name = displayName(user);
      el.innerHTML =
        '<a href="profile.html" class="site-auth__avatar" title="' +
        escapeHtml(name) +
        '">' +
        (avatar
          ? '<img src="' + escapeHtml(avatar) + '" alt="" width="40" height="40">'
          : '<span class="site-auth__initial">' + escapeHtml(name.charAt(0)) + '</span>') +
        '</a>';
      return;
    }

    el.innerHTML =
      '<a href="profile.html" class="site-auth__login" aria-label="Log in with Discord">' +
      '<img src="assets/DiscordLogo.png" alt="" width="22" height="22">' +
      '</a>';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loginWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: cfg.siteUrl + '/profile.html',
        scopes: 'identify guilds',
      },
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  }

  function renderProfile(state) {
    const root = document.getElementById('profile-root');
    if (!root) return;

    if (state.status === 'loading') {
      root.innerHTML = '<p class="profile-status">Loading…</p>';
      return;
    }

    if (state.status === 'guest') {
      root.innerHTML =
        '<div class="profile-card profile-card--center">' +
        '<p class="profile-card__lead">Sign in with Discord to view your profile. You must be in the LDFC server.</p>' +
        '<button type="button" class="apply-btn profile-login-btn" id="profile-login-btn">' +
        '<span class="apply-btn__label">Login with Discord</span>' +
        '<span class="apply-btn__icon-wrap" aria-hidden="true">' +
        '<img src="assets/DiscordLogo.png" alt="" class="apply-btn__icon" width="34" height="34">' +
        '</span></button></div>';
      document.getElementById('profile-login-btn')?.addEventListener('click', loginWithDiscord);
      return;
    }

    if (state.status === 'denied') {
      root.innerHTML =
        '<div class="profile-card profile-card--center profile-card--error">' +
        '<h2 class="profile-card__title">Not in the server</h2>' +
        '<p class="profile-card__lead">You need to be a member of the Liam Delap Fan Club Discord to sign in here.</p>' +
        '<a href="' +
        escapeHtml(cfg.discordInvite) +
        '" class="footer-cta" target="_blank" rel="noopener noreferrer">Join Discord</a>' +
        '</div>';
      return;
    }

    if (state.status === 'member' && state.user) {
      const user = state.user;
      const avatar = discordAvatar(user);
      const name = displayName(user);
      const meta = user.user_metadata || {};
      root.innerHTML =
        '<div class="profile-card">' +
        '<div class="profile-card__hero">' +
        (avatar
          ? '<span class="logo-glow logo-glow--profile"><img src="' +
            escapeHtml(avatar) +
            '" alt="" width="96" height="96"></span>'
          : '') +
        '<h2 class="profile-card__title">' +
        escapeHtml(name) +
        '</h2>' +
        (meta.preferred_username
          ? '<p class="profile-card__handle">@' + escapeHtml(meta.preferred_username) + '</p>'
          : '') +
        '</div>' +
        '<dl class="profile-meta">' +
        '<div class="profile-meta__row"><dt>Discord ID</dt><dd>' +
        escapeHtml(meta.provider_id || user.id) +
        '</dd></div>' +
        '<div class="profile-meta__row"><dt>Server</dt><dd>LDFC member</dd></div>' +
        '</dl>' +
        '<button type="button" class="profile-logout" id="profile-logout-btn">Log out</button>' +
        '</div>';
      document.getElementById('profile-logout-btn')?.addEventListener('click', logout);
    }
  }

  async function refreshUI() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      const member = await verifyMember(session);
      if (!member) {
        renderHeader(null, null);
        renderProfile({ status: 'denied' });
        return;
      }
      renderHeader(session, session.user);
      renderProfile({ status: 'member', user: session.user });
      return;
    }

    renderHeader(null, null);
    if (document.getElementById('profile-root')) {
      renderProfile({ status: 'guest' });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('profile-root')) {
      renderProfile({ status: 'loading' });
    }
    refreshUI();

    supabase.auth.onAuthStateChange(function () {
      refreshUI();
    });
  });

  window.LDFC_AUTH = {
    login: loginWithDiscord,
    logout: logout,
  };
})();
