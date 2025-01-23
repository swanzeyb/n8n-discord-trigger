import { INodeProperties } from 'n8n-workflow';

export const options: INodeProperties[] = [
    {
        displayName: 'Type',
        name: 'type',
        required: false,
        type: 'options',
        options: [
            {
                name: 'Action',
                value: 'action',
                description:
                    'Instead of sending a message, it will perform an action defined in the next field.',
            },
            {
                name: 'Message',
                value: 'message',
                description:
                    'This is the default type, it allows you to send a message without requiering any form of response.',
            },
        ],
        default: 'message',
        description: 'Let you choose the type of interaction you want to perform.',
    },
   {
        displayName: 'Action',
        name: 'actionType',
        required: false,
        displayOptions: {
            show: {
                type: ['action'],
            },
        },
        type: 'options',
        options: [
            {
                name: 'Remove messages',
                value: 'removeMessages',
                description: 'Remove last messages from the "send to" channel.',
            },
            {
                name: 'Add role to user',
                value: 'addRole',
                description: 'Add a role to a user.',
            },
            {
                name: 'Remove role from user',
                value: 'removeRole',
                description: 'Remove a role from a user.',
            },
        ],
        default: 'removeMessages',
        description: 'Let you choose the type of action you want to perform.',
    },
    {
        displayName: 'Channel',
        name: 'channelId',
        required: false,
        type: 'options',
        displayOptions: {
            show: {
                type: ['message', 'action'],
            },
        },
        typeOptions: {
            loadOptionsMethod: 'getChannels',
        },
        default: '',
        description: `Let you specify the text channels where you want to send the message. Your credentials must be set and the bot running, you also need at least one text channel available. If you do not meet these requirements, make the changes then close and reopen the modal (the channels list is loaded when the modal opens).`,
    },
    {
        displayName: 'Server',
        name: 'guildId',
        required: false,
        type: 'options',
        displayOptions: {
            show: {
                type: ['action'],
            },
        },
        typeOptions: {
            loadOptionsMethod: 'getGuilds',
        },
        default: '',
        description: `Let you specify the guild where you want the action to happen.`,
    },
    {
        displayName: 'How many?',
        name: 'removeMessagesNumber',
        type: 'number',
        required: true,
        displayOptions: {
            show: {
                type: ['action'],
                actionType: ['removeMessages'],
            },
        },
        typeOptions: {
            maxValue: 100,
        },
        default: 1,
        description:
            'Number of last messages to remove (Discord API allow max 150 and messages < 4 weeks old).',
    },
    {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        required: true,
        displayOptions: {
            show: {
                type: ['action'],
                actionType: ['addRole', 'removeRole'],
            },
        },
        default: '',
        description: 'The ID of the user you want to add or remove the role from.',
    },
    {
        displayName: 'Which roles',
        name: 'roleUpdateIds',
        required: true,
        type: 'multiOptions',
        displayOptions: {
            show: {
                type: ['action'],
                actionType: ['addRole', 'removeRole'],
            },
        },
        typeOptions: {
            loadOptionsMethod: 'getRoles',
        },
        default: [],
        description: `Let you specify the roles you want to add or remove from the user.`,
    },
    {
        displayName: 'Content',
        name: 'content',
        type: 'string',
        displayOptions: {
            show: {
                type: ['message'],
            },
        },
        typeOptions: {
            rows: 4,
        },
        default: '',
        description: 'Displayed text message. Cannot be empty when using button/select prompt.',
    },
    {
        displayName: 'Embed',
        name: 'embed',
        type: 'boolean',
        displayOptions: {
            show: {
                type: ['message'],
            },
        },
        required: false,
        default: false,
        description:
            'If active it will enable the creation of rich messages. See documentation for more information.',
    },
    {
        displayName: 'Color',
        name: 'color',
        type: 'color',
        default: '', // Initially selected color
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
    },
    {
        displayName: 'Title',
        name: 'title',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: '',
    },
    {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: '',
    },
    {
        displayName: 'Author name',
        name: 'authorName',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: '',
    },
    {
        displayName: 'Author icon URL or base64',
        name: 'authorIconUrl',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
            hide: {
                authorName: [''],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Author URL',
        name: 'authorUrl',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
            hide: {
                authorName: [''],
            },
        },
        default: '',
        description: '',
    },
    {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: '',
    },
    {
        displayName: 'Thumbnail URL or base64',
        name: 'thumbnailUrl',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Fields',
        name: 'fields',
        placeholder: 'Add Field',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
        },
        displayOptions: {
            show: {
                embed: [true],
                type: ['message', 'action'],
            },
        },
        description: '',
        default: {},
        options: [
            {
                name: 'field',
                displayName: 'Field',
                values: [
                    {
                        displayName: 'Title',
                        name: 'name',
                        type: 'string',
                        default: '',
                        description: '',
                    },
                    {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',
                        description: '',
                    },
                    {
                        displayName: 'Inline',
                        name: 'inline',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: '',
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Image URL or base64',
        name: 'imageUrl',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Footer text',
        name: 'footerText',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
        default: '',
        description: '',
    },
    {
        displayName: 'Footer icon URL or base64',
        name: 'footerIconUrl',
        type: 'string',
        required: false,
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
            hide: {
                footerText: [''],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Displayed date',
        name: 'timestamp',
        type: 'dateTime',
        default: '',
        description: '',
        displayOptions: {
            show: {
                embed: [true],
                type: ['message'],
            },
        },
    },
    {
        displayName: 'Files',
        name: 'files',
        placeholder: 'Add File',
        type: 'fixedCollection',
        typeOptions: {
            multipleValues: true,
        },
        displayOptions: {
            show: {
                type: ['message'],
            },
        },
        description: 'Allows to attach up to 5 images to the message.',
        default: {},
        options: [
            {
                name: 'file',
                displayName: 'File',
                values: [
                    {
                        displayName: 'URL or base64',
                        name: 'url',
                        type: 'string',
                        default: '',
                        description: 'URL/base64 of the image to attach (png, jpg).',
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Mention roles',
        name: 'mentionRoles',
        required: false,
        type: 'multiOptions',
        typeOptions: {
            loadOptionsMethod: 'getRoles',
        },
        displayOptions: {
            show: {
                type: ['message'],
            },
        },
        default: [],
        description: `Let you specify roles you want to mention in the message. Your credentials must be set and the bot running, you also need at least one role (apart from @everyone) available. If you do not meet these requirements, make the changes then close and reopen the modal.`,
    },
];
