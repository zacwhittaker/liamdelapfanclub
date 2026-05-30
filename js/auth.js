(function () {
  'use strict';

  const cfg = window.LDFC_CONFIG;
  if (!cfg || !window.supabase) return;

  function asset(path) {
    if (window.LDFC_ASSET) return window.LDFC_ASSET(path);
    var root = window.LDFC_SITE_ROOT || '/';
    return root + String(path).replace(/^\//, '');
  }

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
  const VERIFIED_USER_KEY = 'ldfc_verified_user';
  let refreshInFlight = null;
  let refreshQueued = false;
  let confirmedMemberId = null;

  function supabaseStorageKey() {
    try {
      const ref = new URL(cfg.supabaseUrl).hostname.split('.')[0];
      return 'sb-' + ref + '-auth-token';
    } catch (e) {
      return null;
    }
  }

  function clearClientAuthState() {
    confirmedMemberId = null;
    localStorage.removeItem(VERIFIED_USER_KEY);

    var i;
    for (i = sessionStorage.length - 1; i >= 0; i--) {
      var sk = sessionStorage.key(i);
      if (sk && sk.indexOf('ldfc_') === 0) sessionStorage.removeItem(sk);
    }
    for (i = localStorage.length - 1; i >= 0; i--) {
      var lk = localStorage.key(i);
      if (lk && lk.indexOf('ldfc_member_') === 0) localStorage.removeItem(lk);
    }

    var authKey = supabaseStorageKey();
    if (authKey) localStorage.removeItem(authKey);
  }

  function isMemberCached(userId) {
    return localStorage.getItem(VERIFIED_USER_KEY) === userId;
  }

  function setMemberCached(userId) {
    localStorage.setItem(VERIFIED_USER_KEY, userId);
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

    if (session.provider_token) {
      const inGuild = await isInGuild(session.provider_token);
      if (inGuild === true) {
        setMemberCached(userId);
        return 'member';
      }
      if (inGuild === false) {
        clearClientAuthState();
        await supabase.auth.signOut({ scope: 'global' });
        return 'denied';
      }
    }

    if (isMemberCached(userId)) return 'member';
    return 'pending';
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
    pfp.innerHTML = '<img id="site-auth-img" src="' + asset('assets/ProfileIcon.png') + '" alt="">';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loginWithDiscord() {
    clearClientAuthState();
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      /* ignore — may already be signed out */
    }
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: cfg.siteUrl + '/profile/',
        scopes: 'identify guilds',
      },
    });
  }

  async function logout() {
    clearClientAuthState();
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      /* ignore */
    }
    window.location.href = window.LDFC_SITE_ROOT || cfg.siteUrl + '/';
  }

  async function fetchMemberStats() {
    const fn = cfg.profileFunction || 'get-profile';
    try {
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) {
        return { ok: false, reason: error.message || 'invoke_failed' };
      }
      if (data && data.error) {
        return { ok: false, reason: data.error, status: data.status };
      }
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, reason: 'network' };
    }
  }

  function formatJoined(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      return iso;
    }
  }

  function statBlock(label, value) {
    return (
      '<div class="profile-stat">' +
      '<span class="profile-stat__label">' +
      escapeHtml(label) +
      '</span>' +
      '<span class="profile-stat__value">' +
      escapeHtml(value) +
      '</span></div>'
    );
  }

  function renderBadges(badges) {
    if (!badges || !badges.length) {
      return '<span class="profile-badge">MEMBER</span>';
    }
    return badges
      .map(function (b) {
        return '<span class="profile-badge">' + escapeHtml(String(b)) + '</span>';
      })
      .join('');
  }

  function renderAuraGraph(history) {
    if (!history || !history.length) {
      return (
        '<svg class="profile-aura-graph" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true">' +
        '<polyline points="0,40 40,28 80,32 120,20 160,24 200,12" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '</svg>'
      );
    }
    var max = Math.max.apply(null, history);
    var min = Math.min.apply(null, history);
    var range = max - min || 1;
    var points = history
      .map(function (v, i) {
        var x = (i / (history.length - 1 || 1)) * 200;
        var y = 44 - ((v - min) / range) * 36;
        return x + ',' + y;
      })
      .join(' ');
    return (
      '<svg class="profile-aura-graph" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' +
      points +
      '" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '</svg>'
    );
  }

  function buildMemberDashboard(user, stats, statsState) {
    const meta = user.user_metadata || {};
    const fallbackAvatar = discordAvatar(user);
    const fallbackName = displayName(user);

    const u = (stats && stats.user) || {};
    const p = (stats && stats.prestige) || {};
    const fm = (stats && stats.lastfm) || {};
    const perks = (stats && stats.perks) || {};
    const role = perks.personal_role || u.top_role || {};

    const avatar = u.avatar_url || fallbackAvatar;
    const name = u.display_name || fallbackName;
    const handle = u.username || meta.preferred_username || '';
    const rankTitle = role.name || p.tier || 'Member';
    const rankNum = p.rank != null ? p.rank : '—';
    const auraScore = p.aura_display || (p.aura != null ? String(p.aura) : '—');
    const auraTier = p.tier || 'Unranked';
    const topPercent = p.top_percent != null ? p.top_percent : null;
    const progressLabel = p.progress_label || (topPercent != null ? 'Top ' + topPercent + '% of server' : '');
    const prestigeId =
      p.prestige_id || 'MEMBER #' + String(u.id || meta.provider_id || user.id);

    var statsNotice = '';
    if (statsState === 'loading') {
      statsNotice =
        '<p class="profile-dash__notice">Loading server stats from the LDFC bot…</p>';
    } else if (statsState === 'unavailable') {
      statsNotice =
        '<p class="profile-dash__notice">Server stats are not connected yet. Your friend still needs to deploy the bot profile API — basic Discord info is shown below.</p>';
    } else if (statsState === 'error') {
      statsNotice =
        '<p class="profile-dash__notice profile-dash__notice--warn">Could not load server stats right now. Try again in a moment.</p>';
    }

    var nowPlaying = fm.now_playing || {};
    var trackLabel = nowPlaying.track
      ? nowPlaying.track + (nowPlaying.artist ? ' — ' + nowPlaying.artist : '')
      : 'Nothing playing';
    var topArtist = fm.top_artist || '—';
    var musicLinked = fm.linked !== false && (fm.username || fm.top_artist);

    return (
      '<div class="profile-dash">' +
      statsNotice +
      '<div class="profile-dash__grid">' +
      '<section class="profile-dash__card profile-dash__card--main" style="--profile-rim:' +
      escapeHtml(p.rim_color || role.color || '#1f49ff') +
      '">' +
      '<div class="profile-dash__identity">' +
      (avatar
        ? '<img class="profile-dash__avatar" src="' + escapeHtml(avatar) + '" alt="">'
        : '<span class="profile-dash__avatar profile-dash__avatar--initial">' +
          escapeHtml(name.charAt(0).toUpperCase()) +
          '</span>') +
      '<div class="profile-dash__identity-text">' +
      '<h2 class="profile-dash__name">' +
      escapeHtml(name) +
      '</h2>' +
      (handle ? '<p class="profile-dash__handle">@' + escapeHtml(handle) + '</p>' : '') +
      '<p class="profile-dash__rank-title">' +
      escapeHtml(rankTitle) +
      '</p>' +
      '<span class="profile-dash__rank-pill">RANK #' +
      escapeHtml(String(rankNum)) +
      '</span></div></div>' +
      '<div class="profile-dash__badges">' +
      '<span class="profile-dash__badges-label">Badges</span>' +
      '<div class="profile-dash__badges-list">' +
      renderBadges(p.badges) +
      '</div></div>' +
      '<div class="profile-dash__stats">' +
      statBlock('Messages', p.messages != null ? p.messages : '—') +
      statBlock('Voice time', p.voice_time || '0h') +
      statBlock('Joined', formatJoined(u.joined_at)) +
      statBlock('Warnings', p.warnings != null ? p.warnings : '—') +
      statBlock('Reputation', p.reputation_percent != null ? p.reputation_percent + '%' : '—') +
      statBlock('Reps', p.reps != null ? p.reps : '—') +
      '</div>' +
      '<p class="profile-dash__prestige-id">' +
      escapeHtml(prestigeId) +
      '</p></section>' +
      '<div class="profile-dash__side">' +
      '<section class="profile-dash__card profile-dash__card--aura">' +
      '<p class="profile-dash__card-label">Aura score</p>' +
      '<p class="profile-dash__aura-score">' +
      escapeHtml(String(auraScore)) +
      '</p>' +
      '<p class="profile-dash__aura-meta">' +
      escapeHtml(auraTier) +
      ' · Rank #' +
      escapeHtml(String(rankNum)) +
      (topPercent != null ? ' · Top ' + topPercent + '% of server' : '') +
      '</p>' +
      (progressLabel
        ? '<div class="profile-dash__progress"><div class="profile-dash__progress-bar" style="width:' +
          escapeHtml(String(Math.min(100, topPercent || p.progress_percent || 0))) +
          '%"></div></div><p class="profile-dash__progress-label">' +
          escapeHtml(progressLabel) +
          '</p>'
        : '') +
      renderAuraGraph(p.aura_history || p.history) +
      '</section>' +
      '<section class="profile-dash__card profile-dash__card--music">' +
      '<p class="profile-dash__card-label">Music identity</p>' +
      (musicLinked
        ? '<div class="profile-dash__music-row">' +
          (nowPlaying.image_url
            ? '<img class="profile-dash__music-art" src="' +
              escapeHtml(nowPlaying.image_url) +
              '" alt="">'
            : '<span class="profile-dash__music-art profile-dash__music-art--empty"></span>') +
          '<div><p class="profile-dash__music-heading">Now playing</p><p class="profile-dash__music-value">' +
          escapeHtml(trackLabel) +
          '</p></div></div>' +
          '<div class="profile-dash__music-row">' +
          '<span class="profile-dash__music-art profile-dash__music-art--empty"></span>' +
          '<div><p class="profile-dash__music-heading">Top artist</p><p class="profile-dash__music-value">' +
          escapeHtml(topArtist) +
          '</p></div></div>'
        : '<p class="profile-dash__music-empty">No Last.fm account linked in Discord yet.</p>') +
      '<p class="profile-dash__music-footer">LDFC profile system</p></section></div></div>' +
      '<button type="button" class="profile-logout" id="profile-logout-btn">Log out</button></div>'
    );
  }

  async function renderMemberProfile(user) {
    const root = document.getElementById('profile-root');
    if (!root) return;

    root.innerHTML = buildMemberDashboard(user, null, 'loading');
    document.getElementById('profile-logout-btn')?.addEventListener('click', logout);

    const result = await fetchMemberStats();
    if (result.ok) {
      root.innerHTML = buildMemberDashboard(user, result.data, 'ready');
    } else if (result.reason && String(result.reason).indexOf('not configured') !== -1) {
      root.innerHTML = buildMemberDashboard(user, null, 'unavailable');
    } else {
      root.innerHTML = buildMemberDashboard(user, null, 'error');
    }
    document.getElementById('profile-logout-btn')?.addEventListener('click', logout);
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
        '<img src="' + asset('assets/DiscordLogo.png') + '" alt="" class="apply-btn__icon" width="34" height="34">' +
        '</span></button></div>';
      document.getElementById('profile-login-btn')?.addEventListener('click', loginWithDiscord);
      return;
    }

    if (state.status === 'denied') {
      root.innerHTML =
        '<div class="profile-card profile-card--center profile-card--error">' +
        '<h2 class="profile-card__title">Not in the server</h2>' +
        '<p class="profile-card__lead">You need to be a member of the Liam Delap Fan Club Discord to sign in here.</p>' +
        '<div class="profile-card__actions">' +
        '<a href="' +
        escapeHtml(cfg.discordInvite) +
        '" class="footer-cta" target="_blank" rel="noopener noreferrer">Join Discord</a>' +
        '<button type="button" class="profile-switch-account" id="profile-switch-account-btn">Sign in with a different account</button>' +
        '</div></div>';
      document.getElementById('profile-switch-account-btn')?.addEventListener('click', loginWithDiscord);
      return;
    }

    if (state.status === 'member' && state.user) {
      renderMemberProfile(state.user);
    }
  }

  async function runRefreshUI() {
    try {
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

      confirmedMemberId = null;
      renderHeader(null, null);
      if (document.getElementById('profile-root')) {
        renderProfile({ status: 'guest' });
      }
    } catch (e) {
      confirmedMemberId = null;
      renderHeader(null, null);
      if (document.getElementById('profile-root')) {
        renderProfile({ status: 'guest' });
      }
    }
  }

  async function refreshUI() {
    if (refreshInFlight) {
      refreshQueued = true;
      return refreshInFlight;
    }

    refreshInFlight = (async function () {
      do {
        refreshQueued = false;
        await runRefreshUI();
      } while (refreshQueued);
    })().finally(function () {
      refreshInFlight = null;
    });

    return refreshInFlight;
  }

  function isProfileStillLoading() {
    var root = document.getElementById('profile-root');
    return root && root.querySelector('.profile-status');
  }

  function bootAuth() {
    if (document.getElementById('profile-root')) {
      renderProfile({ status: 'loading' });
    }

    supabase.auth.onAuthStateChange(function () {
      refreshUI();
    });

    refreshUI();

    setTimeout(function () {
      if (isProfileStillLoading()) {
        refreshUI();
      }
    }, 2500);

    setTimeout(function () {
      if (isProfileStillLoading()) {
        renderHeader(null, null);
        renderProfile({ status: 'guest' });
      }
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAuth);
  } else {
    bootAuth();
  }

  window.LDFC_AUTH = {
    login: loginWithDiscord,
    logout: logout,
  };
})();
