// Tests for helper.ts functionality
import { ICredentials, connection, getChannels, getGuilds, getRoles, ipcRequest } from './helper';

jest.mock('node-ipc', () => {
	// Create a local mockIpcServer inside the factory function
	const mockIpcServer = {
		on: jest.fn(),
		emit: jest.fn(),
		once: jest.fn(),
	};

	// Create mockIpcOf using the local mockIpcServer
	const mockIpcOf = {
		'discord-bot-server': mockIpcServer,
	};

	return {
		config: {
			retry: 0,
		},
		connectTo: jest.fn((id: string, callback: () => void) => {
			// Simulate connection and call the callback
			if (id === 'discord-bot-server' && callback) {
				callback();
			}
		}),
		of: mockIpcOf,
	};
});

// Get the mocked version of node-ipc for tests
const mockIpc = jest.requireMock('node-ipc');
const mockIpcServer = mockIpc.of['discord-bot-server'];

// Mock 'that' context object used in getChannels, getGuilds, getRoles
const mockThat = {
	getCredentials: jest.fn(),
};

describe('connection', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIpcServer.on.mockClear();
		mockIpcServer.emit.mockClear();
	});

	it('should resolve with "ready" on successful connection', async () => {
		// Mock the 'credentials' event listener within the connection function's scope
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('ready'); // Simulate server sending 'ready'
			}
		});

		const credentials: ICredentials = { clientId: 'test', token: 'test' };
		await expect(connection(credentials)).resolves.toBe('ready');
		expect(jest.requireMock('node-ipc').connectTo).toHaveBeenCalledWith(
			'discord-bot-server',
			expect.any(Function),
		);
		expect(mockIpcServer.emit).toHaveBeenCalledWith('credentials', credentials);
	});

	it('should resolve with "already" when bot is already connected', async () => {
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('already'); // Simulate server sending 'already'
			}
		});

		const credentials: ICredentials = { clientId: 'test', token: 'test' };
		await expect(connection(credentials)).resolves.toBe('already');
	});

	it('should reject if credentials are missing', async () => {
		await expect(connection(null as unknown as ICredentials)).rejects.toBe('credentials missing');
		await expect(connection({} as ICredentials)).rejects.toBe('credentials missing');
		await expect(connection({ clientId: 'test' } as ICredentials)).rejects.toBe(
			'credentials missing',
		);
		await expect(connection({ token: 'test' } as ICredentials)).rejects.toBe('credentials missing');
	});

	it('should reject on timeout', async () => {
		jest.useFakeTimers();
		// Mock the server listener to *not* call back
		mockIpcServer.on.mockImplementation(() => {});

		const promise = connection({ clientId: 'test', token: 'test' });
		jest.advanceTimersByTime(15001); // Advance past 15s timeout
		await expect(promise).rejects.toBe('timeout');
		jest.useRealTimers();
	});

	it('should reject on "error" response from server', async () => {
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('error'); // Simulate server sending 'error'
			}
		});
		await expect(connection({ clientId: 'test', token: 'test' })).rejects.toBe(
			'Invalid credentials or connection error',
		);
	});

	it('should reject on "missing" response from server', async () => {
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('missing'); // Simulate server sending 'missing'
			}
		});
		await expect(connection({ clientId: 'test', token: 'test' })).rejects.toBe(
			'Token or clientId missing',
		);
	});

	it('should handle IPC connection error', async () => {
		mockIpcServer.on.mockImplementation((event: string, callback: (error?: Error) => void) => {
			if (event === 'error') {
				callback(new Error('IPC error')); // Simulate error event
			}
		});

		const promise = connection({ clientId: 'test', token: 'test' });
		// Manually trigger the error event
		const errorHandler = mockIpcServer.on.mock.calls.find(
			(call: [string, Function]) => call[0] === 'error',
		)?.[1];
		if (errorHandler) {
			errorHandler(new Error('IPC error'));
		}

		await expect(promise).rejects.toBe('IPC connection error');
	});

	it('should handle disconnect event', async () => {
		mockIpcServer.on.mockImplementation((event: string, callback: () => void) => {
			if (event === 'disconnect') {
				console.log('disconnect event triggered');
				callback(); // Simulate disconnect event
			}
		});

		const promise = connection({ clientId: 'test', token: 'test' });
		const disconnectHandler = mockIpcServer.on.mock.calls.find(
			(call: [string, Function]) => call[0] === 'disconnect',
		)?.[1];
		console.log('disconnectHandler:', disconnectHandler);
		if (disconnectHandler) {
			disconnectHandler();
		}
		console.log('promise:', promise);
		await expect(promise).resolves.toBeUndefined();
	});
});

describe('getGuilds', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIpcServer.on.mockClear();
		mockIpcServer.emit.mockClear();

		// Default successful credentials
		mockThat.getCredentials.mockResolvedValue({
			clientId: 'test-client',
			token: 'test-token',
		} as ICredentials);
	});

	it('should return guilds list on success', async () => {
		const mockGuilds = [
			{ name: 'Guild 1', value: 'g1' },
			{ name: 'Guild 2', value: 'g2' },
		];

		// Mock connection success
		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready'); // For connection() call
			} else if (event === 'list:guilds') {
				callback(mockGuilds); // For guildsRequest() call
			}
		});

		const result = await getGuilds(mockThat);

		expect(mockThat.getCredentials).toHaveBeenCalledWith('discordBotTriggerApi');
		expect(mockIpcServer.emit).toHaveBeenCalledWith('credentials', expect.any(Object)); // From connection()
		expect(mockIpcServer.emit).toHaveBeenCalledWith('list:guilds', {
			credentials: expect.any(Object),
		}); // From guildsRequest()
		expect(result).toEqual(mockGuilds);
	});

	it('should return error message if credentials fail', async () => {
		mockThat.getCredentials.mockRejectedValue(new Error('Auth failed'));
		const result = await getGuilds(mockThat);
		expect(result).toEqual([{ name: 'Credentials Error: Auth failed', value: 'false' }]);
	});

	it('should return error if credentials not found', async () => {
		mockThat.getCredentials.mockResolvedValue(null);
		const result = await getGuilds(mockThat);
		expect(result).toEqual([{ name: 'Credentials Not Found!', value: 'false' }]);
	});

	it('should return error message if connection fails', async () => {
		// Mock connection failure
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('error');
			}
		});

		const result = await getGuilds(mockThat);
		expect(result).toEqual([
			{
				name: 'Invalid credentials or connection error - Close and reopen this node modal once you have made changes.',
				value: 'false',
			},
		]);
	});

	it('should return message if no guilds found', async () => {
		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready');
			} else if (event === 'list:guilds') {
				callback([]); // Empty array
			}
		});

		const result = await getGuilds(mockThat);
		expect(result).toEqual([
			{ name: expect.stringContaining('Your bot is not part of any guilds'), value: 'false' },
		]);
	});

	it('should handle guild request timeout', async () => {
		// Mock connection success but no response to guilds request
		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready');
			}
			// No implementation for 'list:guilds' to simulate timeout
		});

		jest.useFakeTimers();
		const promise = getGuilds(mockThat);
		jest.advanceTimersByTime(15001); // Exceed the timeout
		jest.useRealTimers();

		const result = await promise;
		expect(result).toEqual([
			{ name: expect.stringContaining('Request Timed Out'), value: 'false' },
		]);
	}, 20000);

	it('should handle IPC error during guild request', async () => {
		// Mock connection success but IPC error during guild request
		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready');
			} else if (event === 'error') {
				callback(new Error('IPC error'));
			}
		});

		const promise = getGuilds(mockThat);

		// Manually trigger the error event after guild request attempt
		const errorHandler = mockIpcServer.on.mock.calls.find(
			(call: [string, Function]) => call[0] === 'error',
		)?.[1];
		if (errorHandler) {
			errorHandler(new Error('IPC error'));
		}

		const result = await promise;
		expect(result).toEqual([
			{
				name: 'IPC error - Close and reopen this node modal once you have made changes.',
				value: 'false',
			},
		]);
	});
});

describe('getChannels', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIpcServer.on.mockClear();
		mockIpcServer.emit.mockClear();

		// Default successful credentials
		mockThat.getCredentials.mockResolvedValue({
			clientId: 'test-client',
			token: 'test-token',
		} as ICredentials);
	});

	it('should return channels list on success', async () => {
		const mockChannels = [
			{ name: 'Channel 1', value: 'c1' },
			{ name: 'Channel 2', value: 'c2' },
		];
		const guildIds = ['guild1', 'guild2'];

		// Mock connection and channels request success
		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready'); // For connection() call
			} else if (event === 'list:channels') {
				callback(mockChannels); // For channelsRequest() call
			}
		});

		const result = await getChannels(mockThat, guildIds);

		expect(mockThat.getCredentials).toHaveBeenCalledWith('discordBotTriggerApi');
		expect(mockIpcServer.emit).toHaveBeenCalledWith('credentials', expect.any(Object));
		expect(mockIpcServer.emit).toHaveBeenCalledWith('list:channels', {
			credentials: expect.any(Object),
			guildIds,
		});
		expect(result).toEqual(mockChannels);
	});

	it('should return error message if credentials fail', async () => {
		const guildIds = ['guild1'];
		mockThat.getCredentials.mockRejectedValue(new Error('Auth failed'));

		const result = await getChannels(mockThat, guildIds);
		expect(result).toEqual([{ name: 'Credentials Error: Auth Failed', value: 'false' }]);
	});

	it('should return error message if connection fails', async () => {
		const guildIds = ['guild1'];

		// Mock connection failure
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('error');
			}
		});

		const result = await getChannels(mockThat, guildIds);
		expect(result).toEqual([
			{
				name: 'Invalid Credentials Or Connection Error - Close And Reopen This Node Modal Once You Have Made Changes.',
				value: 'false',
			},
		]);
	});

	it('should return message if no channels found', async () => {
		const guildIds = ['guild1'];

		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready');
			} else if (event === 'list:channels') {
				callback([]); // Empty array
			}
		});

		const result = await getChannels(mockThat, guildIds);
		expect(result).toEqual([
			{ name: expect.stringContaining('No Text Channels Found'), value: 'false' },
		]);
	});
});

describe('getRoles', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIpcServer.on.mockClear();
		mockIpcServer.emit.mockClear();

		// Default successful credentials
		mockThat.getCredentials.mockResolvedValue({
			clientId: 'test-client',
			token: 'test-token',
		} as ICredentials);
	});

	it('should return roles list on success', async () => {
		const mockRoles = [
			{ name: 'Role 1', value: 'r1' },
			{ name: 'Role 2', value: 'r2' },
		];
		const guildIds = ['guild1'];

		// Mock connection and roles request success
		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready'); // For connection() call
			} else if (event === 'list:roles') {
				callback(mockRoles); // For rolesRequest() call
			}
		});

		const result = await getRoles(mockThat, guildIds);

		expect(mockThat.getCredentials).toHaveBeenCalledWith('discordBotTriggerApi');
		expect(mockIpcServer.emit).toHaveBeenCalledWith('credentials', expect.any(Object));
		expect(mockIpcServer.emit).toHaveBeenCalledWith('list:roles', {
			credentials: expect.any(Object),
			guildIds,
		});
		expect(result).toEqual(mockRoles);
	});

	it('should return error message if credentials fail', async () => {
		const guildIds = ['guild1'];
		mockThat.getCredentials.mockRejectedValue(new Error('Auth failed'));

		const result = await getRoles(mockThat, guildIds);
		expect(result).toEqual([{ name: 'Credentials Error: Auth Failed', value: 'false' }]);
	});

	it('should return error message if connection fails', async () => {
		const guildIds = ['guild1'];

		// Mock connection failure
		mockIpcServer.on.mockImplementation((event: string, callback: (data: string) => void) => {
			if (event === 'credentials') {
				callback('error');
			}
		});

		const result = await getRoles(mockThat, guildIds);
		expect(result).toEqual([
			{
				name: 'Invalid Credentials Or Connection Error - Close And Reopen This Node Modal Once You Have Made Changes.',
				value: 'false',
			},
		]);
	});

	it('should filter out @everyone role', async () => {
		const guildIds = ['guild1'];
		const mockRoles = [
			{ name: '@Everyone', value: 'e1' }, // Should be filtered out
			{ name: 'Role 1', value: 'r1' },
		];

		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready');
			} else if (event === 'list:roles') {
				callback(mockRoles);
			}
		});

		const result = await getRoles(mockThat, guildIds);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Role 1');
	});

	it('should handle unexpected response format', async () => {
		const guildIds = ['guild1'];

		mockIpcServer.on.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === 'credentials') {
				callback('ready');
			} else if (event === 'list:roles') {
				callback('Not an array'); // Invalid format
			}
		});

		const result = await getRoles(mockThat, guildIds);
		expect(result).toEqual([
			{ name: expect.stringContaining('Unexpected Response'), value: 'false' },
		]);
	});
});

describe('ipcRequest', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockIpcServer.once.mockClear();
		mockIpcServer.emit.mockClear();
	});

	it('should resolve with data on successful callback', async () => {
		const type = 'send:message';
		const params = { channelId: 'c1', content: 'hello' };
		const creds: ICredentials = { clientId: 'test', token: 'test' };
		const expectedResponse = { success: true, messageId: 'msg1' };

		// Mock the 'once' listener for the specific callback event
		mockIpcServer.once.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === `callback:${type}`) {
				callback(expectedResponse);
			}
		});

		await expect(ipcRequest(type, params, creds)).resolves.toEqual(expectedResponse);
		expect(mockIpcServer.emit).toHaveBeenCalledWith(type, { ...params, credentials: creds });
		expect(mockIpcServer.once).toHaveBeenCalledWith(`callback:${type}`, expect.any(Function));
	});

	it('should work without credentials', async () => {
		const type = 'some:action';
		const params = { data: 'test' };
		const expectedResponse = { success: true, result: 'done' };

		mockIpcServer.once.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === `callback:${type}`) {
				callback(expectedResponse);
			}
		});

		await expect(ipcRequest(type, params)).resolves.toEqual(expectedResponse);
		expect(mockIpcServer.emit).toHaveBeenCalledWith(type, params); // No credentials
	});

	it('should reject if callback data has success: false', async () => {
		const type = 'send:action';
		const params = { action: 'kick' };
		const creds: ICredentials = { clientId: 'test', token: 'test' };
		const errorResponse = { success: false, error: 'Permission denied' };

		mockIpcServer.once.mockImplementation((event: string, callback: (data: any) => void) => {
			if (event === `callback:${type}`) {
				callback(errorResponse);
			}
		});

		await expect(ipcRequest(type, params, creds)).rejects.toThrow(errorResponse.error);
		expect(mockIpcServer.emit).toHaveBeenCalledWith(type, { ...params, credentials: creds });
	});

	it('should reject on timeout', async () => {
		jest.useFakeTimers();
		const type = 'send:long';
		const params = {};

		// Mock 'once' to *not* call back
		mockIpcServer.once.mockImplementation(() => {});

		const promise = ipcRequest(type, params);
		jest.advanceTimersByTime(15001);
		await expect(promise).rejects.toThrow(`${type} request timed out`);
		jest.useRealTimers();
	});

	it('should reject on IPC connection error', async () => {
		const type = 'send:stuff';
		const params = {};

		// Mock server error that occurs during the request
		mockIpcServer.on.mockImplementation((event: string, callback: (error: Error) => void) => {
			if (event === 'error') {
				setTimeout(() => callback(new Error('IPC broke')), 0);
			}
		});

		await expect(ipcRequest(type, params)).rejects.toThrow('IPC error during request');
	});

	it('should reject when IPC connection fails', async () => {
		const type = 'test:connection';
		const params = {};

		// Mock connectTo to indicate connection failure
		(jest.requireMock('node-ipc').connectTo as jest.Mock).mockImplementationOnce(() => {
			// Don't call the callback to simulate failed connection
		});

		jest.useFakeTimers();
		const promise = ipcRequest(type, params);
		jest.advanceTimersByTime(15001); // Timeout should trigger
		await expect(promise).rejects.toThrow(`${type} request timed out`);
		jest.useRealTimers();
	});
});
