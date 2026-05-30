/**
 * LDFC profile bridge — Supabase Edge Function
 * Verifies Discord login, then fetches stats from the bot API.
 *
 * Required secrets (Supabase → Edge Functions → Secrets):
 *   BOT_PROFILE_API_URL   e.g. https://worker-production-9afb.up.railway.app
 *   BOT_PROFILE_API_TOKEN bearer token for the bot API
 *   LDFC_GUILD_ID         1464771608781783191
 */
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getDiscordId(user: User): string {
  const meta = user.user_metadata ?? {};

  if (meta.provider_id) {
    return String(meta.provider_id);
  }
  if (meta.sub) {
    return String(meta.sub);
  }

  const discordIdentity = user.identities?.find((identity) => identity.provider === 'discord');
  if (discordIdentity?.id) {
    return String(discordIdentity.id);
  }

  return '';
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const jwt = authHeader.slice('Bearer '.length).trim();
    if (!jwt) {
      return json({ error: 'Missing authorization' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Supabase env not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      return json(
        { error: 'Unauthorized', detail: userError?.message ?? 'Invalid session' },
        401,
      );
    }

    const discordId = getDiscordId(user);
    if (!discordId) {
      return json({ error: 'Discord user id not found on session' }, 400);
    }

    const botUrl = (Deno.env.get('BOT_PROFILE_API_URL') ?? '').trim().replace(/\/$/, '');
    const botToken = (Deno.env.get('BOT_PROFILE_API_TOKEN') ?? '').trim();
    const guildId = (Deno.env.get('LDFC_GUILD_ID') ?? '1464771608781783191').trim();

    if (!botUrl || !botToken) {
      return json({ error: 'Bot profile API is not configured yet' }, 503);
    }

    const profileUrl =
      botUrl +
      '/api/guilds/' +
      encodeURIComponent(guildId) +
      '/users/' +
      encodeURIComponent(discordId) +
      '/profile';

    const botRes = await fetch(profileUrl, {
      headers: { Authorization: 'Bearer ' + botToken },
    });

    if (!botRes.ok) {
      const detail = await botRes.text();
      return json(
        {
          error: 'Bot profile API request failed',
          status: botRes.status,
          detail: detail.slice(0, 300),
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
