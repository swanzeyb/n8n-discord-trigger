import type {
    INodeType,
    INodeExecutionData,
    INodeTypeDescription,
    INodePropertyOptions,
    IExecuteFunctions,
    INodeOutputConfiguration,
} from 'n8n-workflow';
import { options } from './DiscordConfirm.node.options';
import ipc from 'node-ipc';
import {
    getChannels as getChannelsHelper,
    getRoles as getRolesHelper,
    getGuilds as getGuildsHelper,
    connection,
    ICredentials,
} from '../helper';

export class DiscordConfirm implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Discord Confirmation',
        name: 'discordConfirm',
        group: ['discord'],
        version: 1,
        description: 'Let \'s the user decide whether to continue the interaction.',
        defaults: {
            name: 'Discord Confirmation',
        },
        icon: 'file:discord-logo.svg',
        inputs: ['main'],
        outputs: [
            { displayName: 'confirm', type: 'main' },
            { displayName: 'cancel', type: 'main' },
            { displayName: 'no response', type: 'main' },
        ] as INodeOutputConfiguration[],
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
                console.log("selectedGuilds", selectedGuilds);

                if (!selectedGuilds.length) {
                    throw new Error('Please select at least one server before choosing channels.');
                }

                return await getChannelsHelper(this, selectedGuilds).catch((e) => e);
            },
            async getRoles(): Promise<INodePropertyOptions[]> {
                // @ts-ignore
                const selectedGuilds = this.getNodeParameter('guildIds', []);
                console.log("selectedGuilds", selectedGuilds);

                if (!selectedGuilds.length) {
                    throw new Error('Please select at least one server before choosing channels.');
                }
                return await getRolesHelper(this, selectedGuilds).catch((e) => e);
            },
            async getGuilds(): Promise<INodePropertyOptions[]> {
                return await getGuildsHelper(this).catch((e) => e);
            },
        },
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {

        // @ts-ignore
        const executionId = this.getExecutionId();
        const returnData: INodeExecutionData[][] = [[], [], []];

        // fetch credentials
        const credentials = (await this.getCredentials('discordBotTriggerApi').catch((e) => e)) as any as ICredentials;

        // create connection to bot. 
        await connection(credentials).catch((e) => {
            console.log(e);
            returnData[2] = this.getInputData();
            return returnData;
        });

        // Prepare the node parameters to send to the bot

        const nodeParameters: Record<string, any> = {};
        Object.keys(this.getNode().parameters).forEach((key) => {
            nodeParameters[key] = this.getNodeParameter(key, 0, '');
        });

        const response: any = await new Promise((resolve) => {
            ipc.config.retry = 1500;
            console.log("connecting to bot");
            ipc.connectTo('bot', () => {
                const type = `send:confirmation`;
                ipc.of.bot.on(`callback:send:confirmation`, (data: any) => {
                    console.log("user decided", data);
                    resolve(data);
                });

                // send event to bot
                ipc.of.bot.emit(type, nodeParameters);
            });
        });

        console.log(response);
        
        if (response.confirmed === null)
            returnData[2] = this.getInputData();
        else if(response.confirmed === true)
            returnData[0] = this.getInputData();
        else 
            returnData[1] = this.getInputData();

        return returnData;
    }
}
