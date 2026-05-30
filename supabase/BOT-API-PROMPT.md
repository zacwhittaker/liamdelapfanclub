Add a private profile API so our website (ldfc.co.uk) can show the same data as the `,p` command.

## What to build

1. **Refactor** — extract profile data from `cogs/prestige.py` `profile` command into:
   ```python
   async def build_profile_payload(guild_id: int, user_id: int) -> dict:
   ```
   Return JSON matching the schema below. The `,p` command should call this, then pass the result to `build_profile_card(...)`.

2. **HTTP endpoint** (aiohttp/Flask/FastAPI — whatever fits the bot):
   ```
   GET /api/guilds/{guild_id}/users/{user_id}/profile
   Authorization: Bearer <PROFILE_API_TOKEN>
   ```
   - Only return data for users in the guild
   - 404 if user has no profile row yet
   - 401 if token wrong

3. **Env vars on Railway**:
   ```
   PROFILE_API_TOKEN=<generate-a-long-random-secret>
   PROFILE_API_PORT=8080
   ```
   Expose the port in Railway so the URL is reachable (e.g. `https://your-bot.up.railway.app`).

4. **Send us** (via DM, not GitHub):
   - Railway public URL
   - Same `PROFILE_API_TOKEN` value (website backend stores it as a secret)
   - Confirm this curl works:
     ```bash
     curl -H "Authorization: Bearer TOKEN" \
       "https://YOUR-BOT.up.railway.app/api/guilds/1464771608781783191/users/798584114130714635/profile"
     ```

## JSON response shape (website expects this)

```json
{
  "guild_id": "1464771608781783191",
  "user": {
    "id": "798584114130714635",
    "username": "willithius",
    "display_name": "will",
    "avatar_url": "https://cdn.discordapp.com/...",
    "joined_at": "2026-01-24T00:00:00+00:00"
  },
  "prestige": {
    "aura": 18497,
    "aura_display": "18,497",
    "tier": "Unranked",
    "rank": 2,
    "top_percent": 29,
    "progress_percent": 29,
    "progress_label": "29% to Prospect",
    "messages": 1124,
    "voice_seconds": 0,
    "voice_time": "0h",
    "reactions_received": 0,
    "reps": 1,
    "warnings": 4,
    "reputation_percent": 60,
    "badges": ["MEMBER"],
    "rim_color": "#1E4DFF",
    "prestige_id": "MEMBER #798584114130714635",
    "aura_history": [100, 200, 300, 400, 500]
  },
  "lastfm": {
    "linked": true,
    "username": "Willithius",
    "top_artist": "Sabrina Carpenter",
    "now_playing": {
      "track": "Problem",
      "artist": "Ariana Grande",
      "album": "My Everything",
      "image_url": "https://..."
    }
  },
  "perks": {
    "personal_role": {
      "active": true,
      "role_id": "123",
      "name": "liam delap ultimate fan",
      "color": "#1E4DFF"
    }
  }
}
```

`aura_history` is optional — website shows a placeholder graph if missing.

## Do NOT expose in the API or frontend

- `DISCORD_TOKEN`
- `LASTFM_API_KEY`
- `PROFILE_API_TOKEN`
- Full warning reasons / moderation logs

Warning **count** for the requested user only is fine.
