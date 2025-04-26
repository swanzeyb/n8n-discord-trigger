import {
	NodeOperationError,
	NodeConnectionType,
	type INodeType,
	type INodeTypeDescription,
	type ITriggerFunctions,
	type ITriggerResponse,
	type INodePropertyOptions,
	type ILoadOptionsFunctions,
	type IDataObject,
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
			async getGuilds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return (await getGuildsHelper(this).catch((e) => e)) as { name: string; value: string }[];
			},
			async getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// @ts-ignore - getNodeParameter exists but type inference might struggle here
				const selectedGuilds = this.getNodeParameter('guildIds', []) as string[];
				if (!selectedGuilds.length) {
					// @ts-ignore - getNode exists but type inference might struggle here
					throw new NodeOperationError(
						this.getNode(),
						'Please select at least one server before choosing channels.',
					);
				}

				return (await getChannelsHelper(this, selectedGuilds).catch((e) => e)) as {
					name: string;
					value: string;
				}[];
			},
			async getRoles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// @ts-ignore - getNodeParameter exists but type inference might struggle here
				const selectedGuilds = this.getNodeParameter('guildIds', []) as string[];
				if (!selectedGuilds.length) {
					// @ts-ignore - getNode exists but type inference might struggle here
					throw new NodeOperationError(
						this.getNode(),
						'Please select at least one server before choosing roles.',
					);
				}
				return (await getRolesHelper(this, selectedGuilds).catch((e) => e)) as {
					name: string;
					value: string;
				}[];
			},
		},
	};

	// ---> CORRECTED: trigger method is a direct class member with ITriggerFunctions context <---
	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse | undefined> {
		// ---> Added | undefined to return type
		let credentials: ICredentials;
		try {
			credentials = (await this.getCredentials('discordBotTriggerApi')) as ICredentials;
			if (!credentials?.token) {
				throw new NodeOperationError(this.getNode(), 'No token provided in credentials.');
			}
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(this.getNode(), `Error fetching credentials: ${errorMessage}`);
		}

		try {
			console.log(`Attempting to establish Discord connection for node ${this.getNode().id}...`);
			await connection(credentials);
			console.log(`Discord connection established for node ${this.getNode().id}.`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(
				this.getNode(),
				`Failed to establish Discord connection: ${errorMessage}`,
			);
		}

		let ipcConnected = false;
		const setupIpcListeners = (
			ipcInstance: typeof ipc,
			nodeId: string,
			triggerParams: IDataObject,
		) => {
			const server = ipcInstance.of['bot'];
			if (!server) {
				console.error(`[Node ${nodeId}] IPC server reference 'bot' not found.`);
				return;
			}
			server.on('discordMessage', (messageData: { node: string; data: IDataObject }) => {
				if (messageData.node === nodeId) {
					console.log(`[Node ${nodeId}] Received discordMessage:`, messageData.data);
					this.emit([this.helpers.returnJsonArray([messageData.data])]);
				}
			});
			console.log(`[Node ${nodeId}] IPC listeners set up.`);
		};

		return new Promise<ITriggerResponse>((resolve, reject) => {
			const nodeId = this.getNode().id;
			const triggerParameters: IDataObject = {};
			Object.keys(this.getNode().parameters).forEach((key) => {
				triggerParameters[key] = this.getNodeParameter(key) as any;
			});

			console.log(`Attempting to connect to IPC server 'bot' for node ${nodeId}...`);
			ipc.config.stopRetrying = false;
			ipc.config.maxRetries = 3;
			ipc.config.silent = false;

			console.log(`[Node ${nodeId}] Initiating ipc.connectTo('bot')...`);

			ipc.connectTo('bot', () => {
				console.log(`[Node ${nodeId}] ipc.connectTo callback executed.`);

				const server = ipc.of['bot'];
				if (!server) {
					console.error(`[Node ${nodeId}] Failed to get IPC server reference in connect callback.`);
					reject(
						new NodeOperationError(this.getNode(), 'Failed to establish IPC connection reference.'),
					);
					return;
				}

				// ---> MOVED: Setup listeners and register immediately after getting server reference
				console.log(
					`[Node ${nodeId}] IPC connection established/confirmed. Setting up listeners and registering.`,
				);
				ipcConnected = true;

				const registrationData = {
					nodeId: nodeId,
					credentials: credentials,
					parameters: triggerParameters,
				};
				console.log(`[Node ${nodeId}] Emitting triggerNodeRegistered with data:`, registrationData);
				server.emit('triggerNodeRegistered', registrationData);
				console.log(`[Node ${nodeId}] triggerNodeRegistered emitted.`);

				setupIpcListeners(ipc, nodeId, triggerParameters);

				// Setup listeners for disconnect and error
				server.on('disconnect', () => {
					console.log(`[Node ${nodeId}] Disconnected from IPC server 'bot'.`);
					ipcConnected = false;
				});

				server.on('error', (error: any) => {
					console.error(`[Node ${nodeId}] IPC Error:`, error);
					const wasConnected = ipcConnected;
					ipcConnected = false;
					// Only reject if we weren't already connected and setup
					// If we were connected, the disconnect handler might manage cleanup
					if (!wasConnected) {
						reject(
							new NodeOperationError(
								this.getNode(),
								`IPC Connection Error: ${error.message || error}`,
							),
						);
					}
				});

				// Resolve the promise with the close function
				resolve({
					closeFunction: async () => {
						console.log(`[Node ${nodeId}] Closing trigger. Disconnecting from IPC.`);
						if (ipcConnected) {
							const serverRef = ipc.of['bot']; // ---> Get reference before check
							if (serverRef) {
								// ---> Use RENAMED event 'triggerNodeUnregistered' <---
								serverRef.emit('triggerNodeUnregistered', { nodeId });
								console.log(`[Node ${nodeId}] Emitted triggerNodeUnregistered.`); // ---> Added log
								ipc.disconnect('bot');
								console.log(`[Node ${nodeId}] Called ipc.disconnect('bot').`); // ---> Added log
							} else {
								console.warn(`[Node ${nodeId}] IPC server reference 'bot' not found during close.`);
							}
							ipcConnected = false; // ---> Set ipcConnected to false after attempting disconnect
							// console.log(`[Node ${nodeId}] Disconnected from IPC server.`); // ---> Redundant log? ipc.disconnect is async
						} else {
							console.log(`[Node ${nodeId}] Already disconnected from IPC, skipping unregister emit.`); // ---> Added log
						}
					},
				});
			});
		});
	}
}
