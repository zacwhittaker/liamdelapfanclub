import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getDiscordId(user: User): string {
  const meta = user.user_metadata ?? {};
  if (meta.provider_id) return String(meta.provider_id);
  if (meta.sub) return String(meta.sub);

  const discord = user.identities?.find(function (i) {
    return i.provider === 'discord';
  });
  if (discord?.id) return String(discord.id);

  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const jwt = authHeader.replace('Bearer ', '').trim();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return json({ error: 'Unauthorized', detail: userError?.message }, 401);
    }

    const discordId = getDiscordId(user);
    if (!discordId) {
      return json({ error: 'Discord user id not found on session' }, 400);
    }

    const botUrl = Deno.env.get('BOT_PROFILE_API_URL');
    const botToken = Deno.env.get('BOT_PROFILE_API_TOKEN');
    const guildId = Deno.env.get('LDFC_GUILD_ID') ?? '1464771608781783191';

    if (!botUrl || !botToken) {
      return json({ error: 'Bot profile API is not configured yet' }, 503);
    }

    const profileUrl =
      botUrl.replace(/\/$/, '') +
      '/api/guilds/' +
      encodeURIComponent(guildId) +
      '/users/' +
      encodeURIComponent(discordId) +
      '/profile';

    const botRes = await fetch(profileUrl, {
      headers: { Authorization: 'Bearer ' + botToken.trim() },
    });

    if (!botRes.ok) {
      const detail = await botRes.text();
      return json(
        {
          error: 'Bot profile API request failed',
          status: botRes.status,
          detail: detail.slice(0, 200),
          discord_id: discordId,
        },
        botRes.status === 404 ? 404 : 502,
      );
    }

    const profile = await botRes.json();
    return json(profile, 200);
  } catch (err) {
    return json({ error: 'Internal error', message: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
