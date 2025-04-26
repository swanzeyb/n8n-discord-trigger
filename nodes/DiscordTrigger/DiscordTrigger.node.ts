import {
	NodeOperationError,
	NodeConnectionType,
	type INodeType,
	type INodeTypeDescription,
	type ITriggerFunctions,
	type ITriggerResponse,
	type INodePropertyOptions,
} from 'n8n-workflow';
import { options } from './DiscordTrigger.node.options';
import bot from '../bot';
import ipc from 'node-ipc';
import {
	connection,
	ICredentials,
	getChannels as getChannelsHelper,
	getRoles as getRolesHelper,
	getGuilds as getGuildsHelper,
} from '../helper';

// we start the bot if we are in the main process
if (!process.send) bot();

export class DiscordTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Discord Trigger',
		name: 'discordTrigger',
		group: ['trigger', 'discord'],
		version: 1,
		description: 'Discord Trigger on message',
		defaults: {
			name: 'Discord Trigger',
		},
		icon: 'file:discord-logo.svg',
		inputs: [],
		outputs: ['main'] as NodeConnectionType[],
		credentials: [
			{
				name: 'discordBotTriggerApi',
				required: true,
			},
		],
		properties: options,
	};

	methods = {
		loadOptions: {
			async getGuilds(): Promise<INodePropertyOptions[]> {
				return (await getGuildsHelper(this).catch((e) => e)) as { name: string; value: string }[];
			},
			async getChannels(): Promise<INodePropertyOptions[]> {
				// @ts-ignore
				const selectedGuilds = this.getNodeParameter('guildIds', []);
				if (!selectedGuilds.length) {
					// @ts-ignore
					throw new NodeOperationError(
						'Please select at least one server before choosing channels.',
					);
				}

				return (await getChannelsHelper(this, selectedGuilds).catch((e) => e)) as {
					name: string;
					value: string;
				}[];
			},
			async getRoles(): Promise<INodePropertyOptions[]> {
				// @ts-ignore
				const selectedGuilds = this.getNodeParameter('guildIds', []);
				if (!selectedGuilds.length) {
					// @ts-ignore
					throw new NodeOperationError(
						'Please select at least one server before choosing channels.',
					);
				}

				return (await getRolesHelper(this, selectedGuilds).catch((e) => e)) as {
					name: string;
					value: string;
				}[];
			},
		},
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		let credentials: ICredentials;
		try {
			credentials = (await this.getCredentials('discordBotTriggerApi')) as ICredentials;
			if (!credentials?.token) {
				throw new NodeOperationError(this.getNode(), 'No token provided in credentials.');
			}
		} catch (error) {
			// If credentials node does not exist or there's an issue fetching them
			if (error instanceof NodeOperationError) {
				throw error;
			}
			// Include original error message in the new error
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(this.getNode(), `Error fetching credentials: ${errorMessage}`);
		}

		try {
			console.log(`Attempting to establish Discord connection for node ${this.getNode().id}...`);
			await connection(credentials); // Assuming connection handles its own logging/errors internally or throws
			console.log(`Discord connection established for node ${this.getNode().id}.`);
		} catch (error) {
			// Include original error message in the new error
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(
				this.getNode(),
				`Failed to establish Discord connection: ${errorMessage}`,
			);
		}

		// Wrap IPC connection in a Promise
		return new Promise<ITriggerResponse>((resolve, reject) => {
			const nodeId = this.getNode().id;
			const triggerParameters: any = {};
			Object.keys(this.getNode().parameters).forEach((key) => {
				triggerParameters[key] = this.getNodeParameter(key, '') as any;
			});

			console.log(`Attempting to connect to IPC server 'discord-bot-server' for node ${nodeId}...`);
			ipc.config.stopRetrying = false; // Allow retries
			ipc.config.maxRetries = 3;
			ipc.config.silent = false; // Make IPC less silent for debugging

			// ---> ADDED LOG <---
			console.log(`[Node ${nodeId}] Initiating ipc.connectTo('discord-bot-server')...`);

			// Connect to the IPC server
			ipc.connectTo('discord-bot-server', () => {
				// ---> ADDED LOG <---
				console.log(`[Node ${nodeId}] ipc.connectTo callback executed.`);

				ipc.of['discord-bot-server'].on('connect', () => {
					console.log(
						`[Node ${nodeId}] Connected to IPC server 'discord-bot-server'. Setting up listeners and registering.`,
					);
					this.ipcConnected = true;

					// Register the node with the bot process
					const registrationData = {
						nodeId: nodeId,
						credentials: botCredentials,
						parameters: triggerParameters,
					};
					// ---> ADDED LOG <---
					console.log(
						`[Node ${nodeId}] Emitting triggerNodeRegistered with data:`,
						registrationData,
					);
					ipc.of['discord-bot-server'].emit('triggerNodeRegistered', registrationData);
					// ---> ADDED LOG <---
					console.log(`[Node ${nodeId}] triggerNodeRegistered emitted.`);

					// Setup listeners for events from the bot process
					this.setupIpcListeners(ipc, nodeId, triggerParameters, pushData);
				});

				ipc.of['discord-bot-server'].on('disconnect', () => {
					console.log(`[Node ${nodeId}] Disconnected from IPC server 'discord-bot-server'.`);
					this.ipcConnected = false;
					// Optionally handle reconnection logic here if needed
				});

				ipc.of['discord-bot-server'].on('error', (error: any) => {
					console.error(`[Node ${nodeId}] IPC Error:`, error);
					this.ipcConnected = false;
					// Handle error appropriately, maybe reject the promise
				});

				// ---> ADDED: More specific error listener directly on the socket object <---
				if (ipc.of['discord-bot-server']?.socket) {
					ipc.of['discord-bot-server'].socket.on('error', (socketError: any) => {
						console.error(`[Node ${nodeId}] IPC Socket Error:`, socketError);
						this.ipcConnected = false;
						// Reject the promise if the connection fails critically
						reject(
							new NodeOperationError(
								this.getNode(),
								`IPC Socket Error: ${socketError.message || socketError}`,
							),
						);
					});
				} else {
					console.warn(
						`[Node ${nodeId}] IPC socket object not immediately available after connectTo callback.`,
					);
				}
			});

			// ---> ADDED: Listener for 'error' event on the IPC client itself <---
			ipc.of['discord-bot-server']?.on('error', (clientError: any) => {
				console.error(`[Node ${nodeId}] IPC Client Error (early listener):`, clientError);
				// This might catch errors happening before the 'connect' event
				if (!this.ipcConnected) {
					// Only reject if we haven't successfully connected yet
					reject(
						new NodeOperationError(
							this.getNode(),
							`IPC Client Error: ${clientError.message || clientError}`,
						),
					);
				}
			});

			// Handle potential connection errors during the initial connection attempt
			// Need to access the socket instance potentially before the connectTo callback fires
			// This might be tricky with node-ipc, let's rely on the error handler inside connectTo for now
			// or check if ipc.of['discord-bot-server'] exists and attach error handler immediately.
			const potentialServer = ipc.of['discord-bot-server'];
			if (potentialServer) {
				potentialServer.on('error', (err: any) => {
					if (!potentialServer.socket.connecting && !potentialServer.socket.writable) {
						console.error(
							`[Node ${this.getNode().id}] Initial IPC connection failed or errored early:`,
							err,
						);
						// Include original error message in the new error
						const errorMessage = err instanceof Error ? err.message : String(err);
						reject(
							new NodeOperationError(
								this.getNode(),
								`Failed to connect to IPC server: ${errorMessage}`,
							),
						);
					}
				});
			} else {
				// If the server object isn't even available yet, we might need a different approach
				// For now, the error handling within the connectTo callback is the primary mechanism.
			}
		});
	}
}
