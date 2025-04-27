# Test Plan: Bot Connection Lifecycle & Error Handling

**Target File:** `/home/corefinder/n8n-discord-trigger/nodes/bot/BotInstance.ts`

**Goal:** Verify the bot's ability to connect, disconnect, handle various connection errors (timeout, invalid token, API errors), manage its internal state (`ready`, `login`, `error`), and attempt recovery (`reinitializeClient`).

**Assumptions:**

- Unit tests will heavily rely on mocking the `discord.js` library (`Client`, `Message`, `Guild`, `Channel`, `Role`, `Interaction`, etc.) and the `IPCRouter`.
- Tests will focus on the logic within `BotInstance` methods, not actual Discord API interactions or IPC transport reliability.
- `BotInstance` will be instantiated with mock credentials for each test.

**Setup:**

- Mock `discord.js` Client, specifically `login()`, `destroy()`, `once('ready')`, `on('error')`, `on('disconnect')`.
- Mock `credentials`.

**Test Cases:**

1.  **Test Case: Successful Connection**

    - _Scenario:_ `connect()` is called when the bot is disconnected.
    - _Conditions:_ Mock `client.login()` resolves successfully, mock `client.once('ready')` fires the callback promptly.
    - _Expected Outcome:_ `connect()` resolves to `true`, `state.ready` is true, `state.login` is false, `state.error` is null.

2.  **Test Case: Connection Timeout**

    - _Scenario:_ `connect()` is called, but the 'ready' event doesn't fire within the timeout period.
    - _Conditions:_ Mock `client.login()` resolves, but the 'ready' event callback is _not_ triggered within 30 seconds (or mocked time equivalent).
    - _Expected Outcome:_ `connect()` rejects or resolves to `false`, `state.ready` is false, `state.login` is false, `state.error` contains a timeout message. Verify `client.destroy()` and client re-initialization logic were triggered (via mocks).

3.  **Test Case: Invalid Token (Login Rejection)**

    - _Scenario:_ `connect()` is called with invalid credentials.
    - _Conditions:_ Mock `client.login()` rejects immediately with an authentication error.
    - _Expected Outcome:_ `connect()` rejects or resolves to `false`, `state.ready` is false, `state.login` is false, `state.error` contains the login error message. Verify `client.destroy()` and client re-initialization logic were triggered.

4.  **Test Case: API Error Event**

    - _Scenario:_ The bot is connected, but the client emits an 'error' event.
    - _Conditions:_ Manually trigger the mocked `client.on('error')` handler with a sample error.
    - _Expected Outcome:_ `state.ready` becomes false, `state.login` becomes false, `state.error` contains the error message.

5.  **Test Case: Disconnect**
    - _Scenario:_ `disconnect()` is called when the bot is connected.
    - _Conditions:_ Bot is in a `ready: true` state. Mock `client.destroy()`.
    - _Expected Outcome:_ `client.destroy()` is called, `state.ready` becomes false, `state.login` becomes false.
