import type {
    INodeType,
    INodeTypeDescription,
    ITriggerFunctions,
    ITriggerResponse,
    INodePropertyOptions,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { options } from './DiscordTrigger.node.options';
import bot from './bot';
import ipc from 'node-ipc';
import {
    connection,
    ICredentials,
    checkWorkflowStatus,
    getChannels as getChannelsHelper,
    getRoles as getRolesHelper,
} from './helper';

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
        inputs: [],
        outputs: ['main'],
        credentials: [
            {
                name: 'discordBotApi',
                required: true,
            },
        ],
        properties: options,
    };

    methods = {
        loadOptions: {
            async getChannels(): Promise<INodePropertyOptions[]> {
                return await getChannelsHelper(this).catch((e) => e);
            },
            async getRoles(): Promise<INodePropertyOptions[]> {
                return await getRolesHelper(this).catch((e) => e);
            },
        },
    };

    async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {

        const credentials = (await this.getCredentials('discordBotApi').catch((e) => e)) as any as ICredentials;

        if (!credentials?.token) {
            console.log("No token given.");
            
            return {};
        }

        await connection(credentials).catch((e) => e);

        ipc.connectTo('bot', () => {
            console.log('Connected to IPC server');

            const parameters: any = {};
            Object.keys(this.getNode().parameters).forEach((key) => {
                parameters[key] = this.getNodeParameter(key, '') as any;
            });

            ipc.of.bot.emit('trigger', {
                parameters,
                active: this.getWorkflow().active,
                credentials
            });

            ipc.of.bot.on('messageCreate', ({ message, author }: any) => {
                this.emit([
                    this.helpers.returnJsonArray({
                        id: message.id,
                        content: message.content,
                        channelId: message.channelId,
                        authorId: author.id,
                        authorName: author.username,
                        timestamp: message.createdTimestamp,
                    }),
                ]);
            });
        });

        ipc.of.bot.on('disconnect', () => {
            console.error('Disconnected from IPC server');
        });

        // Return the cleanup function
        return {
            closeFunction: async () => {
                const credentials = (await this.getCredentials('discordBotApi').catch((e) => e)) as any as ICredentials;
                const isActive = await checkWorkflowStatus(credentials.baseUrl, credentials.apiKey, String(this.getWorkflow().id));

                // disable the node if the workflow is not activated, but keep it running if it was just the test node
                if (!isActive || this.getActivationMode() !== 'manual') {
                    console.log('Workflow stopped. Disconnecting bot...');
                    ipc.disconnect('bot');
                }
            },
        };
    }
}
