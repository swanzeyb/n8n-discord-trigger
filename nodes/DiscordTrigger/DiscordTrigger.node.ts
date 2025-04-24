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

		ipc.connectTo('bot', () => {
			console.log('Connected to IPC server');

			const parameters: any = {};
			Object.keys(this.getNode().parameters).forEach((key) => {
				parameters[key] = this.getNodeParameter(key, '') as any;
			});

			console.log('registering ', this.getNode().id, '... ', parameters);

			ipc.of.bot.emit('triggerNodeRegistered', {
				parameters,
				active: this.getWorkflow().active,
				credentials,
				nodeId: this.getNode().id, // Unique to each node
			});

			ipc.of.bot.on(
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

			ipc.of.bot.on('guildMemberAdd', ({ guildMember, guild, user, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(guildMember)]);
				}
			});

			ipc.of.bot.on('guildMemberRemove', ({ guildMember, guild, user, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(guildMember)]);
				}
			});

			ipc.of.bot.on('roleCreate', ({ role, guild, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(role)]);
				}
			});

			ipc.of.bot.on('roleDelete', ({ role, guild, nodeId }) => {
				if (this.getNode().id === nodeId) {
					this.emit([this.helpers.returnJsonArray(role)]);
				}
			});

			ipc.of.bot.on('roleUpdate', ({ oldRole, newRole, guild, nodeId }) => {
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

		ipc.of.bot.on('disconnect', () => {
			console.error('Disconnected from IPC server');
		});

		// Return the cleanup function
		return {
			closeFunction: async () => {
				// Only disconnect the bot
				ipc.disconnect('bot');
			},
		};
	}
}
