# HOODZONE Interactions v1.2

Render: Node, root blank, build `npm install`, start `npm start`, health `/health`.
Discord endpoint: `https://YOUR-RENDER-SERVICE.onrender.com/interactions`

Required environment variables: DISCORD_PUBLIC_KEY, DISCORD_TOKEN, CLIENT_ID, GUILD_ID, PORT.
Never commit `.env` or a bot token.

This HTTP endpoint handles Discord HTTP interactions. It does not receive every message/member/voice event. Continuous message moderation, member join/leave automation, voice management, and server-wide monitoring require a separate Gateway bot/worker with the required intents.

Exactly 100 guild slash commands are bulk-overwritten on startup.
