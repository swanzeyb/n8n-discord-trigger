import {
	Client,
	GatewayIntentBits,
	ChannelType,
	TextChannel,
	Message,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	GuildMember,
	Role,
	PartialGuildMember,
} from 'discord.js';
import { ICredentials } from '../../credentials/DiscordBotTriggerApi.credentials'; // Assuming ICredentials path
import { IDiscordNodeActionParameters } from '../DiscordInteraction/DiscordInteraction.node'; // Keep only used import
import { IPCRouter } from './IPCRouter'; // Use relative path
import { prepareMessage } from './utils'; // Use relative path

interface BotState {
	ready: boolean;
	login: boolean;
	error: string | null;
	guildsFetched: boolean;
}

// +++ Start: Added BotInstance Class +++
export class BotInstance {
	public client: Client; // Made public for IPCRouter access
	private credentials: ICredentials;
	private state: BotState;

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
					// ipc.server.broadcast('discordMessage', payload); // Broadcast the event - Handled by IPCRouter
					IPCRouter.emitToRegisteredNodes('discordMessage', payload, 'message', message.guild?.id);
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
