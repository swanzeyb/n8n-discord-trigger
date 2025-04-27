# Test Plan: Action Execution (`performAction`)

**Target File:** `/home/corefinder/n8n-discord-trigger/nodes/bot/BotInstance.ts`

**Goal:** Verify that actions requested via `performAction` (e.g., remove messages, add/remove roles) correctly call the corresponding `discord.js` methods with appropriate parameters and handle potential errors (invalid IDs, missing permissions).

**Assumptions:**

- Unit tests will heavily rely on mocking the `discord.js` library (`Client`, `Message`, `Guild`, `Channel`, `Role`, `Interaction`, etc.) and the `IPCRouter`.
- Tests will focus on the logic within `BotInstance` methods, not actual Discord API interactions or IPC transport reliability.
- `BotInstance` will be instantiated with mock credentials for each test.

**Setup:**

- Mock `discord.js` Client, TextChannel (`fetch`, `bulkDelete`), Guild (`fetch`, `members.fetch`, `roles.fetch`), Member (`roles.add`, `roles.remove`, `roles.cache`), Role objects.
- Set `botInstance.state.ready = true`.

**Test Cases:**

1.  **Test Case: Remove Messages - Success**

    - _Scenario:_ Request to remove N messages from a valid text channel.
    - _Conditions:_ `actionType: 'removeMessages'`, valid `channelId`, `removeMessagesNumber: N`. Mock channel fetch returns a TextChannel.
    - _Expected Outcome:_ `channel.bulkDelete(N, true)` is called (where N is capped between 1 and 100). Returns `{ success: true, ... }`.

2.  **Test Case: Remove Messages - Invalid Channel**

    - _Scenario:_ Request to remove messages from an invalid/non-existent channel ID.
    - _Conditions:_ `actionType: 'removeMessages'`, invalid `channelId`. Mock channel fetch rejects or returns null.
    - _Expected Outcome:_ Returns `{ success: false, error: ... }`. `bulkDelete` is not called.

3.  **Test Case: Add Role - Success**

    - _Scenario:_ Request to add a valid role to a valid user in a valid guild. User does not already have the role.
    - _Conditions:_ `actionType: 'addRole'`, valid `guildId`, `userId`, `roleUpdateIds`. Mocks for guild, member, role fetches succeed. Mock `member.roles.cache.has(roleId)` returns false.
    - _Expected Outcome:_ `member.roles.add(roleId)` is called. Returns `{ success: true, ... }`.

4.  **Test Case: Add Role - User Already Has Role**

    - _Scenario:_ Request to add a role the user already possesses.
    - _Conditions:_ Same as above, but mock `member.roles.cache.has(roleId)` returns true.
    - _Expected Outcome:_ `member.roles.add(roleId)` is _not_ called. Returns `{ success: true, ... }`.

5.  **Test Case: Remove Role - Success**

    - _Scenario:_ Request to remove a valid role from a valid user who has it.
    - _Conditions:_ `actionType: 'removeRole'`, valid IDs. Mocks succeed. Mock `member.roles.cache.has(roleId)` returns true.
    - _Expected Outcome:_ `member.roles.remove(roleId)` is called. Returns `{ success: true, ... }`.

6.  **Test Case: Role Action - Invalid Guild/User/Role ID**

    - _Scenario:_ Request a role action with an ID that cannot be fetched.
    - _Conditions:_ `actionType: 'addRole'` or `'removeRole'`, one or more invalid IDs. Mock corresponding fetch (guild, member, or role) rejects or returns null.
    - _Expected Outcome:_ Returns `{ success: false, error: ... }`. Role modification method is not called.

7.  **Test Case: Role Action - API Permission Error**
    - _Scenario:_ Discord API rejects the role modification due to missing bot permissions.
    - _Conditions:_ Valid IDs, mocks succeed up to the point of role modification. Mock `member.roles.add` or `member.roles.remove` rejects with a permissions-related error.
    - _Expected Outcome:_ Returns `{ success: false, error: ... }` containing the permission error message.
