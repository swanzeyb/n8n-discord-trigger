import { INodeProperties } from 'n8n-workflow';

export const options: INodeProperties[] = [
  {
    displayName: 'Listen To Names or IDs',
    name: 'channelIds',

    type: 'multiOptions',
    typeOptions: {
      loadOptionsMethod: 'getChannels',
    },
    default: [],
    description: 'Let you select the text channels you want to listen to for triggering the workflow. If none selected, all channels will be listen to. Your credentials must be set and the bot running, you also need at least one text channel available. If you do not meet these requirements, make the changes then close and reopen the modal (the channels list is loaded when the modal opens). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
  },
  {
    displayName: 'From Role Names or IDs',
    name: 'roleIds',

    type: 'multiOptions',
    displayOptions: {
      show: {
        type: [
          'message',
        ],
      },
    },
    typeOptions: {
      loadOptionsMethod: 'getRoles',
    },
    default: [],
    description: 'The same logic apply here for roles, except it is optional. If you don\'t select any role it will listen to @everyone. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
  },
  {
    displayName: 'Trigger Type',
    name: 'type',

    type: 'options',
    options: [
      {
        name: 'Message',
        value: 'message',
        description: 'When a message is sent in the selected channels',
      },
    ],
    default: 'message',
    description: 'Type of event to listen to. User events must specify a channel to listen to if you want to use a placeholder or the option "send to the trigger channel" in a Discord Send node.',
  },
  {
    displayName: 'Pattern',
    name: 'pattern',

    type: 'options',
    displayOptions: {
      show: {
        type: ['message'],
      },
    },
    options: [
      {
        name: 'Equals',
        value: 'equal',
        description: 'Match the exact same value',
      },
      {
        name: 'Starts With',
        value: 'start',
        description: 'Match the message beginning with the specified value',
      },
      {
        name: 'Every',
        value: 'every',
        description: 'Triggers on every discord message',
      },
      {
        name: 'Contains',
        value: 'contain',
        description: 'Match the value in any position in the message',
      },
      {
        name: 'Ends With',
        value: 'end',
        description: 'Match the message ending with the specified value',
      },
      {
        name: 'Regex',
        value: 'regex',
        description: 'Match the custom ECMAScript regex provided',
      },{
        name: 'Bot Mention',
        value: 'botMention',
        description: 'The bot has to be mentioned somewhere in the message in order to trigger',
      },
    ],
    default: 'start',
    description: 'Select how the value below will be recognized. ⚠ Keep in mind that the value will be tested with all mentions removed and a trim applied (whitespaces removed at the beginning and at the end). For example "@bot hello" will be tested on "hello"',
  },
  {
    displayName: 'Value',
    name: 'value',
    type: 'string',
    displayOptions: {
      show: {
        type: ['message'],
        pattern: ['equal', 'start', 'contain', 'end', 'regex'],
      },
    },
    required: true,
    default: '',
    description: 'The value you will test on all messages listened to',
  },
  {
    displayName: 'Case Sensitive',
    name: 'caseSensitive',
    type: 'boolean',
    displayOptions: {
      show: {
        type: ['message'],
      },
    },

    default: false,
    description: 'Determine if it will be sensible to the case when matching the value',
  },
  {
    displayName: 'Message ID',
    name: 'interactionMessageId',
    type: 'string',
    displayOptions: {
      show: {
        type: ['interaction'],
      },
    },
    required: true,
    default: '',
    description: 'The message ID of the button/select to listen to',
  },
  {
    displayName: 'Placeholder',
    name: 'placeholder',
    type: 'string',

    default: '',
    description: 'The placeholder is a message that will appear in the channel that triggers the workflow. Three animated dots added to the placeholder indicate that the workflow is running. From a Discord Send node, you can set up a response message which will then take the place of this placeholder.',
  },
];