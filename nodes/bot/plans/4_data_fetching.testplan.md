# Test Plan: Data Fetching (`fetchGuilds`, `fetchChannels`, `fetchRoles`)

**Target File:** `/home/corefinder/n8n-discord-trigger/nodes/bot/BotInstance.ts`

**Goal:** Verify that methods responsible for fetching lists of guilds, channels, and roles correctly interact with the (mocked) client cache and API, handle single/multiple guild ID inputs, filter results appropriately (e.g., text channels only, exclude @everyone role), and manage errors.

**Assumptions:**

- Unit tests will heavily rely on mocking the `discord.js` library (`Client`, `Message`, `Guild`, `Channel`, `Role`, `Interaction`, etc.) and the `IPCRouter`.
- Tests will focus on the logic within `BotInstance` methods, not actual Discord API interactions or IPC transport reliability.
- `BotInstance` will be instantiated with mock credentials for each test.

**Setup:**

- Mock `discord.js` Client (`guilds.fetch`, `guilds.cache`, `channels.fetch`), Guild (`channels.fetch`, `channels.cache`, `roles.fetch`, `roles.cache`), Channel, Role objects.
- Set `botInstance.state.ready = true`.

**Test Cases:**

1.  **Test Case: Fetch Guilds - Success**

    - _Scenario:_ Fetch guilds when the bot is ready.
    - _Conditions:_ Mock `client.guilds.fetch()` resolves. Mock `client.guilds.cache` contains mock guilds.
    - _Expected Outcome:_ Returns an array of `{ name, value }` objects corresponding to mock guilds. `state.guildsFetched` becomes true.

2.  **Test Case: Fetch Channels - Success (Single Guild)**

    - _Scenario:_ Fetch channels for a specific, valid guild ID.
    - _Conditions:_ Valid `guildId`. Mock `client.guilds.fetch` (or cache hit) returns mock guild. Mock `guild.channels.fetch` resolves with a mix of text and non-text channels.
    - _Expected Outcome:_ Returns an array containing `{ name, value }` only for the _text_ channels in that guild.

3.  **Test Case: Fetch Channels - Success (Multiple Guilds)**

    - _Scenario:_ Fetch channels for multiple valid guild IDs.
    - _Conditions:_ Array of valid `guildIds`. Mocks for all guilds and their channels succeed.
    - _Expected Outcome:_ Returns an array containing text channels from _all_ specified guilds.

4.  **Test Case: Fetch Roles - Success (Excludes @everyone)**

    - _Scenario:_ Fetch roles for one or more valid guild IDs.
    - _Conditions:_ Valid `guildId(s)`. Mock guild/role fetches succeed. Mock roles include the `@everyone` role.
    - _Expected Outcome:_ Returns an array of `{ name, value }` for all roles _except_ the one named `@everyone`.

5.  **Test Case: Fetch - Invalid Guild ID**

    - _Scenario:_ Request channels or roles for a guild ID that doesn't exist or the bot isn't in.
    - _Conditions:_ Pass an invalid `guildId` to `fetchChannels` or `fetchRoles`. Mock `client.guilds.fetch(invalidId)` rejects or returns null.
    - _Expected Outcome:_ Returns an empty array (or partial results if multiple IDs were passed and some were valid). A warning should be logged.

6.  **Test Case: Fetch - API Error**

    - _Scenario:_ An underlying API call (e.g., `guild.channels.fetch`) fails.
    - _Conditions:_ Mock the relevant fetch method (`guilds.fetch`, `channels.fetch`, `roles.fetch`) to reject with an error.
    - _Expected Outcome:_ Returns an empty array (or partial results). `state.error` should be set with an appropriate message.

7.  **Test Case: Fetch - Bot Not Ready**
    - _Scenario:_ Attempt to fetch data when the bot state is not ready.
    - _Conditions:_ `state.ready` is false.
    - _Expected Outcome:_ Returns an empty array immediately. A warning should be logged.
