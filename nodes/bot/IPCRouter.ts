import { ICredentials } from '../../credentials/DiscordBotTriggerApi.credentials'; // Assuming ICredentials path
import { IDiscordNodeActionParameters } from '../DiscordInteraction/DiscordInteraction.node'; // Keep only used import
import { BotManager } from './BotManager'; // Import BotManager

// Declare ipc variable if it's globally available or imported elsewhere
// You might need to install a type definition for your IPC library, e.g., @types/node-ipc
declare const ipc: any; // Adjust type as needed

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
				let botInstance = this.botManager.getBotByCredentials(data.credentials); // Use let

				// ---> ADDED: Attempt connection if bot not found or not ready <---
				if (!botInstance || !botInstance.isReady()) {
					console.log(
						`Bot ${data.credentials.clientId} not found or not ready. Attempting connection...`,
					);
					const { status, error } = await this.botManager.connectBot(data.credentials);
					if (status === 'error') {
						const errorMsg = `Failed to connect bot ${data.credentials.clientId} for list:guilds: ${error}`;
						console.error(errorMsg);
						this.emitToNode(socket, 'list:guilds', { error: errorMsg });
						return;
					}
					// Re-fetch instance after connection attempt
					botInstance = this.botManager.getBotByCredentials(data.credentials);
					if (!botInstance || !botInstance.isReady()) {
						// Check again
						const errorMsg = `Bot ${data.credentials.clientId} still not ready after connection attempt.`;
						console.warn(`list:guilds requested: ${errorMsg}`);
						this.emitToNode(socket, 'list:guilds', { error: errorMsg });
						return;
					}
					console.log(`Bot ${data.credentials.clientId} connected successfully.`);
				}
				// ---> END ADDED <---

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
					return this.emitToNode(socket, 'list:channels', {
						error: 'Missing credentials or guildIds',
					});
				}
				try {
					let botInstance = this.botManager.getBotByCredentials(data.credentials); // Use let

					// ---> ADDED: Attempt connection if bot not found or not ready <---
					if (!botInstance || !botInstance.isReady()) {
						console.log(
							`Bot ${data.credentials.clientId} not found or not ready. Attempting connection...`,
						);
						const { status, error } = await this.botManager.connectBot(data.credentials);
						if (status === 'error') {
							const errorMsg = `Failed to connect bot ${data.credentials.clientId} for list:channels: ${error}`;
							console.error(errorMsg);
							this.emitToNode(socket, 'list:channels', { error: errorMsg });
							return;
						}
						// Re-fetch instance after connection attempt
						botInstance = this.botManager.getBotByCredentials(data.credentials);
						if (!botInstance || !botInstance.isReady()) {
							// Check again
							const errorMsg = `Bot ${data.credentials.clientId} still not ready after connection attempt.`;
							console.warn(`list:channels requested: ${errorMsg}`);
							this.emitToNode(socket, 'list:channels', { error: errorMsg });
							return;
						}
						console.log(`Bot ${data.credentials.clientId} connected successfully.`);
					}
					// ---> END ADDED <---

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
					return this.emitToNode(socket, 'list:roles', {
						error: 'Missing credentials or guildIds',
					});
				}
				try {
					let botInstance = this.botManager.getBotByCredentials(data.credentials); // Use let

					// ---> ADDED: Attempt connection if bot not found or not ready <---
					if (!botInstance || !botInstance.isReady()) {
						console.log(
							`Bot ${data.credentials.clientId} not found or not ready. Attempting connection...`,
						);
						const { status, error } = await this.botManager.connectBot(data.credentials);
						if (status === 'error') {
							const errorMsg = `Failed to connect bot ${data.credentials.clientId} for list:roles: ${error}`;
							console.error(errorMsg);
							this.emitToNode(socket, 'list:roles', { error: errorMsg });
							return;
						}
						// Re-fetch instance after connection attempt
						botInstance = this.botManager.getBotByCredentials(data.credentials);
						if (!botInstance || !botInstance.isReady()) {
							// Check again
							const errorMsg = `Bot ${data.credentials.clientId} still not ready after connection attempt.`;
							console.warn(`list:roles requested: ${errorMsg}`);
							this.emitToNode(socket, 'list:roles', { error: errorMsg });
							return;
						}
						console.log(`Bot ${data.credentials.clientId} connected successfully.`);
					}
					// ---> END ADDED <---

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
					console.warn(
						`[IPC Router] Received unregister for node ${data.nodeId} from non-matching socket.`,
					);
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
