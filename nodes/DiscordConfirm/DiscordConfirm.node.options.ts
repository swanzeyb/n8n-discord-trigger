import { INodeProperties } from 'n8n-workflow';

export const options: INodeProperties[] = [
    {
        displayName: 'Server Name or ID',
        name: 'guildIds',

        type: 'options',
        typeOptions: {
            loadOptionsMethod: 'getGuilds',
        },
        default: '',
        description: 'Let you specify the guild where you want the action to happen. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    }, 
    {
        displayName: 'Channel Name or ID',
        name: 'channelId',

        type: 'options',
        typeOptions: {
            loadOptionsDependsOn: ['guildIds'],
            loadOptionsMethod: 'getChannels',
        },
        default: '',
        description: 'Let you specify the text channels where you want to send the message. Your credentials must be set and the bot running, you also need at least one text channel available. If you do not meet these requirements, make the changes then close and reopen the modal (the channels list is loaded when the modal opens). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    },
    {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        default: '',
        description: 'The ID of the user you want to add or remove the role from',
    },
    {
        displayName: 'Content',
        name: 'content',
        type: 'string',
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

        default: false,
        description: 'Whether you want to create an embed message rather than a regular content message',
    },
    {
        displayName: 'Color',
        name: 'color',
        type: 'color',
        default: '', // Initially selected color
        displayOptions: {
            show: {
                embed: [true],
            },
        },
    },
    {
        displayName: 'Title',
        name: 'title',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
        },
        default: '',

    },
    {
        displayName: 'URL',
        name: 'url',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
        },
        default: '',

    },
    {
        displayName: 'Author Name',
        name: 'authorName',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
        },
        default: '',

    },
    {
        displayName: 'Author Icon URL or Base64',
        name: 'authorIconUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
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

        displayOptions: {
            show: {
                embed: [true],
            },
            hide: {
                authorName: [''],
            },
        },
        default: '',

    },
    {
        displayName: 'Description',
        name: 'description',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
        },
        default: '',

    },
    {
        displayName: 'Thumbnail URL or Base64',
        name: 'thumbnailUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
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
            },
        },

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

                    },
                    {
                        displayName: 'Value',
                        name: 'value',
                        type: 'string',
                        default: '',

                    },
                    {
                        displayName: 'Inline',
                        name: 'inline',
                        type: 'boolean',

                        default: false,
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Image URL or Base64',
        name: 'imageUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Footer Text',
        name: 'footerText',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
        },
        default: '',

    },
    {
        displayName: 'Footer Icon URL or Base64',
        name: 'footerIconUrl',
        type: 'string',

        displayOptions: {
            show: {
                embed: [true],
            },
            hide: {
                footerText: [''],
            },
        },
        default: '',
        description: 'URL/base64 of the image (png, jpg)',
    },
    {
        displayName: 'Displayed Date',
        name: 'timestamp',
        type: 'dateTime',
        default: '',

        displayOptions: {
            show: {
                embed: [true],
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
        description: 'Allows to attach up to 5 images to the message',
        default: {},
        options: [
            {
                name: 'file',
                displayName: 'File',
                values: [
                    {
                        displayName: 'URL or Base64',
                        name: 'url',
                        type: 'string',
                        default: '',
                        description: 'URL/base64 of the image to attach (png, jpg)',
                    },
                ],
            },
        ],
    },
    {
        displayName: 'Mention Role Names or IDs',
        name: 'mentionRoles',

        type: 'multiOptions',
        typeOptions: {
            loadOptionsMethod: 'getRoles',
        },
        default: [],
        description: 'Let you specify roles you want to mention in the message. Your credentials must be set and the bot running, you also need at least one role (apart from @everyone) available. If you do not meet these requirements, make the changes then close and reopen the modal. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    },
];
