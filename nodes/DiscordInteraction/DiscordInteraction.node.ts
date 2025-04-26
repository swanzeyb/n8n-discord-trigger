import {
	type INodeType,
	type INodeExecutionData,
	type INodeTypeDescription,
	type INodePropertyOptions,
	type IExecuteFunctions,
	INodeOutputConfiguration,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';
import { options } from './DiscordInteraction.node.options';
import {
	connection, // Re-added import
	ICredentials,
	getChannels as getChannelsHelper,
	getRoles as getRolesHelper,
	getGuilds as getGuildsHelper,
	ipcRequest, // Import ipcRequest
} from '../helper';

export interface IDiscordInteractionMessageParameters {
	executionId: string;
	triggerPlaceholder: boolean;
	triggerChannel: boolean;
	channelId: string;
	embed: boolean;
	title: string;
	description: string;
	url: string;
	color: string;
	timestamp: string;
	footerText: string;
	footerIconUrl: string;
	imageUrl: string;
	thumbnailUrl: string;
	authorName: string;
	authorIconUrl: string;
	authorUrl: string;
	fields: {
		field?: {
			name: string;
			value: string;
			inline: boolean;
		}[];
	};
	mentionRoles: string[];
	content: string;
	files: {
		file?: {
			url: string;
		}[];
	};
}

export interface IDiscordNodeActionParameters {
	executionId: string;
	triggerPlaceholder: boolean;
	triggerChannel: boolean;
	channelId: string;
	guildId: string;
	apiKey: string;
	baseUrl: string;
	actionType: string;
	removeMessagesNumber: number;
	userId?: string;
	roleUpdateIds?: string[] | string;
}

export class DiscordInteraction implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Discord Interaction',
		name: 'discordInteraction',
		group: ['discord'],
		version: 1,
		description: 'Sends messages, embeds and prompts to Discord',
		defaults: {
			name: 'Discord Interaction',
		},
		icon: 'file:discord-logo.svg',
		inputs: ['main'] as NodeConnectionType[],
		outputs: [{ type: 'main' }] as INodeOutputConfiguration[],
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
			async getChannels(): Promise<INodePropertyOptions[]> {
				// @ts-ignore
				const selectedGuilds = this.getNodeParameter('guildIds', []);
				console.log('selectedGuilds', selectedGuilds);

				if (!selectedGuilds.length) {
					// @ts-ignore
					throw new NodeOperationError(
						'Please select at least one server before choosing channels.',
					);
				}

				return await getChannelsHelper(this, selectedGuilds).catch((e) => e);
			},
			async getRoles(): Promise<INodePropertyOptions[]> {
				// @ts-ignore
				const selectedGuilds = this.getNodeParameter('guildIds', []);
				console.log('selectedGuilds', selectedGuilds);

				if (!selectedGuilds.length) {
					// @ts-ignore
					throw new NodeOperationError(
						'Please select at least one server before choosing channels.',
					);
				}
				return await getRolesHelper(this, selectedGuilds).catch((e) => e);
			},
			async getGuilds(): Promise<INodePropertyOptions[]> {
				return await getGuildsHelper(this).catch((e) => e);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const executionId = this.getExecutionId();

		// fetch credentials
		let credentials: ICredentials; // Declare with the correct type
		try {
			const credentialData = await this.getCredentials('discordBotTriggerApi').catch((e) => {
				throw e;
			});
			// Use type guards to ensure properties exist and are strings
			if (
				!credentialData ||
				typeof credentialData.clientId !== 'string' ||
				typeof credentialData.token !== 'string'
			) {
				throw new NodeOperationError(
					this.getNode(),
					'Credentials not found or incomplete (missing clientId or token)!',
				);
			}
			// Assign properties directly after validation
			credentials = {
				clientId: credentialData.clientId,
				token: credentialData.token,
				// Include optional properties if they exist and are strings
				apiKey: typeof credentialData.apiKey === 'string' ? credentialData.apiKey : undefined,
				baseUrl: typeof credentialData.baseUrl === 'string' ? credentialData.baseUrl : undefined,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new NodeOperationError(this.getNode(), `Failed to get credentials: ${errorMessage}`);
		}

		// Ensure the bot instance for these credentials is ready before proceeding
		try {
			await connection(credentials);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			// Handle connection errors appropriately, maybe rethrow or return error data
			throw new NodeOperationError(
				this.getNode(),
				`Failed to establish connection with bot process: ${errorMessage}`,
			);
		}

		const type = this.getNodeParameter('type', 0) as string;

		// Define keys that belong in messageOptions
		const messageOptionKeys = [
			'content',
			'embed',
			'title',
			'description',
			'url',
			'color',
			'timestamp',
			'footerText',
			'footerIconUrl',
			'imageUrl',
			'thumbnailUrl',
			'authorName',
			'authorIconUrl',
			'authorUrl',
			'fields',
			'files',
			'mentionRoles',
			'mentionUsers', // Added mentionUsers
			'messageIdToReply',
			'failReplyIfNotExists',
		];

		if (type === 'confirm') {
			const returnData: INodeExecutionData[][] = [[], [], []];
			const nodeParameters: Record<string, any> = {};
			Object.keys(this.getNode().parameters).forEach((key) => {
				nodeParameters[key] = this.getNodeParameter(key, 0, '');
			});
			nodeParameters.executionId = executionId; // Add executionId

			// Construct messageOptions
			const messageOptions: Record<string, any> = {};
			messageOptionKeys.forEach((key) => {
				if (nodeParameters[key] !== undefined) {
					messageOptions[key] = nodeParameters[key];
				}
			});

			// Construct payload
			const payload = {
				channelId: nodeParameters.channelId,
				messageOptions: messageOptions,
				timeout: nodeParameters.timeout,
				// executionId: executionId, // executionId is part of nodeParameters, maybe not needed here if bot.ts doesn't expect it separately for confirmation
			};

			try {
				// Use ipcRequest helper
				const response = await ipcRequest('send:confirmation', payload, credentials);
				console.log('Confirmation response:', response);

				if (response.confirmed === null)
					returnData[2] = this.getInputData(); // Timeout/Error branch
				else if (response.confirmed === true)
					returnData[0] = this.getInputData(); // Yes branch
				else returnData[1] = this.getInputData(); // No branch
			} catch (error: any) {
				console.error('Confirmation IPC request failed:', error);
				// Assume timeout/error path on failure
				returnData[2] = this.getInputData();
				// Optionally re-throw or handle specific errors
				// throw new NodeOperationError(this.getNode(), `Confirmation failed: ${error.message}`);
			}

			return returnData;
		} else {
			// Handle 'message' and 'action' types
			const returnData: INodeExecutionData[] = [];
			const items: INodeExecutionData[] = this.getInputData();

			for (let itemIndex: number = 0; itemIndex < items.length; itemIndex++) {
				try {
					const nodeParameters: any = {};
					Object.keys(this.getNode().parameters).forEach((key) => {
						nodeParameters[key] = this.getNodeParameter(key, itemIndex, '') as any;
					});
					nodeParameters.executionId = executionId; // Add executionId

					const interactionType = nodeParameters.type as string; // 'message' or 'action'
					let payload: any;
					let eventType: string;

					if (interactionType === 'message') {
						eventType = 'send:message';
						// Construct messageOptions
						const messageOptions: Record<string, any> = {};
						messageOptionKeys.forEach((key) => {
							if (nodeParameters[key] !== undefined) {
								messageOptions[key] = nodeParameters[key];
							}
						});
						payload = {
							channelId: nodeParameters.channelId,
							messageOptions: messageOptions,
							// executionId: executionId, // If needed by handler
						};
					} else if (interactionType === 'action') {
						eventType = 'send:action';
						// Payload includes credentials merged with nodeParameters for action
						payload = { ...nodeParameters }; // Pass all node params for action
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Unsupported interaction type: ${interactionType}`,
						);
					}

					// Use ipcRequest helper
					const res = await ipcRequest(eventType, payload, credentials);

					// Process result (assuming ipcRequest resolves with the callback data)
					returnData.push({
						json: {
							...(res || {}), // Include all properties from the response
							// Ensure specific fields are present if needed downstream
							// value: res?.value,
							// channelId: res?.channelId,
							// userId: res?.userId,
							// userName: res?.userName,
							// userTag: res?.userTag,
							// messageId: res?.messageId,
							// action: res?.action,
						},
						pairedItem: { item: itemIndex }, // Ensure pairing if needed
					});
				} catch (error: any) {
					if (this.continueOnFail()) {
						returnData.push({
							json: { error: error instanceof Error ? error.message : String(error) },
							pairedItem: { item: itemIndex },
						});
						continue;
					}
					throw error; // Re-throw if not continuing on fail
				}
			}

			return this.prepareOutputData(returnData);
		}
	}
}
