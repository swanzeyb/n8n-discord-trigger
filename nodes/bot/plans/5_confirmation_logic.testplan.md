# Test Plan: Confirmation Logic (`sendConfirmation`)

**Target File:** `/home/corefinder/n8n-discord-trigger/nodes/bot/BotInstance.ts`

**Goal:** Verify the `sendConfirmation` method correctly sends a message with Yes/No buttons, waits for a user interaction, handles both confirmation and cancellation, manages the timeout, and cleans up the confirmation message.

**Assumptions:**

- Unit tests will heavily rely on mocking the `discord.js` library (`Client`, `Message`, `Guild`, `Channel`, `Role`, `Interaction`, etc.) and the `IPCRouter`.
- Tests will focus on the logic within `BotInstance` methods, not actual Discord API interactions or IPC transport reliability.
- `BotInstance` will be instantiated with mock credentials for each test.

**Setup:**

- Mock `discord.js` Client, TextChannel (`fetch`, `send`, `createMessageComponentCollector`), Message (`delete`), ButtonInteraction (`deferUpdate`, `customId`, `isButton`, `message`), Collection (`on`), ActionRowBuilder, ButtonBuilder.
- Mock `prepareMessage` utility function from `/home/corefinder/n8n-discord-trigger/nodes/bot/utils.ts`.
- Set `botInstance.state.ready = true`.

**Test Cases:**

1.  **Test Case: User Confirms (Yes)**

    - _Scenario:_ User clicks the 'Yes' button within the timeout.
    - _Conditions:_ Mock `channel.send` returns mock message. Mock collector's 'collect' event fires with an interaction having `customId` starting with `confirm_yes`. Mock `interaction.deferUpdate()` and `message.delete()` succeed.
    - _Expected Outcome:_ Promise resolves to `{ confirmed: true, success: true }`. `message.delete()` was called.

2.  **Test Case: User Cancels (No)**

    - _Scenario:_ User clicks the 'No' button within the timeout.
    - _Conditions:_ Mock collector's 'collect' event fires with `customId` starting with `confirm_no`. Mocks succeed.
    - _Expected Outcome:_ Promise resolves to `{ confirmed: false, success: true }`. `message.delete()` was called.

3.  **Test Case: Timeout**

    - _Scenario:_ User does not interact with the buttons before the timeout expires.
    - _Conditions:_ Mock collector's 'end' event fires _without_ a preceding 'collect' event. Mock `message.delete()` succeeds.
    - _Expected Outcome:_ Promise resolves to `{ confirmed: null, success: false, error: 'Confirmation timed out' }`. `message.delete()` was called.

4.  **Test Case: Invalid Channel**

    - _Scenario:_ Attempting to send confirmation to an invalid channel.
    - _Conditions:_ Mock `client.channels.fetch` rejects or returns null for the given `channelId`.
    - _Expected Outcome:_ Promise resolves/rejects with `{ confirmed: null, success: false, error: ... }`. `channel.send` is not called.

5.  **Test Case: Message Send Error**

    - _Scenario:_ Failed to send the initial confirmation message.
    - _Conditions:_ Mock `channel.send` rejects.
    - _Expected Outcome:_ Promise resolves/rejects with `{ confirmed: null, success: false, error: ... }`.

6.  **Test Case: Message Delete Error**
    - _Scenario:_ Failed to delete the confirmation message after interaction or timeout.
    - _Conditions:_ Mock `message.delete()` rejects.
    - _Expected Outcome:_ Promise still resolves based on interaction/timeout result (e.g., `{ confirmed: true, success: true }` or timeout error), but a warning about deletion failure is logged.
