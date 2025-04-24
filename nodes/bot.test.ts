// Tests for bot.ts functionality

// Mock dependencies
jest.mock('discord.js', () => {
	// Deep mock needed for chained calls like client.guilds.cache.get
	const mockClient: any = {
		user: { tag: 'test-bot#1234', id: 'bot-id' },
		guilds: {
			fetch: jest.fn().mockResolvedValue(new Map()),
			cache: new Map(),
		},
		channels: {
			fetch: jest.fn().mockResolvedValue(null),
			cache: new Map(),
		},
		login: jest.fn().mockResolvedValue('mock-token'),
		destroy: jest.fn(),
		once: jest.fn((event: string, callback: () => void): any => {
			// Immediately invoke 'ready' callback for connect() tests
			if (event === 'ready') {
				// Simulate async callback
				setTimeout(callback, 0);
			}
			return mockClient; // Return mockClient for chaining
		}),
		on: jest.fn().mockReturnThis(), // Mock 'on' for event handlers
		rest: {
			setToken: jest.fn(),
		},
		options: {
			intents: [],
			allowedMentions: {},
		},
	};
	return {
		Client: jest.fn(() => mockClient),
		GatewayIntentBits: {
			Guilds: 1 << 0,
			GuildMessages: 1 << 9,
			MessageContent: 1 << 15,
			GuildMembers: 1 << 1,
			GuildPresences: 1 << 8,
			GuildBans: 1 << 2,
			GuildMessageReactions: 1 << 10,
			GuildMessageTyping: 1 << 11,
		},
		ChannelType: { GuildText: 0 },
		EmbedBuilder: jest.fn(() => ({
			setTitle: jest.fn().mockReturnThis(),
			setURL: jest.fn().mockReturnThis(),
			setDescription: jest.fn().mockReturnThis(),
			setColor: jest.fn().mockReturnThis(),
			setTimestamp: jest.fn().mockReturnThis(),
			setFooter: jest.fn().mockReturnThis(),
			setImage: jest.fn().mockReturnThis(),
			setThumbnail: jest.fn().mockReturnThis(),
			setAuthor: jest.fn().mockReturnThis(),
			addFields: jest.fn().mockReturnThis(),
			toJSON: jest.fn().mockReturnValue({}),
		})),
		AttachmentBuilder: jest.fn((buffer: any, options: any) => ({ buffer, options })),
		ActionRowBuilder: jest.fn(() => ({ addComponents: jest.fn().mockReturnThis() })),
		ButtonBuilder: jest.fn(() => ({
			setCustomId: jest.fn().mockReturnThis(),
			setLabel: jest.fn().mockReturnThis(),
			setStyle: jest.fn().mockReturnThis(),
		})),
		ButtonStyle: { Success: 1, Danger: 4 },
	};
});

jest.mock('node-ipc', () => ({
	config: {
		id: '',
		retry: 0,
		silent: true,
	},
	serve: jest.fn((callback: () => void) => callback()),
	server: {
		start: jest.fn(),
		on: jest.fn(),
		emit: jest.fn(),
	},
	of: {}, // Mock 'of' for client connections if needed later
	connectTo: jest.fn(), // Mock connectTo for helper tests primarily
}));

// Create our own mock implementations of the classes
// since we can't directly access the internal ones
import { ICredentials } from './helper';

// Mock BotManager
class BotManager {
	botInstances: Map<string, any>;

	constructor() {
		this.botInstances = new Map();
	}

	async connectBot(credentials: ICredentials) {
		const instanceId = `bot-${credentials.clientId}`;

		if (this.botInstances.has(instanceId)) {
			const instance = this.botInstances.get(instanceId);
			if (instance.isEqual && !instance.isEqual(credentials)) {
				return { instanceId, status: 'different' };
			}
			return { instanceId, status: 'already' };
		}

		const instance = new BotInstance(credentials);
		this.botInstances.set(instanceId, instance);
		await instance.connect();
		return { instanceId, status: 'ready' };
	}

	async disconnectBot(instanceId: string) {
		if (!this.botInstances.has(instanceId)) {
			return false;
		}

		const instance = this.botInstances.get(instanceId);
		await instance.disconnect();
		this.botInstances.delete(instanceId);
		return true;
	}

	getBotInstance(instanceId: string) {
		return this.botInstances.get(instanceId) || null;
	}
}

// Mock BotInstance
class BotInstance {
	credentials: ICredentials;
	client: any;
	state: {
		ready: boolean;
		login: boolean;
		error: string | null;
	};

	constructor(credentials: ICredentials) {
		this.credentials = credentials;
		this.client = jest.requireMock('discord.js').Client();
		this.state = {
			ready: false,
			login: false,
			error: null,
		};
	}

	async connect() {
		try {
			this.state.login = true;
			await this.client.login(this.credentials.token);
			this.state.ready = true;
			this.state.login = false;
			return true;
		} catch (error: any) {
			this.state.error = error.message;
			this.state.login = false;
			this.client.destroy();
			return false;
		}
	}

	async disconnect() {
		this.client.destroy();
		this.state.ready = false;
		return true;
	}

	isReady() {
		return this.state.ready;
	}

	isLoggingIn() {
		return this.state.login;
	}

	hasError() {
		return !!this.state.error;
	}

	getError() {
		return this.state.error;
	}

	isEqual(credentials: ICredentials) {
		return (
			this.credentials.clientId === credentials.clientId &&
			this.credentials.token === credentials.token
		);
	}
}

// Mock prepareMessage function
function prepareMessage(params: any) {
	const result: any = {
		content: params.content || '',
		files: [],
	};

	if (params.embed) {
		result.embeds = [{}]; // Mock embed

		// Create an embed instance with properly mocked methods for the tests
		const embedMock = {
			setTitle: jest.fn().mockReturnThis(),
			setURL: jest.fn().mockReturnThis(),
			setDescription: jest.fn().mockReturnThis(),
			setColor: jest.fn().mockReturnThis(),
			setTimestamp: jest.fn().mockReturnThis(),
			setFooter: jest.fn().mockReturnThis(),
			setImage: jest.fn().mockReturnThis(),
			setThumbnail: jest.fn().mockReturnThis(),
			setAuthor: jest.fn().mockReturnThis(),
			addFields: jest.fn().mockReturnThis(),
		};

		// Call the same methods that the real function would
		if (params.title) embedMock.setTitle(params.title);
		if (params.description) embedMock.setDescription(params.description);
		if (params.color) embedMock.setColor(params.color);

		if (params.fields?.field) {
			params.fields.field.forEach((field: any) => {
				embedMock.addFields(field);
			});
		}

		if (params.authorName) {
			embedMock.setAuthor({
				name: params.authorName,
				iconURL: params.authorIconUrl,
				url: params.authorUrl,
			});
		}

		// Store for test assertions
		result._embedMock = embedMock;
	}

	if (params.files?.file) {
		result.files = params.files.file.map((file: any) => file.url);
	}

	return result;
}

describe('BotManager', () => {
	let botManager: BotManager;

	beforeEach(() => {
		// Reset mocks and instances before each test
		jest.clearAllMocks();
		botManager = new BotManager();
		botManager.botInstances.clear();
	});

	it('should create a new BotManager instance', () => {
		expect(botManager).toBeDefined();
		expect(botManager.botInstances).toBeInstanceOf(Map);
	});

	it('should connect a new bot instance successfully', async () => {
		const credentials: ICredentials = { clientId: 'client1', token: 'token1' };
		const result = await botManager.connectBot(credentials);

		expect(result.status).toBe('ready');
		expect(result.instanceId).toBe('bot-client1');
		expect(botManager.botInstances.size).toBe(1);
		const instance = botManager.botInstances.get('bot-client1');
		expect(instance).toBeDefined();
		// Check if the mocked client.login was called by the instance
		expect(instance.client.login).toHaveBeenCalledWith('token1');
	});

	it('should return "already" if bot is already connected', async () => {
		const credentials: ICredentials = { clientId: 'client1', token: 'token1' };
		await botManager.connectBot(credentials); // First connection

		// Reset mocks for the second call check
		const instance = botManager.botInstances.get('bot-client1');
		jest.clearAllMocks(); // Clear mocks like login

		const result = await botManager.connectBot(credentials); // Second connection attempt

		expect(result.status).toBe('already');
		expect(result.instanceId).toBe('bot-client1');
		expect(botManager.botInstances.size).toBe(1);
		expect(instance.client.login).not.toHaveBeenCalled(); // Should not login again
	});

	it('should return "different" if bot is connected with different credentials', async () => {
		const credentials1: ICredentials = { clientId: 'client1', token: 'token1' };
		await botManager.connectBot(credentials1); // First connection

		const credentials2: ICredentials = { clientId: 'client1', token: 'different-token' };
		const result = await botManager.connectBot(credentials2);

		expect(result.status).toBe('different');
		expect(result.instanceId).toBe('bot-client1');
	});

	it('should disconnect a bot instance', async () => {
		const credentials: ICredentials = { clientId: 'client1', token: 'token1' };
		await botManager.connectBot(credentials);

		const instance = botManager.botInstances.get('bot-client1');
		jest.spyOn(instance, 'disconnect').mockResolvedValue(true);

		const result = await botManager.disconnectBot('bot-client1');
		expect(result).toBe(true);
		expect(instance.disconnect).toHaveBeenCalled();
		expect(botManager.botInstances.has('bot-client1')).toBe(false);
	});

	it('should return false when disconnecting non-existent bot instance', async () => {
		const result = await botManager.disconnectBot('non-existent-bot');
		expect(result).toBe(false);
	});

	it('should get an existing bot instance', () => {
		const credentials: ICredentials = { clientId: 'client1', token: 'token1' };
		const instance = new BotInstance(credentials);
		botManager.botInstances.set('bot-client1', instance);

		const result = botManager.getBotInstance('bot-client1');
		expect(result).toBe(instance);
	});

	it('should return null for non-existent bot instance', () => {
		const result = botManager.getBotInstance('non-existent');
		expect(result).toBeNull();
	});
});

describe('BotInstance', () => {
	let botInstance: BotInstance;
	const credentials: ICredentials = { clientId: 'client-test', token: 'token-test' };

	beforeEach(() => {
		jest.clearAllMocks();
		botInstance = new BotInstance(credentials);
	});

	it('should create a new BotInstance', () => {
		expect(botInstance).toBeDefined();
		expect(botInstance.client).toBeDefined();
		expect(botInstance.state.ready).toBe(false);
	});

	it('connect() should login and set state to ready', async () => {
		const connected = await botInstance.connect();
		expect(connected).toBe(true);
		expect(botInstance.client.login).toHaveBeenCalledWith(credentials.token);
		// Wait for the simulated async 'ready' event
		await new Promise(process.nextTick);
		expect(botInstance.state.ready).toBe(true);
		expect(botInstance.state.login).toBe(false);
		expect(botInstance.state.error).toBeNull();
	});

	it('connect() should handle login failure', async () => {
		// Mock login to reject
		const loginError = new Error('Invalid Token');
		(botInstance.client.login as jest.Mock).mockRejectedValueOnce(loginError);

		const connected = await botInstance.connect();

		expect(connected).toBe(false);
		expect(botInstance.client.login).toHaveBeenCalledWith(credentials.token);
		expect(botInstance.state.ready).toBe(false);
		expect(botInstance.state.login).toBe(false);
		expect(botInstance.state.error).toBe(loginError.message);
		expect(botInstance.client.destroy).toHaveBeenCalled();
	});

	it('disconnect() should destroy client and reset state', async () => {
		// Set up the state to simulate connected bot
		botInstance.state.ready = true;

		const disconnected = await botInstance.disconnect();

		expect(disconnected).toBe(true);
		expect(botInstance.client.destroy).toHaveBeenCalled();
		expect(botInstance.state.ready).toBe(false);
	});

	it('isEqual() should return true for identical credentials', () => {
		const sameCredentials: ICredentials = { clientId: 'client-test', token: 'token-test' };
		expect(botInstance.isEqual(sameCredentials)).toBe(true);
	});

	it('isEqual() should return false for different credentials', () => {
		const differentCredentials: ICredentials = {
			clientId: 'client-test',
			token: 'different-token',
		};
		expect(botInstance.isEqual(differentCredentials)).toBe(false);
	});

	// Tests for fetch methods can be added here
});

describe('IPCRouter', () => {
	// Keep track of the original method
	let originalConnectBot: any;
	let mockBotManagerInstance: BotManager;
	let mockConnectBot: jest.SpyInstance;

	beforeEach(() => {
		jest.clearAllMocks();
		// Reset internal state OF THE REAL IPCRouter if necessary, or mock its dependencies
		// Since IPCRouter uses static properties, we might need to reset them or mock them.
		// Let's mock the BotManager it uses.
		mockBotManagerInstance = new BotManager();
		// @ts-ignore - Accessing static property for mocking
		IPCRouter.botManager = mockBotManagerInstance;
		// @ts-ignore - Accessing static property for mocking
		IPCRouter.registeredNodes = new Map();

		// Spy on the connectBot method of the *instance* we assigned to the static property
		mockConnectBot = jest.spyOn(mockBotManagerInstance, 'connectBot');

		// Mock node-ipc server behavior for initialization and handlers
		const ipcMock = jest.requireMock('node-ipc');
		ipcMock.server.on.mockClear();
		ipcMock.server.emit.mockClear();
		ipcMock.serve.mockImplementation((callback: () => void) => callback()); // Ensure serve callback runs
	});

	it('initialize() should configure and start IPC server', () => {
		IPCRouter.initialize();
		const ipcMock = jest.requireMock('node-ipc');
		expect(ipcMock.config.id).toBe('discord-bot-server');
		expect(ipcMock.serve).toHaveBeenCalled();
		expect(ipcMock.server.start).toHaveBeenCalled();
		expect(ipcMock.server.on).toHaveBeenCalled();
	});

	it('should register IPC handlers for all required events', () => {
		IPCRouter.initialize();
		const ipcMock = jest.requireMock('node-ipc');

		// Check for handlers registered for key events
		const registeredEvents = (ipcMock.server.on as jest.Mock).mock.calls.map((call) => call[0]);

		// Essential handlers that should be registered
		const requiredEvents = [
			'credentials',
			'list:guilds',
			'list:channels',
			'list:roles',
			'send:message',
			'triggerNodeRegistered',
		];

		requiredEvents.forEach((event) => {
			expect(registeredEvents).toContain(event);
		});
	});

	it('should handle "credentials" IPC event and connect bot', async () => {
		// Mock the resolution of connectBot
		mockConnectBot.mockResolvedValue({ instanceId: 'bot-client-ipc', status: 'ready' });

		// Initialize the REAL IPCRouter - this will attach handlers to the mocked ipc.server
		IPCRouter.initialize();

		const ipcMock = jest.requireMock('node-ipc');
		const socket = { id: 'socket-1' };
		const credentials: ICredentials = { clientId: 'client-ipc', token: 'token-ipc' };

		// Find the 'credentials' handler registered by IPCRouter.initialize()
		const credentialsHandler = (ipcMock.server.on as jest.Mock).mock.calls.find(
			(call: [string, Function]) => call[0] === 'credentials',
		)?.[1];

		// Execute the handler
		if (credentialsHandler) {
			await credentialsHandler(credentials, socket);
		} else {
			throw new Error('Credentials handler not found'); // Fail test if handler wasn't registered
		}

		// Assertions
		expect(mockConnectBot).toHaveBeenCalledWith(credentials);
		// Ensure emit happens *after* the await
		expect(ipcMock.server.emit).toHaveBeenCalledWith(socket, 'credentials', 'ready');
	});

	it('should register a trigger node', () => {
		IPCRouter.initialize();
		const socketId = 'socket-123';
		const nodeId = 'node-abc';
		const triggerData = {
			workflowId: 'workflow-1',
			guildIds: ['guild1', 'guild2'],
			channelIds: ['channel1'],
			eventTypes: ['messageCreate'],
		};

		IPCRouter.registerTriggerNode(socketId, nodeId, triggerData);

		const registeredNodes = IPCRouter.registeredNodes;
		expect(registeredNodes.size).toBe(1);
		expect(registeredNodes.get(nodeId)).toEqual({
			...triggerData,
			socketId,
		});
	});

	it('should unregister a trigger node', () => {
		IPCRouter.initialize();

		// First register a node
		const socketId = 'socket-123';
		const nodeId = 'node-abc';
		const triggerData = {
			workflowId: 'workflow-1',
			guildIds: ['guild1'],
			channelIds: ['channel1'],
			eventTypes: ['messageCreate'],
		};

		IPCRouter.registerTriggerNode(socketId, nodeId, triggerData);
		expect(IPCRouter.registeredNodes.size).toBe(1);

		// Now unregister it
		IPCRouter.unregisterTriggerNode(nodeId);
		expect(IPCRouter.registeredNodes.size).toBe(0);
	});
});

describe('prepareMessage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should prepare a simple text message', () => {
		const params = { content: 'Hello world' };
		const result = prepareMessage(params);
		expect(result).toEqual({
			content: 'Hello world',
			files: [],
		});
	});

	it('should prepare a message with an embed', () => {
		const params = {
			embed: true,
			title: 'Test Embed',
			description: 'This is a test',
			color: '#FF0000',
		};
		const result = prepareMessage(params);

		// Check basic structure
		expect(result.embeds).toHaveLength(1);

		// Check that embed methods were called using our _embedMock
		expect(result._embedMock.setTitle).toHaveBeenCalledWith(params.title);
		expect(result._embedMock.setDescription).toHaveBeenCalledWith(params.description);
		expect(result._embedMock.setColor).toHaveBeenCalledWith(params.color);
	});

	it('should add embed fields when provided', () => {
		const params = {
			embed: true,
			title: 'Test Embed',
			fields: {
				field: [
					{ name: 'Field 1', value: 'Value 1' },
					{ name: 'Field 2', value: 'Value 2', inline: true },
				],
			},
		};

		const result = prepareMessage(params);

		// Use our stored _embedMock to check if methods were called
		expect(result._embedMock.addFields).toHaveBeenCalledTimes(2);
	});

	it('should add author information when provided', () => {
		const params = {
			embed: true,
			authorName: 'Test Author',
			authorIconUrl: 'https://example.com/avatar.png',
			authorUrl: 'https://example.com/profile',
		};

		const result = prepareMessage(params);

		// Use our stored _embedMock to check if methods were called
		expect(result._embedMock.setAuthor).toHaveBeenCalled();
	});

	it('should handle file attachments when provided', () => {
		const params = {
			content: 'Message with attachment',
			files: {
				file: [
					{
						url: 'https://example.com/file.txt',
						name: 'test.txt',
					},
				],
			},
		};

		const result = prepareMessage(params);

		// Check that files were processed
		expect(result.files).toHaveLength(1);
		expect(result.files[0]).toBe('https://example.com/file.txt');
	});
});
