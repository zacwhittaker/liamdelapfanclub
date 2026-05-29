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

  const guildId = String(cfg.discordGuildId);

  function memberCacheKey(userId) {
    return 'ldfc_member_' + userId + '_' + guildId;
  }

  function isMemberCached(userId) {
    return localStorage.getItem(memberCacheKey(userId)) === '1';
  }

  function setMemberCached(userId) {
    localStorage.setItem(memberCacheKey(userId), '1');
  }

  function clearMemberCached(userId) {
    localStorage.removeItem(memberCacheKey(userId));
  }

  /** @returns {Promise<boolean|null>} true = in guild, false = not in guild, null = could not verify */
  async function isInGuild(providerToken) {
    if (!providerToken) return null;
    try {
      const res = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: 'Bearer ' + providerToken },
      });
      if (!res.ok) return null;
      const guilds = await res.json();
      return guilds.some(function (g) {
        return String(g.id) === guildId;
      });
    } catch (e) {
      return null;
    }
  }

  /** @returns {Promise<'member'|'denied'|'pending'>} */
  async function verifyMember(session) {
    if (!session?.user) return 'pending';

    const userId = session.user.id;
    if (isMemberCached(userId)) return 'member';

    if (!session.provider_token) return 'pending';

    const inGuild = await isInGuild(session.provider_token);
    if (inGuild === true) {
      setMemberCached(userId);
      return 'member';
    }
    if (inGuild === false) {
      clearMemberCached(userId);
      await supabase.auth.signOut();
      return 'denied';
    }

    return isMemberCached(userId) ? 'member' : 'pending';
  }

  function renderHeader(session, user) {
    const link = document.getElementById('site-auth-trigger');
    const pfp = document.getElementById('site-auth-pfp');
    if (!link || !pfp) return;

    if (session && user) {
      const avatar = discordAvatar(user);
      const name = displayName(user);
      link.classList.add('site-auth__link--active');
      link.setAttribute('aria-label', name);
      link.title = name;

      if (avatar) {
        pfp.innerHTML = '<img id="site-auth-img" src="' + escapeHtml(avatar) + '" alt="">';
      } else {
        pfp.innerHTML =
          '<span class="site-auth__initial">' + escapeHtml(name.charAt(0).toUpperCase()) + '</span>';
      }
      return;
    }

    link.classList.remove('site-auth__link--active');
    link.setAttribute('aria-label', 'Profile');
    link.removeAttribute('title');
    pfp.innerHTML = '<img id="site-auth-img" src="assets/ProfileIcon.png" alt="">';
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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) clearMemberCached(session.user.id);
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

  let refreshInFlight = null;
  let confirmedMemberId = null;

  async function refreshUI() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async function () {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        confirmedMemberId = null;
        renderHeader(null, null);
        if (document.getElementById('profile-root')) {
          renderProfile({ status: 'guest' });
        }
        return;
      }

      const status = await verifyMember(session);

      if (status === 'member') {
        confirmedMemberId = session.user.id;
        renderHeader(session, session.user);
        renderProfile({ status: 'member', user: session.user });
        return;
      }

      if (status === 'denied') {
        confirmedMemberId = null;
        renderHeader(null, null);
        renderProfile({ status: 'denied' });
        return;
      }

      if (confirmedMemberId === session.user.id) {
        renderHeader(session, session.user);
        renderProfile({ status: 'member', user: session.user });
        return;
      }

      if (document.getElementById('profile-root')) {
        renderProfile({ status: 'loading' });
      }
    })().finally(function () {
      refreshInFlight = null;
    });

    return refreshInFlight;
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
