import {
	Client,
	GatewayIntentBits,
	ChannelType, // Guild, // Removed unused import
	EmbedBuilder,
	ColorResolvable,
	AttachmentBuilder,
	TextChannel,
	Message,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	GuildMember, // Added GuildMember type
	Role, // Added Role type
	PartialGuildMember, // Added for guildMemberRemove
	// PartialUser, // Removed unused import
	// User, // Removed unused import
} from 'discord.js';

import ipc from 'node-ipc';
import { ICredentials } from './helper';
import { IDiscordNodeActionParameters } from './DiscordInteraction/DiscordInteraction.node'; // Keep only used import

// +++ Start: Added BotManager Class +++
class BotManager {
	private botInstances: Map<string, BotInstance>;

	constructor() {
		this.botInstances = new Map();
	}

	async connectBot(
		credentials: ICredentials,
	): Promise<{ instanceId: string; status: 'ready' | 'already' | 'error'; error?: string }> {
		const instanceId = this.generateInstanceId(credentials);

		// Check if bot instance already exists and is ready or logging in
		const existingInstance = this.botInstances.get(instanceId);
		if (existingInstance) {
			if (existingInstance.isReady()) {
				return { instanceId, status: 'already' };
			}
			if (existingInstance.isLoggingIn()) {
				// Wait briefly for login to complete or fail
				await new Promise((resolve) => setTimeout(resolve, 2000)); // Adjust timeout as needed
				if (existingInstance.isReady()) {
					return { instanceId, status: 'already' };
				} else if (existingInstance.hasError()) {
					// Clear error and attempt reconnect
					existingInstance.clearError();
					console.log(`Retrying connection for bot ${credentials.clientId}...`);
					// Fall through to connect logic
				} else {
					return { instanceId, status: 'error', error: 'Login in progress, please wait.' }; // Still logging in
				}
			} else if (existingInstance.hasError()) {
				// Clear error and attempt reconnect
				existingInstance.clearError();
				console.log(`Retrying connection for bot ${credentials.clientId} after previous error...`);
				// Fall through to connect logic
			} else {
				// Should not happen, but handle potential inconsistent state
				console.warn(
					`Bot instance ${instanceId} exists but is not ready, logging in, or in error state. Attempting reconnect.`,
				);
				// Fall through to connect logic
			}
		}

		// Create and connect new bot instance or reconnect existing one
		console.log(`Connecting bot ${credentials.clientId}...`);
		const botInstance = existingInstance || new BotInstance(credentials);
		if (!existingInstance) {
			this.botInstances.set(instanceId, botInstance);
		}

		const connected = await botInstance.connect();

		if (connected) {
			return { instanceId, status: 'ready' };
		} else {
			// Connection failed, keep the instance in the map to potentially retry later
			// The error state is set within botInstance.connect()
			return {
				instanceId,
				status: 'error',
				error: botInstance.getError() || 'Unknown connection error',
			};
		}
	}

	getBotInstance(instanceId: string): BotInstance | undefined {
		return this.botInstances.get(instanceId);
	}

	getBotByCredentials(credentials: ICredentials): BotInstance | undefined {
		const instanceId = this.generateInstanceId(credentials);
		return this.getBotInstance(instanceId);
	}

	private generateInstanceId(credentials: ICredentials): string {
		// Create unique ID based on clientId to identify this bot instance
		return `bot-${credentials.clientId}`;
	}

	disconnectBot(instanceId: string): void {
		const instance = this.botInstances.get(instanceId);
		if (instance) {
			instance.disconnect();
			this.botInstances.delete(instanceId);
			console.log(`Bot instance ${instanceId} disconnected and removed.`);
		}
	}

	getAllBotInstances(): BotInstance[] {
		return Array.from(this.botInstances.values());
	}
}
// +++ End: Added BotManager Class +++

// +++ Start: Added BotInstance Class +++
class BotInstance {
	public client: Client; // Made public for IPCRouter access
	private credentials: ICredentials;
	private state: {
		ready: boolean;
		login: boolean;
		error: string | null;
		guildsFetched: boolean;
	};

	constructor(credentials: ICredentials) {
		this.credentials = credentials;
		this.state = {
			ready: false,
			login: false,
			error: null,
			guildsFetched: false,
		};

		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildPresences,
				GatewayIntentBits.GuildBans,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.GuildMessageTyping,
			],
			allowedMentions: {
				parse: ['roles', 'users', 'everyone'],
			},
		});

		// Set up event handlers
		this.setupEventHandlers();
	}

	isReady(): boolean {
		return this.state.ready;
	}

	isLoggingIn(): boolean {
		return this.state.login;
	}

	hasError(): boolean {
		return this.state.error !== null;
	}

	getError(): string | null {
		return this.state.error;
	}

	clearError(): void {
		this.state.error = null;
	}

	private setupEventHandlers() {
		this.client.once('ready', () => {
			console.log(`Bot ${this.credentials.clientId} logged in as ${this.client.user?.tag}`);
			this.state.ready = true;
			this.state.login = false;
			this.state.error = null; // Clear error on successful connection

			// Register persistent event handlers after ready
			this.client.on('messageCreate', this.handleMessageCreate.bind(this));
			this.client.on('guildMemberAdd', this.handleGuildMemberAdd.bind(this));
			this.client.on('guildMemberRemove', this.handleGuildMemberRemove.bind(this));
			this.client.on('roleCreate', this.handleRoleCreate.bind(this));
			this.client.on('roleDelete', this.handleRoleDelete.bind(this));
			this.client.on('roleUpdate', this.handleRoleUpdate.bind(this));
			// Add other event handlers here as needed
		});

		this.client.on('error', (error) => {
			console.error(`Discord client error for bot ${this.credentials.clientId}:`, error);
			this.state.error = error.message;
			this.state.ready = false;
			this.state.login = false;
			// Optionally attempt to reconnect or notify administrator
		});

		this.client.on('disconnect', () => {
			console.log(`Bot ${this.credentials.clientId} disconnected.`);
			this.state.ready = false;
			this.state.login = false;
			// Optionally set an error state or attempt to reconnect
		});
	}

	async connect(): Promise<boolean> {
		if (this.state.ready) {
			console.log(`Bot ${this.credentials.clientId} is already connected.`);
			return true;
		}
		if (this.state.login) {
			console.log(`Bot ${this.credentials.clientId} is already connecting.`);
			// Wait for the existing login attempt to complete or fail
			// Fall through to the waiting logic below
		}

		try {
			// Only start login if not already in progress
			if (!this.state.login) {
				this.state.login = true;
				this.state.error = null; // Clear previous errors

				// Start login, but don't await the internal ready event here
				this.client.login(this.credentials.token).catch((loginError) => {
					// Catch immediate login errors (e.g., invalid token)
					// The 'error' event handler might also catch this
					if (!this.state.error) {
						// Avoid overwriting more specific errors
						this.state.error = loginError.message || 'Unknown login error during initiation';
					}
					this.state.login = false;
					console.error(
						`Immediate login initiation error for bot ${this.credentials.clientId}:`,
						this.state.error,
					);
					// The waiting promise below will handle the error state
				});
			}

			// Wait for the state to change (ready or error) due to event handlers
			await new Promise<void>((resolve, reject) => {
				const timeoutDuration = 30000; // 30 seconds timeout
				const checkInterval = 100; // Check every 100ms
				const startTime = Date.now();

				const intervalId = setInterval(() => {
					if (this.state.ready) {
						clearInterval(intervalId);
						resolve();
					} else if (this.state.error) {
						clearInterval(intervalId);
						reject(new Error(this.state.error));
					} else if (Date.now() - startTime > timeoutDuration) {
						clearInterval(intervalId);
						// Only set timeout error if no other error occurred
						if (!this.state.error) {
							this.state.error = 'Connection timed out waiting for ready state.';
							console.error(this.state.error);
						}
						this.state.login = false; // Ensure login state is cleared on timeout
						reject(new Error(this.state.error || 'Connection timed out'));
					}
					// Continue checking if still logging in and no error/ready state yet
				}, checkInterval);
			});

			// If the promise resolved, it means state.ready became true
			return true;
		} catch (error: any) {
			// This catch block now primarily handles the rejection from the waiting promise
			// The error state should already be set by the interval or event handlers
			if (!this.state.error) {
				// Fallback error message if state.error wasn't set somehow
				this.state.error = error.message || 'Unknown connection error';
			}
			this.state.login = false; // Ensure login state is false on error
			console.error(`Failed to connect bot ${this.credentials.clientId}:`, this.state.error);

			// Attempt to destroy client if login failed badly
			try {
				// Check if client exists and has a destroy method before calling
				if (this.client && typeof this.client.destroy === 'function') {
					this.client.destroy();
				}
			} catch (destroyError) {
				console.error(
					`Error destroying client after failed connection for ${this.credentials.clientId}:`,
					destroyError,
				);
			}
			// Re-initialize client for potential future connection attempts
			this.reinitializeClient();
			return false;
		}
	}

	private reinitializeClient() {
		this.client = new Client({
			// Recreate client instance
			intents: this.client.options.intents,
			allowedMentions: this.client.options.allowedMentions,
		});
		this.setupEventHandlers(); // Reattach event handlers
	}

	disconnect(): void {
		try {
			this.client.destroy();
		} catch (error) {
			console.error(`Error destroying client for bot ${this.credentials.clientId}:`, error);
		} finally {
			this.state.ready = false;
			this.state.login = false;
			this.state.guildsFetched = false; // Reset fetch state on disconnect
			// Do not clear error state here, might be useful for debugging
		}
	}

	async fetchGuilds(forceRefresh = false): Promise<{ name: string; value: string }[]> {
		if (!this.state.ready) {
			console.warn(`Bot ${this.credentials.clientId} is not ready. Cannot fetch guilds.`);
			return [];
		}
		try {
			if (forceRefresh || !this.state.guildsFetched) {
				await this.client.guilds.fetch(); // Fetches all guilds the bot is in
				this.state.guildsFetched = true;
			}
			const guilds = this.client.guilds.cache;
			return guilds.map((guild) => ({
				name: guild.name,
				value: guild.id,
			}));
		} catch (error: any) {
			console.error(`Error fetching guilds for bot ${this.credentials.clientId}:`, error);
			this.state.error = `Failed to fetch guilds: ${error.message}`;
			return [];
		}
	}

	async fetchChannels(
		guildIdsInput: string | string[],
	): Promise<{ name: string; value: string }[]> {
		// Changed parameter name
		if (!this.state.ready) {
			console.warn(`Bot ${this.credentials.clientId} is not ready. Cannot fetch channels.`);
			return [];
		}
		// Ensure guildIds is always an array
		const guildIds = Array.isArray(guildIdsInput) ? guildIdsInput : [guildIdsInput];

		const results: { name: string; value: string }[] = [];
		try {
			for (const guildId of guildIds) {
				const guild =
					this.client.guilds.cache.get(guildId) ||
					(await this.client.guilds.fetch(guildId).catch(() => null));
				if (!guild) {
					console.warn(
						`Guild ${guildId} not found or accessible for bot ${this.credentials.clientId}.`,
					);
					continue;
				}

				// Fetch channels for the specific guild
				const channels = await guild.channels.fetch().catch((err) => {
					console.error(
						`Error fetching channels for guild ${guildId} (Bot ${this.credentials.clientId}):`,
						err,
					);
					return null;
				});
				if (!channels) continue;

				const textChannels = channels.filter((channel) => channel?.type === ChannelType.GuildText);

				for (const channel of textChannels.values()) {
					if (channel) {
						// Ensure channel is not null
						results.push({
							name: channel.name,
							value: channel.id,
						});
					}
				}
			}
		} catch (error: any) {
			console.error(`Error fetching channels for bot ${this.credentials.clientId}:`, error);
			this.state.error = `Failed to fetch channels: ${error.message}`;
		}
		return results;
	}

	async fetchRoles(guildIds: string[]): Promise<{ name: string; value: string }[]> {
		if (!this.state.ready) {
			console.warn(`Bot ${this.credentials.clientId} is not ready. Cannot fetch roles.`);
			return [];
		}
		const results: { name: string; value: string }[] = [];
		try {
			for (const guildId of guildIds) {
				const guild =
					this.client.guilds.cache.get(guildId) ||
					(await this.client.guilds.fetch(guildId).catch(() => null));
				if (!guild) {
					console.warn(
						`Guild ${guildId} not found or accessible for bot ${this.credentials.clientId}.`,
					);
					continue;
				}

				// Fetch roles for the specific guild
				const roles = await guild.roles.fetch().catch((err) => {
					console.error(
						`Error fetching roles for guild ${guildId} (Bot ${this.credentials.clientId}):`,
						err,
					);
					return null;
				});
				if (!roles) continue;

				for (const role of roles.values()) {
					if (role && role.name !== '@everyone') {
						// Ensure role is not null
						results.push({
							name: role.name,
							value: role.id,
						});
					}
				}
			}
		} catch (error: any) {
			console.error(`Error fetching roles for bot ${this.credentials.clientId}:`, error);
			this.state.error = `Failed to fetch roles: ${error.message}`;
		}
		return results;
	}

	// --- Event Handlers ---
	private async handleMessageCreate(message: Message) {
		if (!this.state.ready) return; // Ignore if not ready
		// Added log
		console.log(
			`[Bot ${this.credentials.clientId}] Received messageCreate event: ${message.id} from ${message.author.tag} in channel ${message.channel.id}`,
		);

		// Basic check to ignore self (shouldn't happen with correct intent logic but good practice)
		if (message.author.id === this.client.user?.id) return;

		// Resolve message reference if needed by any trigger node for this bot
		let messageReferenceFetched = !message.reference; // True if no reference exists

		const relevantNodes = IPCRouter.getNodesForBot(this.credentials.clientId);

		for (const [nodeId, node] of relevantNodes) {
			// ---> nodeId is the key, node is the value { parameters, socket, credentials }
			try {
				const parameters = node.parameters;
				if (parameters.type !== 'message') continue;

				const pattern = parameters.pattern;
				const triggerOnExternalBot = parameters.additionalFields?.externalBotTrigger || false;

				// Ignore messages based on bot status
				if (!triggerOnExternalBot) {
					if (message.author.bot || message.author.system) continue;
				} else if (message.author.id === this.client.user?.id) {
					// If triggerOnExternalBot is true, we still ignore messages from *this* bot instance
					continue;
				}

				// Check roles
				if (parameters.roleIds?.length) {
					const userRoles = message.member?.roles.cache.map((role: any) => role.id);
					const hasRole = parameters.roleIds.some((role: any) => userRoles?.includes(role));
					if (!hasRole) continue;
				}

				// Check channels
				if (parameters.channelIds?.length) {
					const isInChannel = parameters.channelIds.some((channelId: any) =>
						message.channel.id?.includes(channelId),
					);
					if (!isInChannel) continue;
				}

				// Check message reference requirement
				if (parameters.messageReferenceRequired && !message.reference) {
					continue;
				}

				// Fetch reference if needed and not already fetched
				if (message.reference && !messageReferenceFetched) {
					try {
						await message.fetchReference();
					} catch (refError) {
						console.warn(`Could not fetch message reference for message ${message.id}:`, refError);
						// Decide if trigger should continue without reference? For now, we'll let it continue.
					} finally {
						messageReferenceFetched = true; // Mark as fetched (or attempted)
					}
				}

				// Check message content pattern
				const escapedTriggerValue = String(parameters.value ?? '') // Handle undefined value
					.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
					.replace(/-/g, '\\x2d');

				const botMention = message.mentions.users.some(
					(user: any) => user.id === this.client.user?.id,
				);

				let regStr = `^${escapedTriggerValue}$`; // Default: exact match

				if (pattern === 'botMention' && !botMention) continue;
				else if (pattern === 'start') regStr = `^${escapedTriggerValue}`;
				else if (pattern === 'end') regStr = `${escapedTriggerValue}$`;
				else if (pattern === 'contain')
					regStr = escapedTriggerValue; // No anchors for contains
				else if (pattern === 'regex')
					regStr = parameters.value ?? ''; // Use raw value for regex
				else if (pattern === 'every') regStr = `.*`; // Match anything (use with caution)

				// Only test regex if there's content or if pattern is 'every' or 'botMention'
				let match = false;
				if (pattern === 'botMention' && botMention) {
					match = true;
				} else if (regStr && (message.content || pattern === 'every')) {
					try {
						const reg = new RegExp(regStr, parameters.caseSensitive ? '' : 'i');
						match = reg.test(message.content);
					} catch (regexError) {
						console.error(`Invalid regex pattern \"${regStr}\" for node ${nodeId}:`, regexError);
						continue;
					}
				}

				if (match) {
					// Added log before emitting
					console.log(
						`[Bot ${this.credentials.clientId}] Matched message ${message.id} for node ${nodeId}. Emitting via IPC.`,
					);

					// Prepare data payload with serialized objects
					const messageData = {
						message: message.toJSON(),
						guild: message.guild?.toJSON(),
						author: message.author?.toJSON(),
						messageReference: message.reference
							? await message
									.fetchReference()
									.then((ref) => ref.toJSON())
									.catch(() => null)
							: null,
						referenceAuthor: message.reference
							? await message
									.fetchReference()
									.then((ref) => ref.author?.toJSON())
									.catch(() => null)
							: null,
					};

					// ---> CORRECTED: Use 'nodeId' variable from loop, not node.nodeId <---
					const payload = {
						node: nodeId, // Use the loop variable 'nodeId'
						data: messageData, // The actual message payload
						clientId: this.credentials.clientId, // Include clientId for logging/debugging
					};
					console.log(`Broadcasting discordMessage event for node ${nodeId}`); // Use the loop variable 'nodeId'
					ipc.server.broadcast('discordMessage', payload); // Broadcast the event
				}
			} catch (e) {
				console.error(
					`Error processing messageCreate for node ${nodeId} (Bot ${this.credentials.clientId}):`,
					e,
				);
			}
		}
	}

	private handleGuildMemberAdd(guildMember: GuildMember) {
		if (!this.state.ready) return;
		const eventData = {
			// guildMember: guildMember.toJSON(), // Serialize
			guild: guildMember.guild.toJSON(), // Serialize
			user: guildMember.user.toJSON(), // Serialize
			clientId: this.credentials.clientId,
		};
		// Added log
		console.log(
			`[Bot ${this.credentials.clientId}] Received guildMemberAdd event for user ${guildMember.user.tag} in guild ${guildMember.guild.id}. Emitting via IPC.`,
		);
		IPCRouter.emitToRegisteredNodes('guildMemberAdd', eventData, 'user-join', guildMember.guild.id);
	}

	private handleGuildMemberRemove(guildMember: GuildMember | PartialGuildMember) {
		if (!this.state.ready) return;
		// Ensure we have user and guild info, even if partial
		const user = guildMember.user;
		const guild = guildMember.guild;
		if (!user || !guild) {
			console.warn(
				`Could not process guildMemberRemove for bot ${this.credentials.clientId}: Missing user or guild data.`,
			);
			return;
		}
		const eventData = {
			// guildMember: guildMember.toJSON(), // May fail if partial
			guild: guild.toJSON(), // Serialize
			user: user.toJSON(), // Serialize
			clientId: this.credentials.clientId,
		};
		// Added log
		console.log(
			`[Bot ${this.credentials.clientId}] Received guildMemberRemove event for user ${user.tag} in guild ${guild.id}. Emitting via IPC.`,
		);
		IPCRouter.emitToRegisteredNodes('guildMemberRemove', eventData, 'user-leave', guild.id);
	}

	private handleRoleCreate(role: Role) {
		if (!this.state.ready) return;
		const eventData = {
			role: role.toJSON(), // Serialize
			guild: role.guild.toJSON(), // Serialize
			clientId: this.credentials.clientId,
		};
		// Added log
		console.log(
			`[Bot ${this.credentials.clientId}] Received roleCreate event for role ${role.name} in guild ${role.guild.id}. Emitting via IPC.`,
		);
		IPCRouter.emitToRegisteredNodes('roleCreate', eventData, 'role-create', role.guild.id);
	}

	private handleRoleDelete(role: Role) {
		if (!this.state.ready) return;
		const eventData = {
			role: role.toJSON(), // Serialize
			guild: role.guild.toJSON(), // Serialize
			clientId: this.credentials.clientId,
		};
		// Added log
		console.log(
			`[Bot ${this.credentials.clientId}] Received roleDelete event for role ${role.name} in guild ${role.guild.id}. Emitting via IPC.`,
		);
		IPCRouter.emitToRegisteredNodes('roleDelete', eventData, 'role-delete', role.guild.id);
	}

	private handleRoleUpdate(oldRole: Role, newRole: Role) {
		if (!this.state.ready) return;
		// Basic check for meaningful changes (optional, can be done in trigger node)
		if (
			oldRole.name === newRole.name &&
			oldRole.color === newRole.color &&
			oldRole.hoist === newRole.hoist &&
			oldRole.permissions.bitfield === newRole.permissions.bitfield &&
			oldRole.mentionable === newRole.mentionable &&
			oldRole.icon === newRole.icon &&
			oldRole.unicodeEmoji === newRole.unicodeEmoji
		) {
			return; // Skip if no relevant changes
		}

		const eventData = {
			oldRole: oldRole.toJSON(), // Serialize
			newRole: newRole.toJSON(), // Serialize
			guild: newRole.guild.toJSON(), // Serialize
			clientId: this.credentials.clientId,
		};
		// Added log
		console.log(
			`[Bot ${this.credentials.clientId}] Received roleUpdate event for role ${newRole.name} in guild ${newRole.guild.id}. Emitting via IPC.`,
		);
		IPCRouter.emitToRegisteredNodes('roleUpdate', eventData, 'role-update', newRole.guild.id);
	}

	// --- Action Methods ---

	async sendMessage(channelId: string, messageOptions: any): Promise<any> {
		if (!this.state.ready) {
			return { success: false, error: `Bot ${this.credentials.clientId} is not ready.` };
		}
		try {
			const channel = (await this.client.channels
				.fetch(channelId)
				.catch(() => null)) as TextChannel | null;
			if (!channel || !channel.isTextBased()) {
				throw new Error('Channel not found or not a text channel');
			}

			// Use the standalone prepareMessage function
			const preparedMessage = prepareMessage(messageOptions);
			const message = await channel.send(preparedMessage);

			return {
				channelId: channel.id,
				messageId: message.id,
				success: true,
			};
		} catch (error: any) {
			console.error(`Error sending message for bot ${this.credentials.clientId}:`, error);
			return { success: false, error: error.message };
		}
	}

	async performAction(nodeParameters: IDiscordNodeActionParameters): Promise<any> {
		if (!this.state.ready) {
			return { success: false, error: `Bot ${this.credentials.clientId} is not ready.` };
		}
		try {
			// remove messages
			if (nodeParameters.actionType === 'removeMessages') {
				const channel = (await this.client.channels
					.fetch(nodeParameters.channelId)
					.catch(() => null)) as TextChannel | null;
				if (!channel || !channel.isTextBased()) {
					throw new Error('Channel not found or not a text channel for removeMessages');
				}
				// Ensure the number is valid and within Discord limits (1-100)
				const numToDelete = Math.max(1, Math.min(100, nodeParameters.removeMessagesNumber || 0));
				if (numToDelete > 0) {
					await channel.bulkDelete(numToDelete, true); // true to filter messages older than 2 weeks
				} else {
					console.warn(
						`Invalid number of messages to delete: ${nodeParameters.removeMessagesNumber}`,
					);
				}
			}
			// add or remove roles
			else if (['addRole', 'removeRole'].includes(nodeParameters.actionType)) {
				const guild = await this.client.guilds.fetch(nodeParameters.guildId).catch(() => null);
				if (!guild) {
					throw new Error(`Guild ${nodeParameters.guildId} not found`);
				}
				if (!nodeParameters.userId) {
					throw new Error('User ID is required for role actions');
				}

				const guildMember = await guild.members.fetch(nodeParameters.userId).catch(() => null);
				if (!guildMember) {
					throw new Error(
						`User ${nodeParameters.userId} not found in guild ${nodeParameters.guildId}`,
					);
				}

				const roles = guildMember.roles;
				const roleUpdateIds =
					(typeof nodeParameters.roleUpdateIds === 'string'
						? nodeParameters.roleUpdateIds.split(',')
						: nodeParameters.roleUpdateIds) ?? [];

				for (const roleId of roleUpdateIds) {
					if (!roleId) continue; // Skip empty role IDs
					const role = await guild.roles.fetch(roleId).catch(() => null);
					if (!role) {
						console.warn(`Role ${roleId} not found in guild ${nodeParameters.guildId}, skipping.`);
						continue;
					}
					try {
						if (nodeParameters.actionType === 'addRole') {
							if (!roles.cache.has(roleId)) {
								await roles.add(roleId);
								console.log(
									`Added role ${role.name} (${roleId}) to user ${guildMember.user.tag} in guild ${guild.name}`,
								);
							}
						} else if (nodeParameters.actionType === 'removeRole') {
							if (roles.cache.has(roleId)) {
								await roles.remove(roleId);
								console.log(
									`Removed role ${role.name} (${roleId}) from user ${guildMember.user.tag} in guild ${guild.name}`,
								);
							}
						}
					} catch (roleError: any) {
						console.error(
							`Failed to ${nodeParameters.actionType} role ${roleId} for user ${nodeParameters.userId} in guild ${nodeParameters.guildId}:`,
							roleError,
						);
						// Optionally collect errors to return
					}
				}
			} else {
				throw new Error(`Unsupported action type: ${nodeParameters.actionType}`);
			}

			return { success: true, action: nodeParameters.actionType };
		} catch (error: any) {
			console.error(
				`Error performing action ${nodeParameters.actionType} for bot ${this.credentials.clientId}:`,
				error,
			);
			return { success: false, error: error.message };
		}
	}

	async sendConfirmation(nodeParameters: any): Promise<any> {
		if (!this.state.ready) {
			return {
				success: false,
				confirmed: null,
				error: `Bot ${this.credentials.clientId} is not ready.`,
			};
		}
		let confirmationMessage: Message | null = null;
		try {
			const channel = (await this.client.channels
				.fetch(nodeParameters.channelId)
				.catch(() => null)) as TextChannel | null;
			if (!channel || !channel.isTextBased()) {
				throw new Error('Channel not found or not a text channel for confirmation');
			}

			const preparedMessage = prepareMessage(nodeParameters);
			// @ts-ignore - Ephemeral not directly supported on send, handle via interaction response later if needed
			// preparedMessage.ephemeral = true; // This won't work directly here

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				// Specify ButtonBuilder type
				new ButtonBuilder()
					.setCustomId(`confirm_yes_${Date.now()}`) // Unique ID per confirmation
					.setLabel('Yes')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId(`confirm_no_${Date.now()}`) // Unique ID per confirmation
					.setLabel('No')
					.setStyle(ButtonStyle.Danger),
			);
			preparedMessage.components = [row];

			confirmationMessage = await channel.send(preparedMessage);

			const filter = (interaction: any) =>
				interaction.isButton() && interaction.message.id === confirmationMessage?.id;
			const collector = channel.createMessageComponentCollector({
				filter,
				max: 1,
				time: nodeParameters.timeout || 60000, // Default 60 seconds timeout
			});

			return new Promise((resolve) => {
				let interactionHandled = false;
				collector.on('collect', async (interaction) => {
					interactionHandled = true;
					let confirmed: boolean | null = null;
					if (interaction.customId.startsWith('confirm_yes')) {
						confirmed = true;
					} else if (interaction.customId.startsWith('confirm_no')) {
						confirmed = false;
					}
					// Acknowledge interaction (optional, prevents "interaction failed" message)
					try {
						await interaction.deferUpdate(); // Use deferUpdate if no immediate response needed
					} catch (ackError) {
						console.warn('Could not acknowledge confirmation interaction:', ackError);
					}
					// Delete the confirmation message after interaction
					try {
						await confirmationMessage?.delete();
					} catch (delError) {
						console.warn('Could not delete confirmation message:', delError);
					}
					resolve({ confirmed: confirmed, success: true });
					collector.stop(); // Stop collector once handled
				});

				collector.on('end', async (collected) => {
					if (!interactionHandled) {
						// Timeout occurred
						console.log(`Confirmation timed out for message ${confirmationMessage?.id}`);
						try {
							await confirmationMessage?.delete(); // Clean up message on timeout
						} catch (delError) {
							console.warn('Could not delete confirmation message on timeout:', delError);
						}
						resolve({ confirmed: null, success: false, error: 'Confirmation timed out' });
					}
				});
			});
		} catch (error: any) {
			console.error(`Error sending confirmation for bot ${this.credentials.clientId}:`, error);
			// Attempt to clean up message if it exists and an error occurred before promise setup
			if (confirmationMessage) {
				try {
					await confirmationMessage.delete();
				} catch (e) {
					/* ignore */
				}
			}
			return { confirmed: null, success: false, error: error.message };
		}
	}
}
// +++ End: Added BotInstance Class +++

// +++ Start: Added IPCRouter Class +++
export class IPCRouter {
	private static botManager: BotManager = new BotManager();
	// ---> MODIFIED: Make registeredNodes static <---
	public static registeredNodes: Map<string, any> = new Map(); // Map<nodeId, { parameters: any, socket: any, credentials: ICredentials }>

	// ---> MODIFIED: Make initialize static <---
	static initialize() {
		// Configure IPC server
		ipc.config.id = 'bot'; // Reverted ID to match client expectation
		ipc.config.retry = 1500;
		ipc.config.silent = false; // Make IPC less silent for debugging

		ipc.serve(() => {
			console.log('IPC server started (bot)'); // Updated log message

			// ---> ADDED: Server-side event listeners <---
			ipc.server.on('connect', (socket: any) => {
				console.log(`[IPC Server] Client connected. Socket: ${socket.id ?? 'N/A'}`);
			});

			// Handle socket disconnection
			ipc.server.on('socket.disconnected', (socket: any, destroyedSocketID: string) => {
				console.log(`IPC Client disconnected: ${destroyedSocketID}`);
				this.unregisterNodeForSocket(socket); // Keep static reference here for internal use
			});

			ipc.server.on('error', (error: any) => {
				console.error('[IPC Server] Error:', error);
			});
			// ---> END ADDED <---

			this.registerHandlers(); // Keep static reference here for internal use
		});

		// ---> ADDED LOG <---
		console.log('[IPC Router] Attempting to start IPC server...');
		ipc.server.start();
		console.log('[IPC Router] IPC server start command issued.'); // Confirms start was called
	}

	// Helper to get nodes relevant to a specific bot instance
	static getNodesForBot(clientId: string): Map<string, any> {
		const relevantNodes = new Map<string, any>();
		for (const [nodeId, node] of this.registeredNodes.entries()) {
			if (node.credentials?.clientId === clientId) {
				relevantNodes.set(nodeId, node);
			}
		}
		return relevantNodes;
	}

	// Helper to emit to a specific node's socket
	static emitToNode(socket: any, event: string, data: any) {
		if (socket) {
			ipc.server.emit(socket, event, data);
		} else {
			console.warn(`Attempted to emit event ${event} to a null socket.`);
		}
	}

	private static registerHandlers() {
		// Handle credentials registration and bot connection
		ipc.server.on('credentials', async (data: ICredentials, socket: any) => {
			if (!data || !data.token || !data.clientId) {
				console.error('Credentials event received missing token or clientId.');
				this.emitToNode(socket, 'credentials', 'missing');
				return;
			}
			try {
				// Removed unused instanceId variable
				const { /* instanceId, */ status, error } = await this.botManager.connectBot(data);
				if (status === 'ready' || status === 'already') {
					this.emitToNode(socket, 'credentials', status); // 'ready' or 'already'
				} else {
					console.error(`Credentials error for ${data.clientId}: ${error}`);
					this.emitToNode(socket, 'credentials', 'error'); // General error
				}
			} catch (error: any) {
				console.error('Critical error handling credentials:', error);
				this.emitToNode(socket, 'credentials', 'error');
			}
		});

		// Handle guild listing
		ipc.server.on('list:guilds', async (data: { credentials: ICredentials }, socket: any) => {
			if (!data || !data.credentials) {
				console.error('list:guilds request missing credentials.');
				// ---> Return error object for consistency <---
				return this.emitToNode(socket, 'list:guilds', { error: 'Missing credentials' });
			}
			try {
				const botInstance = this.botManager.getBotByCredentials(data.credentials);
				// ---> Check if bot instance exists AND is ready <---
				if (!botInstance || !botInstance.isReady()) {
					const errorMsg = `Bot ${data.credentials.clientId} not found or not ready.`;
					console.warn(`list:guilds requested: ${errorMsg}`);
					// ---> Return error object <---
					this.emitToNode(socket, 'list:guilds', { error: errorMsg });
					return;
				}
				// ---> Fetch guilds (consider forceRefresh=false unless needed) <---
				const guilds = await botInstance.fetchGuilds(false);
				this.emitToNode(socket, 'list:guilds', guilds);
			} catch (error: any) {
				const errorMsg = `Error fetching guilds for ${data.credentials.clientId}: ${error.message}`;
				console.error(errorMsg);
				// ---> Return error object <---
				this.emitToNode(socket, 'list:guilds', { error: errorMsg });
			}
		});

		// Handle channel listing
		ipc.server.on(
			'list:channels',
			async (data: { credentials: ICredentials; guildIds: string[] }, socket: any) => {
				if (!data || !data.credentials || !data.guildIds) {
					console.error('list:channels request missing credentials or guildIds.');
					// ---> Return error object <---
					return this.emitToNode(socket, 'list:channels', { error: 'Missing credentials or guildIds' });
				}
				try {
					const botInstance = this.botManager.getBotByCredentials(data.credentials);
					// ---> Check if bot instance exists AND is ready <---
					if (!botInstance || !botInstance.isReady()) {
						const errorMsg = `Bot ${data.credentials.clientId} not found or not ready.`;
						console.warn(`list:channels requested: ${errorMsg}`);
						// ---> Return error object <---
						this.emitToNode(socket, 'list:channels', { error: errorMsg });
						return;
					}
					const channels = await botInstance.fetchChannels(data.guildIds);
					this.emitToNode(socket, 'list:channels', channels);
				} catch (error: any) {
					const errorMsg = `Error fetching channels for ${data.credentials.clientId}: ${error.message}`;
					console.error(errorMsg);
					// ---> Return error object <---
					this.emitToNode(socket, 'list:channels', { error: errorMsg });
				}
			},
		);

		// Handle role listing
		ipc.server.on(
			'list:roles',
			async (data: { credentials: ICredentials; guildIds: string[] }, socket: any) => {
				if (!data || !data.credentials || !data.guildIds) {
					console.error('list:roles request missing credentials or guildIds.');
					// ---> Return error object <---
					return this.emitToNode(socket, 'list:roles', { error: 'Missing credentials or guildIds' });
				}
				try {
					const botInstance = this.botManager.getBotByCredentials(data.credentials);
					// ---> Check if bot instance exists AND is ready <---
					if (!botInstance || !botInstance.isReady()) {
						const errorMsg = `Bot ${data.credentials.clientId} not found or not ready.`;
						console.warn(`list:roles requested: ${errorMsg}`);
						// ---> Return error object <---
						this.emitToNode(socket, 'list:roles', { error: errorMsg });
						return;
					}
					const roles = await botInstance.fetchRoles(data.guildIds);
					this.emitToNode(socket, 'list:roles', roles);
				} catch (error: any) {
					const errorMsg = `Error fetching roles for ${data.credentials.clientId}: ${error.message}`;
					console.error(errorMsg);
					// ---> Return error object <---
					this.emitToNode(socket, 'list:roles', { error: errorMsg });
				}
			},
		);

		// Register trigger node
		ipc.server.on('triggerNodeRegistered', (data: any, socket: any) => {
			if (!data || !data.nodeId || !data.credentials || !data.parameters) {
				console.error(
					'[IPC Router] triggerNodeRegistered event missing required data (nodeId, credentials, parameters).', // Added prefix
				);
				return;
			}
			// Added detailed log
			console.log(
				`[IPC Router] Registering trigger node: ${data.nodeId} for bot ${data.credentials.clientId} with type ${data.parameters?.type}`,
			);
			this.registeredNodes.set(data.nodeId, {
				parameters: data.parameters,
				socket: socket,
				credentials: data.credentials, // Store credentials with the node registration
			});
			// Ensure the bot for this node is connected
			this.botManager.connectBot(data.credentials).catch((err) => {
				console.error(
					`Error ensuring bot connection during node registration for ${data.nodeId}:`,
					err,
				);
			});
		});

		// Remove trigger node - Renamed event for clarity
		// ---> RENAMED from triggerNodeRemoved to triggerNodeUnregistered <---
		ipc.server.on('triggerNodeUnregistered', (data: { nodeId: string }, socket: any) => {
			if (data && data.nodeId) {
				// ---> Check if the socket matches the one stored for the node (security/sanity check) <---
				const node = this.registeredNodes.get(data.nodeId);
				if (node && node.socket === socket) {
					this.unregisterTriggerNode(data.nodeId);
				} else if (node) {
					console.warn(`[IPC Router] Received unregister for node ${data.nodeId} from non-matching socket.`);
				} else {
					console.log(`[IPC Router] Received unregister for already unknown node: ${data.nodeId}`);
				}
			} else {
				console.warn('[IPC Router] Received malformed triggerNodeUnregistered event.');
			}
		});


		// Handle message sending
		ipc.server.on(
			'send:message',
			async (
				data: { credentials: ICredentials; channelId: string; messageOptions: any },
				socket: any,
			) => {
				if (!data || !data.credentials || !data.channelId || !data.messageOptions) {
					console.error('send:message request missing required data.');
					return this.emitToNode(socket, 'callback:send:message', {
						success: false,
						error: 'Missing required data',
					});
				}
				try {
					const botInstance = this.botManager.getBotByCredentials(data.credentials);
					if (!botInstance) {
						this.emitToNode(socket, 'callback:send:message', {
							success: false,
							error: 'Bot instance not found for the provided credentials.',
						});
						return;
					}
					const result = await botInstance.sendMessage(data.channelId, data.messageOptions);
					this.emitToNode(socket, 'callback:send:message', result);
				} catch (error: any) {
					console.error(
						`Error processing send:message for bot ${data.credentials.clientId}:`,
						error,
					);
					this.emitToNode(socket, 'callback:send:message', {
						success: false,
						error: error.message,
					});
				}
			},
		);

		// Handle actions (role changes, message deletion)
		ipc.server.on(
			'send:action',
			async (data: { credentials: ICredentials } & IDiscordNodeActionParameters, socket: any) => {
				if (!data || !data.credentials || !data.actionType) {
					console.error('send:action request missing required data.');
					return this.emitToNode(socket, 'callback:send:action', {
						success: false,
						error: 'Missing required data',
					});
				}
				try {
					const botInstance = this.botManager.getBotByCredentials(data.credentials);
					if (!botInstance) {
						this.emitToNode(socket, 'callback:send:action', {
							success: false,
							error: 'Bot instance not found for the provided credentials.',
						});
						return;
					}
					// Pass only action parameters to the instance method
					const { credentials, ...actionParams } = data;
					const result = await botInstance.performAction(
						actionParams as IDiscordNodeActionParameters,
					);
					this.emitToNode(socket, 'callback:send:action', result);
				} catch (error: any) {
					console.error(
						`Error processing send:action for bot ${data.credentials.clientId}:`,
						error,
					);
					this.emitToNode(socket, 'callback:send:action', { success: false, error: error.message });
				}
			},
		);

		// Handle confirmations
		ipc.server.on(
			'send:confirmation',
			async (
				data: {
					credentials: ICredentials;
					channelId: string;
					messageOptions: any;
					timeout?: number;
				},
				socket: any,
			) => {
				if (!data || !data.credentials || !data.channelId || !data.messageOptions) {
					console.error('send:confirmation request missing required data.');
					return this.emitToNode(socket, 'callback:send:confirmation', {
						success: false,
						confirmed: null,
						error: 'Missing required data',
					});
				}
				try {
					const botInstance = this.botManager.getBotByCredentials(data.credentials);
					if (!botInstance) {
						this.emitToNode(socket, 'callback:send:confirmation', {
							success: false,
							confirmed: null,
							error: 'Bot instance not found for the provided credentials.',
						});
						return;
					}
					// Pass relevant parameters to the instance method
					const result = await botInstance.sendConfirmation(data);
					this.emitToNode(socket, 'callback:send:confirmation', result);
				} catch (error: any) {
					console.error(
						`Error processing send:confirmation for bot ${data.credentials.clientId}:`,
						error,
					);
					this.emitToNode(socket, 'callback:send:confirmation', {
						success: false,
						confirmed: null,
						error: error.message,
					});
				}
			},
		);
	}

	// Emit event data to all registered nodes that match the criteria
	static emitToRegisteredNodes(event: string, data: any, triggerType?: string, guildId?: string) {
		for (const [nodeId, node] of this.registeredNodes.entries()) {
			// 1. Check if the node's bot clientId matches the event's clientId
			if (node.credentials?.clientId !== data.clientId) {
				continue;
			}

			// 2. If triggerType is provided, check if the node is registered for this type
			if (triggerType && node.parameters?.type !== triggerType) {
				continue;
			}

			// 3. If guildId is provided, check if the node is listening to this guild (or all guilds)
			if (
				guildId &&
				node.parameters?.guildIds?.length > 0 &&
				!node.parameters.guildIds.includes(guildId)
			) {
				continue;
			}

			// If all checks pass, emit the event to this node
			const emitData = { ...data, nodeId }; // Add nodeId for reference
			// Added log before emitting
			console.log(
				`[IPC Router] Emitting event '${event}' to node ${nodeId} (Trigger Type: ${triggerType ?? 'N/A'}, Guild Filter: ${guildId ?? 'N/A'})`,
			);
			this.emitToNode(node.socket, event, emitData);
		}
	}

	// Unregister nodes associated with a disconnected socket
	private static unregisterNodeForSocket(socket: any) {
		const nodesToRemove: string[] = [];
		this.registeredNodes.forEach((node, nodeId) => {
			// ---> Use strict equality check <---
			if (node.socket === socket) {
				nodesToRemove.push(nodeId);
			}
		});

		nodesToRemove.forEach((nodeId) => {
			// ---> Call the unified unregister function <---
			this.unregisterTriggerNode(nodeId);
		});
	}

	// ---> Unified unregistration logic <---
	private static unregisterTriggerNode(nodeId: string) {
		console.log(`[IPC Router] Unregistering trigger node: ${nodeId}`);
		// ---> Check if node exists before deleting <---
		if (this.registeredNodes.has(nodeId)) {
			this.registeredNodes.delete(nodeId);
			console.log(`[IPC Router] Node ${nodeId} unregistered successfully.`);
		} else {
			console.log(`[IPC Router] Attempted to unregister node ${nodeId}, but it was not found.`);
		}
		// Optional: Check if any bot instances are now unused and can be disconnected
		// this.cleanupUnusedBots(); // Implement this if needed
	}
}
// +++ End: Added IPCRouter Class +++

// --- Standalone Utility Functions ---

// Moved prepareMessage outside classes as it's a utility
// ---> ADDED export <-----
export function prepareMessage(nodeParameters: any): any {
	// prepare embed messages, if they are set by the client
	const embedFiles: AttachmentBuilder[] = []; // Use AttachmentBuilder type
	let embed: EmbedBuilder | undefined;
	if (nodeParameters.embed) {
		embed = new EmbedBuilder();
		if (nodeParameters.title) embed.setTitle(nodeParameters.title);
		if (nodeParameters.url) embed.setURL(nodeParameters.url);
		if (nodeParameters.description) embed.setDescription(nodeParameters.description);
		if (nodeParameters.color) embed.setColor(nodeParameters.color as ColorResolvable);
		if (nodeParameters.timestamp) {
			try {
				const timestampDate = Date.parse(nodeParameters.timestamp);
				if (!isNaN(timestampDate)) {
					embed.setTimestamp(timestampDate);
				} else {
					console.warn(`Invalid timestamp format: ${nodeParameters.timestamp}`);
				}
			} catch (e) {
				console.warn(`Error parsing timestamp: ${nodeParameters.timestamp}`, e);
			}
		}
		if (nodeParameters.footerText) {
			let iconURL = nodeParameters.footerIconUrl;
			if (iconURL && iconURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = iconURL.split(',')[1];
					const buffer = Buffer.from(base64Data, 'base64');
					const mimeMatch = iconURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,/);
					const extension = mimeMatch ? mimeMatch[1] : 'png'; // Default to png
					const fileName = `footer.${extension}`;
					const file = new AttachmentBuilder(buffer, { name: fileName });
					embedFiles.push(file);
					iconURL = `attachment://${fileName}`;
				} catch (e) {
					console.error('Error processing footerIconUrl data URI:', e);
					iconURL = undefined; // Clear invalid URL
				}
			}
			embed.setFooter({
				text: nodeParameters.footerText,
				...(iconURL ? { iconURL } : {}),
			});
		}
		if (nodeParameters.imageUrl) {
			let imageUrl = nodeParameters.imageUrl;
			if (imageUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = imageUrl.split(',')[1];
					const buffer = Buffer.from(base64Data, 'base64');
					const mimeMatch = imageUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/);
					const extension = mimeMatch ? mimeMatch[1] : 'png';
					const fileName = `image.${extension}`;
					const file = new AttachmentBuilder(buffer, { name: fileName });
					embedFiles.push(file);
					embed.setImage(`attachment://${fileName}`);
				} catch (e) {
					console.error('Error processing imageUrl data URI:', e);
					// Don't set image if data URI is invalid
				}
			} else {
				embed.setImage(imageUrl); // Use URL directly
			}
		}
		if (nodeParameters.thumbnailUrl) {
			let thumbnailUrl = nodeParameters.thumbnailUrl;
			if (thumbnailUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = thumbnailUrl.split(',')[1];
					const buffer = Buffer.from(base64Data, 'base64');
					const mimeMatch = thumbnailUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/);
					const extension = mimeMatch ? mimeMatch[1] : 'png';
					const fileName = `thumbnail.${extension}`;
					const file = new AttachmentBuilder(buffer, { name: fileName });
					embedFiles.push(file);
					embed.setThumbnail(`attachment://${fileName}`);
				} catch (e) {
					console.error('Error processing thumbnailUrl data URI:', e);
					// Don't set thumbnail if data URI is invalid
				}
			} else {
				embed.setThumbnail(thumbnailUrl); // Use URL directly
			}
		}
		if (nodeParameters.authorName) {
			let iconURL = nodeParameters.authorIconUrl;
			if (iconURL && iconURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = iconURL.split(',')[1];
					const buffer = Buffer.from(base64Data, 'base64');
					const mimeMatch = iconURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,/);
					const extension = mimeMatch ? mimeMatch[1] : 'png';
					const fileName = `author.${extension}`;
					const file = new AttachmentBuilder(buffer, { name: fileName });
					embedFiles.push(file);
					iconURL = `attachment://${fileName}`;
				} catch (e) {
					console.error('Error processing authorIconUrl data URI:', e);
					iconURL = undefined; // Clear invalid URL
				}
			}
			embed.setAuthor({
				name: nodeParameters.authorName,
				...(iconURL ? { iconURL } : {}),
				...(nodeParameters.authorUrl ? { url: nodeParameters.authorUrl } : {}),
			});
		}
		if (nodeParameters.fields?.field) {
			nodeParameters.fields.field.forEach(
				(field: { name?: string; value?: string; inline?: boolean }) => {
					// Ensure name and value are not empty strings, replace with zero-width space if so
					const name = field.name?.trim() || '\u200B';
					const value = field.value?.trim() || '\u200B';
					if (embed) {
						embed.addFields({
							name: name,
							value: value,
							inline: field.inline || false, // Default inline to false
						});
					}
				},
			);
		}
	}

	// add all the mentions at the end of the message
	let mentions = '';
	if (nodeParameters.mentionRoles) {
		nodeParameters.mentionRoles.forEach((role: string) => {
			if (role) mentions += ` <@&${role}>`;
		});
	}
	// Add user mentions if provided
	if (nodeParameters.mentionUsers) {
		nodeParameters.mentionUsers.forEach((user: string) => {
			if (user) mentions += ` <@${user}>`;
		});
	}

	let content = '';
	if (nodeParameters.content) content += nodeParameters.content;
	// Append mentions to content if they exist
	if (mentions) content += mentions;

	// if there are files, add them aswell
	let files: (AttachmentBuilder | Buffer | string)[] = []; // Allow different types
	if (nodeParameters.files?.file) {
		files = nodeParameters.files?.file
			.map((file: { url: string; name?: string }) => {
				if (file.url.match(/^data:/)) {
					try {
						const base64Data = file.url.split(',')[1];
						const buffer = Buffer.from(base64Data, 'base64');
						// Try to determine filename/type if possible, otherwise default
						const mimeMatch = file.url.match(/^data:(.*);base64,/);
						const name =
							file.name || `file.${mimeMatch ? mimeMatch[1].split('/')[1] || 'bin' : 'bin'}`;
						return new AttachmentBuilder(buffer, { name });
					} catch (e) {
						console.error('Error processing file data URI:', e);
						return null; // Skip invalid file
					}
				}
				// If it's a URL, return it directly. Discord.js handles fetching.
				return file.url;
			})
			.filter((f: any) => f !== null); // Filter out nulls from failed processing
	}
	if (embedFiles.length) files = files.concat(embedFiles);

	// prepare the message object how discord likes it
	const sendObject: any = {
		// Use 'any' for flexibility or define a stricter type
		// Ensure content is not undefined, default to empty string if null/undefined
		content: content || '',
		// Only include embeds array if embed exists
		...(embed ? { embeds: [embed] } : {}),
		// Only include files array if it's not empty
		...(files.length ? { files } : {}),
		// Add allowed mentions if needed, e.g., to control pings
		// allowedMentions: { parse: [] } // Example: disable all pings
	};

	// Add reply options if messageIdToReply is provided
	if (nodeParameters.messageIdToReply) {
		sendObject.reply = {
			messageReference: nodeParameters.messageIdToReply,
			failIfNotExists: nodeParameters.failReplyIfNotExists ?? false, // Default to false
		};
	}

	return sendObject;
}

// --- Main Execution ---
export default function () {
	// Initialize the IPC Router which sets up the server and handlers
	// ---> MODIFIED: Call initialize statically <---
	IPCRouter.initialize();

	console.log('Discord Bot Process Started with Multi-Credential Support');

	// Keep the process alive
	// setInterval(() => {
	//     // Optional: Add periodic health checks or cleanup tasks here
	// }, 60000); // Example: Run every minute
}
