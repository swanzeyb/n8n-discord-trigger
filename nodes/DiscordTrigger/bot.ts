
import { Client, GatewayIntentBits, Role, GuildBasedChannel, ChannelType } from 'discord.js';
import ipc from 'node-ipc';
import {
    ICredentials,
} from './helper';
import settings from './settings';

export default function () {
    const client = new Client({
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

    client.once('ready', () => {
        console.log(`Logged in as ${client.user?.tag}`);
    });



    ipc.config.id = 'bot';
    ipc.config.retry = 1500;
    ipc.config.silent = true;

    // nodes are executed in a child process, the Discord bot is executed in the main process
    // so it's not stopped when a node execution end
    // we use ipc to communicate between the node execution process and the bot
    // ipc is serving in the main process & childs connect to it using the ipc client
    ipc.serve(function () {
        console.log(`ipc bot server started`);

        ipc.server.on('trigger', (data: any, socket: any) => {
            settings.parameters = data.parameters;

            // Add event listener for new messages
            const handleMessageCreate = (message: any) => {
                try {
                    // ignore messages of other bots
                    if (message.author.bot || message.author.system) return;

                    const pattern = settings.parameters.pattern;

                    // check if executed by the proper role
                    const userRoles = message.member?.roles.cache.map((role: any) => role.id);
                    if (settings.parameters.roleIds.length) {
                        const hasRole = settings.parameters.roleIds.some((role: any) => userRoles?.includes(role));
                        if (!hasRole) return;
                    }
                    
                    // check if executed by the proper channel
                    if (settings.parameters.channelIds.length) {
                        const isInChannel = settings.parameters.channelIds.some((channelId: any) => message.channel.id?.includes(channelId));
                        if (!isInChannel) return;
                    }

                    // escape the special chars to properly trigger the message
                    const escapedTriggerValue = String(settings.parameters.value)
                        .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
                        .replace(/-/g, '\\x2d');

                    const clientId = client.user?.id;
                    const botMention = message.mentions.users.some((user: any) => user.id === clientId);

                    let regStr = `^${escapedTriggerValue}$`;

                    // return if we expect a bot mention, but bot is not mentioned
                    if (pattern === "botMention" && !botMention)
                        return;

                    else if (pattern === "start" && message.content)
                        regStr = `^${escapedTriggerValue}`;
                    else if (pattern === 'end')
                        regStr = `${escapedTriggerValue}$`;
                    else if (pattern === 'contain')
                        regStr = `${escapedTriggerValue}`;
                    else if (pattern === 'regex')
                        regStr = `${settings.parameters.value}`;
                    else if (pattern === 'every')
                        regStr = `(.*)`;

                    const reg = new RegExp(regStr, settings.parameters.caseSensitive ? '' : 'i');

                    if ((pattern === "botMention" && botMention) || reg.test(message.content)) {
                        // Emit the message data to n8n
                        ipc.server.emit(socket, 'messageCreate', { message, author: message.author });
                    }

                } catch (e) {
                    console.log(e);
                }
            };

            // Clear existing listeners for `messageCreate`
            client.removeAllListeners('messageCreate');
            // Add new listener for `messageCreate`
            client.on('messageCreate', handleMessageCreate);

        });




        ipc.server.on('list:roles', (data: undefined, socket: any) => {
            try {
                if (settings.ready) {
                    const guild = client.guilds.cache.first();
                    const roles = guild?.roles.cache ?? ([] as any);

                    const rolesList = roles.map((role: Role) => {
                        return {
                            name: role.name,
                            value: role.id,
                        };
                    });

                    ipc.server.emit(socket, 'list:roles', rolesList);
                }
            } catch (e) {
                console.log(`${e}`);
            }
        });



        ipc.server.on('list:channels', (data: undefined, socket: any) => {
            try {
                if (settings.ready) {
                    const guild = client.guilds.cache.first();
                    const channels =
                        guild?.channels.cache.filter((c) => c.type === ChannelType.GuildText) ?? ([] as any);

                    const channelsList = channels.map((channel: GuildBasedChannel) => {
                        return {
                            name: channel?.name,
                            value: channel.id,
                        };
                    });

                    ipc.server.emit(socket, 'list:channels', channelsList);
                }
            } catch (e) {
                console.log(`${e}`);
            }
        });




        ipc.server.on('credentials', (data: ICredentials, socket: any) => {
            try {
                if (
                    (!settings.login && !settings.ready) ||
                    (settings.ready && (settings.clientId !== data.clientId || settings.token !== data.token))
                ) {
                    if (data.token && data.clientId) {
                        settings.login = true;
                        client.destroy();
                        client
                            .login(data.token)
                            .then(() => {
                                settings.ready = true;
                                settings.login = false;
                                settings.clientId = data.clientId;
                                settings.token = data.token;
                                ipc.server.emit(socket, 'credentials', 'ready');
                            })
                            .catch((e) => {
                                settings.login = false;
                                ipc.server.emit(socket, 'credentials', 'error');
                            });
                    } else {
                        ipc.server.emit(socket, 'credentials', 'missing');
                        console.log(`credentials missing`, client);
                    }
                } else if (settings.login) {
                    ipc.server.emit(socket, 'credentials', 'login');
                    console.log(`credentials login`, client);
                } else {
                    ipc.server.emit(socket, 'credentials', 'already');
                }
            } catch (e) {
                console.log(`${e}`);
            }
        });
    });

    ipc.server.start();
}