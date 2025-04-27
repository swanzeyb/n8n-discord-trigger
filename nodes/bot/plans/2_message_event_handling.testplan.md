# Test Plan: Message Event Handling & Filtering (`handleMessageCreate`)

**Target File:** `/home/corefinder/n8n-discord-trigger/nodes/bot/BotInstance.ts`

**Goal:** Verify that incoming messages are correctly filtered based on configured node parameters (content pattern, channel, role, author type) and that matching messages trigger an IPC emission via `IPCRouter`.

**Assumptions:**

- Unit tests will heavily rely on mocking the `discord.js` library (`Client`, `Message`, `Guild`, `Channel`, `Role`, `Interaction`, etc.) and the `IPCRouter`.
- Tests will focus on the logic within `BotInstance` methods, not actual Discord API interactions or IPC transport reliability.
- `BotInstance` will be instantiated with mock credentials for each test.

**Setup:**

- Mock `discord.js` Message, Guild, Author, Member, Role, Channel objects with various properties.
- Mock `IPCRouter.getNodesForBot` to return mock node configurations.
- Mock `IPCRouter.emitToRegisteredNodes`.
- Set `botInstance.state.ready = true`.

**Test Cases:**

1.  **Test Case: Match - Content Pattern (Exact, Contains, Regex, etc.)**

    - _Scenario:_ A message arrives that matches the content pattern of a registered node.
    - _Conditions:_ Mock message content matches the pattern (e.g., exact string, starts with, regex). Node parameters match.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is called once with the correct node ID, event type (`discordMessage`), and serialized message payload.

2.  **Test Case: No Match - Content Pattern**

    - _Scenario:_ A message arrives that does _not_ match the content pattern.
    - _Conditions:_ Mock message content does not match.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is _not_ called.

3.  **Test Case: Match - Channel Filter**

    - _Scenario:_ A message arrives in a channel specified in the node's filter.
    - _Conditions:_ Node has `channelIds` configured, message channel ID is in the list. Content matches.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is called.

4.  **Test Case: No Match - Channel Filter**

    - _Scenario:_ A message arrives in a channel _not_ specified in the node's filter.
    - _Conditions:_ Node has `channelIds` configured, message channel ID is _not_ in the list.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is _not_ called.

5.  **Test Case: Match - Role Filter**

    - _Scenario:_ A message arrives from a user possessing a role specified in the node's filter.
    - _Conditions:_ Node has `roleIds` configured, mock message author's member object has a matching role ID. Content matches.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is called.

6.  **Test Case: No Match - Role Filter**

    - _Scenario:_ A message arrives from a user _without_ a required role.
    - _Conditions:_ Node has `roleIds` configured, mock message author's member object lacks matching roles.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is _not_ called.

7.  **Test Case: Filter - Ignore Own Bot Message**

    - _Scenario:_ A message arrives from the bot itself.
    - _Conditions:_ Mock message author ID matches `client.user.id`. Node configured to trigger on external bots or not.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is _not_ called.

8.  **Test Case: Filter - Ignore Other Bots (Default)**

    - _Scenario:_ A message arrives from another bot when the node is _not_ configured to trigger on bots.
    - _Conditions:_ Mock message author is a bot (`author.bot = true`). Node parameter `externalBotTrigger` is false or undefined.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is _not_ called.

9.  **Test Case: Match - Trigger on External Bot**
    - _Scenario:_ A message arrives from another bot when the node _is_ configured to trigger on bots.
    - _Conditions:_ Mock message author is a bot. Node parameter `externalBotTrigger` is true. Content matches.
    - _Expected Outcome:_ `IPCRouter.emitToRegisteredNodes` is called.
