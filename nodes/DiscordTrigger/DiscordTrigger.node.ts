import {
	type INodeType,
	type INodeTypeDescription,
	type ITriggerFunctions,
	type ITriggerResponse,
	type INodePropertyOptions,
	NodeOperationError,
	NodeConnectionType,
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
		const credentials = (await this.getCredentials('discordBotTriggerApi').catch(
			(e) => e,
		)) as any as ICredentials;

		if (!credentials?.token) {
			console.log('No token given.');

			return {};
		}

		await connection(credentials).catch((e) => e);

		// Connect to the correct IPC server ID
		ipc.connectTo('discord-bot-server', () => {
			console.log('Connected to IPC server (discord-bot-server)');

			// Use the correct server reference
			const server = ipc.of['discord-bot-server'];
			if (!server) {
				console.error('Failed to get IPC server reference (discord-bot-server)');
				// Optionally handle error, maybe reject or return empty
				return;
			}

			const parameters: any = {};
			Object.keys(this.getNode().parameters).forEach((key) => {
				parameters[key] = this.getNodeParameter(key, '') as any;
			});

			console.log('registering ', this.getNode().id, '... ', parameters);

			// Emit using the correct server reference
			server.emit('triggerNodeRegistered', {
				parameters,
				active: this.getWorkflow().active,
				credentials,
				nodeId: this.getNode().id, // Unique to each node
			});

			// Listen using the correct server reference
			server.on(
				'messageCreate',
				({ message, author, guild, nodeId, messageReference, referenceAuthor }: any) => {
					if (this.getNode().id === nodeId) {
						const messageCreateOptions = {
							id: message.id,
							content: message.content,
							guildId: guild?.id,
							channelId: message.channelId,
							authorId: author.id,
							authorName: author.username,
							timestamp: message.createdTimestamp,
							listenValue: this.getNodeParameter('value', ''),
							authorIsBot: author.bot || author.system,
							referenceId: null,
							referenceContent: null,
							referenceAuthorId: null,
							referenceAuthorName: null,
							referenceTimestamp: null,
						};

						if (messageReference) {
							messageCreateOptions.referenceId = messageReference.id;
							messageCreateOptions.referenceContent = messageReference.content;
							messageCreateOptions.referenceAuthorId = referenceAuthor.id;
							messageCreateOptions.referenceAuthorName = referenceAuthor.username;
							messageCreateOptions.referenceTimestamp = messageReference.createdTimestamp;
						}

						this.emit([this.helpers.returnJsonArray(messageCreateOptions)]);
					}
				},
			);

			// Listen using the correct server reference
			server.on('guildMemberAdd', ({ guildMember, guild, user, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(guildMember)]);
				}
			});

			// Listen using the correct server reference
			server.on('guildMemberRemove', ({ guildMember, guild, user, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(guildMember)]);
				}
			});

			// Listen using the correct server reference
			server.on('roleCreate', ({ role, guild, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(role)]);
				}
			});

			// Listen using the correct server reference
			server.on('roleDelete', ({ role, guild, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(role)]);
				}
			});

			// Listen using the correct server reference
			server.on('roleUpdate', ({ oldRole, newRole, guild, nodeId }) => {
				if (this.getNode().id === nodeId) {
					const addPrefix = (obj: any, prefix: string) =>
						Object.fromEntries(
							Object.entries(obj).map(([key, value]) => [
								`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`,
								value,
							]),
						);

					const mergedRoleOptions: any = {
						...addPrefix(oldRole, 'old'),
						...addPrefix(newRole, 'new'),
					};

					this.emit([this.helpers.returnJsonArray(mergedRoleOptions)]);
				}
			});
		});

		// Listen for disconnect on the correct server ID
		ipc.of['discord-bot-server']?.on('disconnect', () => {
			// Added optional chaining for safety
			console.error('Disconnected from IPC server (discord-bot-server)');
		});

		// Return the cleanup function
		return {
			closeFunction: async () => {
				// Disconnect from the correct server ID
				ipc.disconnect('discord-bot-server');
				console.log(`IPC disconnected for node ${this.getNode().id}`);
				// Also inform the server to remove the node registration
				const server = ipc.of['discord-bot-server'];
				if (server) {
					server.emit('triggerNodeRemoved', { nodeId: this.getNode().id });
				}
			},
		};
	}
}
