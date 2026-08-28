# HOODZONE Interactions v3.2.0

100-command upgrade for the HOODZONE Discord App Bot.

## What changed

- Preserves the original 100 slash-command names.
- Adds a central command registry and safer command routing.
- Adds `/chat` as the smart-conversation command while keeping the total at 100.
- Adds structured command options for moderation and utility commands.
- Adds safer interaction fallback/error handling so command handlers return a Discord response instead of silently failing.
- Adds real Discord REST actions for ban, kick, timeout, untimeout, unban, nickname and slowmode when the bot has the required permissions.
- Adds `/health` and `/commands` diagnostics.
- Adds command-level staff restrictions for destructive/moderation commands.
- Keeps secrets in environment variables only.

## Important architecture note

This project is an HTTP Interactions endpoint. It does **not** receive every Discord message/member/voice event. Features such as continuous message moderation, member join/leave automation, reaction-role listeners, and message-based anti-spam need a separate Gateway worker with the appropriate Discord access.

The old v1.2 implementation had many commands that returned placeholder text rather than performing real actions. v3.2.0 makes the command pipeline reliable and implements the highest-value REST actions that can safely operate through HTTP interactions.

## Required environment variables

- `DISCORD_PUBLIC_KEY`
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `PORT` (Render normally supplies this; local default is 10000)

Never commit `.env` or a Discord bot token.

## Render

Build: `npm install`
Start: `npm start`
Health: `/health`
Interactions endpoint: `/interactions`

## Test

Run:

```bash
npm test
```

The test suite verifies:
- health endpoint
- Discord PING response
- Ed25519 signature validation
- invalid signature rejection
- exactly 100 unique commands
- every registered command returns a valid interaction response
- smart conversation responses
- diagnostic endpoints
