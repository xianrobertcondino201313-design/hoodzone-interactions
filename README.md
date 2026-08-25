# HOODZONE Interactions Endpoint v1.1 (FIXED)

This version fixes the Render startup error where Render tried to run:
`node src/index.js` and received `MODULE_NOT_FOUND`.

## Correct structure
`server.js` is at the project root.

## Render
- Runtime: Node
- Root Directory: blank
- Build Command: `npm install`
- Start Command: `npm start`

## Environment variables
- DISCORD_PUBLIC_KEY
- DISCORD_TOKEN
- CLIENT_ID
- GUILD_ID
- PORT=10000

## URLs
Health:
`https://YOUR-SERVICE.onrender.com/health`

Interactions:
`https://YOUR-SERVICE.onrender.com/interactions`

## Important architecture note
This is an HTTP Interactions endpoint. It is not a replacement for the Discord Gateway. Full message/member/voice monitoring and automatic moderation require a Gateway service too.

Never commit `.env` or the bot token.
