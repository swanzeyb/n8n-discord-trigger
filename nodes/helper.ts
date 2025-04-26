import ipc from 'node-ipc';
import { INodePropertyOptions } from 'n8n-workflow';

export interface ICredentials {
	clientId: string;
	token: string;
	apiKey?: string; // Optional based on usage
	baseUrl?: string; // Optional based on usage
}

export const connection = (credentials: ICredentials): Promise<string | void> => {
	return new Promise((resolve, reject) => {
		if (!credentials || !credentials.token || !credentials.clientId) {
			reject('credentials missing');
			return;
		}

		const timeout = setTimeout(() => reject('timeout'), 15000);

		ipc.config.retry = 1500;
		// Connect to the new server ID
		ipc.connectTo('bot', () => {
			// Use the correct reference
			const server = ipc.of['bot'];
			if (!server) {
				clearTimeout(timeout);
				reject('IPC connection failed');
				return;
			}

			server.emit('credentials', credentials);

			server.on('credentials', (data: string) => {
				clearTimeout(timeout);
				if (data === 'error') reject('Invalid credentials or connection error');
				else if (data === 'missing') reject('Token or clientId missing');
				// Removed 'login' and 'different' as connectBot handles this now
				// else if (data === 'login') reject('Already logging in');
				// else if (data === 'different') resolve('Already logging in with different credentials');
				else resolve(data); // 'ready' or 'already'
			});

			// Handle IPC connection errors
			server.on('error', (error: any) => {
				console.error('IPC Error:', error);
				reject(new Error(`IPC Connection Error: ${error.message || error}`));
			});
		});
	});
};

export const getChannels = async (
	that: any,
	guildIds: string[],
): Promise<INodePropertyOptions[]> => {
	const endMessage = ' - Close and reopen this node modal once you have made changes.';

	let credentials;
	try {
		credentials = await that.getCredentials('discordBotTriggerApi');
	} catch (error: any) {
		// Added type annotation
		return [{ name: `Credentials Error: ${error.message}`, value: 'false' }];
	}

	if (!credentials) {
		return [{ name: 'Credentials Not Found!', value: 'false' }]; // Changed casing
	}

	const channelsRequest = (): Promise<{ name: string; value: string }[] | string> => // Allow string for error messages
		new Promise((resolve) => {
			const timeout = setTimeout(() => resolve('Request timed out'), 15000);

			ipc.config.retry = 1500;
			ipc.connectTo('bot', () => {
				const server = ipc.of['bot'];
				if (!server) {
					clearTimeout(timeout);
					resolve('IPC connection failed');
					return;
				}
				// Include credentials and guildIds
				// ---> The handler for 'list:channels' in bot.ts will check bot readiness <---
				server.emit('list:channels', { credentials, guildIds });

				// ---> Use 'once' for the response listener to avoid manual cleanup <---
				// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
				server.once(
					'list:channels',
					(data: { name: string; value: string }[] | { error: string }) => {
						clearTimeout(timeout);
						// ---> Check for explicit error from bot process <---
						if (data && typeof data === 'object' && 'error' in data) {
							resolve(data.error); // Resolve with the error message string
						} else if (Array.isArray(data)) {
							resolve(data); // Resolve with the channel list
						} else {
							resolve('Invalid response from bot process'); // Handle unexpected response
						}
					},
				);

				// ---> Use 'once' for the error listener during this specific request <---
				// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
				server.once('error', (err: any) => {
					// ---> Added type any
					clearTimeout(timeout);
					console.error('IPC Error during list:channels:', err);
					resolve('IPC error');
					// Disconnect after error? Depends on desired retry behavior.
					// ipc.disconnect('bot');
				});

				// ---> Consider disconnecting after the request is fulfilled or errors out? <---
				// This might make IPC connections more ephemeral if desired.
				// server.once('list:channels', () => ipc.disconnect('bot'));
				// server.once('error', () => ipc.disconnect('bot'));
			});
		});

	const channels = await channelsRequest();

	if (typeof channels === 'string') {
		// Handle error string from promise
		return [{ name: channels + endMessage, value: 'false' }];
	}

	if (Array.isArray(channels) && channels.length) {
		return channels;
	} else {
		// ---> Refined message for empty array or permission issues <---
		const message =
			'No text channels found in the selected server(s), bot lacks permissions, or bot is not ready.' +
			endMessage;
		return [{ name: message, value: 'false' }];
	}
};

export const getGuilds = async (that: any): Promise<INodePropertyOptions[]> => {
	const endMessage = ' - Close and reopen this node modal once you have made changes.';

	let credentials;
	try {
		credentials = await that.getCredentials('discordBotTriggerApi');
	} catch (error: any) {
		// Added type annotation
		return [{ name: `Credentials Error: ${error.message}`, value: 'false' }];
	}

	if (!credentials) {
		return [{ name: 'Credentials Not Found!', value: 'false' }]; // Changed casing
	}

	const guildsRequest = (): Promise<{ name: string; value: string }[] | string> => // Allow string for error messages
		new Promise((resolve) => {
			const timeout = setTimeout(() => resolve('Request timed out'), 15000);

			ipc.config.retry = 1500;
			ipc.connectTo('bot', () => {
				const server = ipc.of['bot'];
				if (!server) {
					clearTimeout(timeout);
					resolve('IPC connection failed');
					return;
				}
				// Include credentials for context
				// ---> The handler for 'list:guilds' in bot.ts will check bot readiness <---
				server.emit('list:guilds', { credentials });

				// ---> Use 'once' for the response listener <---
				// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
				server.once(
					'list:guilds',
					(data: { name: string; value: string }[] | { error: string }) => {
						clearTimeout(timeout);
						// ---> Check for explicit error from bot process <---
						if (data && typeof data === 'object' && 'error' in data) {
							resolve(data.error); // Resolve with the error message string
						} else if (Array.isArray(data)) {
							resolve(data); // Resolve with the guild list
						} else {
							resolve('Invalid response from bot process'); // Handle unexpected response
						}
					},
				);

				// ---> Use 'once' for the error listener <---
				// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
				server.once('error', (err: any) => {
					// ---> Added type any
					clearTimeout(timeout);
					console.error('IPC Error during list:guilds:', err);
					resolve('IPC error');
					// ipc.disconnect('bot');
				});

				// server.once('list:guilds', () => ipc.disconnect('bot'));
				// server.once('error', () => ipc.disconnect('bot'));
			});
		});

	const guilds = await guildsRequest();

	if (typeof guilds === 'string') {
		// Handle error string from promise
		return [{ name: guilds + endMessage, value: 'false' }];
	}

	if (Array.isArray(guilds) && guilds.length) {
		return guilds;
	} else {
		// ---> Refined message <---
		const message =
			'Bot is not in any guilds, failed to fetch them, or bot is not ready.' + endMessage;
		return [{ name: message, value: 'false' }];
	}
};

export interface IRole {
	name: string;
	id: string;
}

export const getRoles = async (
	that: any,
	selectedGuildIds: string[],
): Promise<INodePropertyOptions[]> => {
	const endMessage = ' - Close and reopen this node modal once you have made changes.';

	let credentials;
	try {
		credentials = await that.getCredentials('discordBotTriggerApi');
	} catch (error: any) {
		// Added type annotation
		return [{ name: `Credentials Error: ${error.message}`, value: 'false' }];
	}

	if (!credentials) {
		return [{ name: 'Credentials Not Found!', value: 'false' }]; // Changed casing
	}

	const rolesRequest = (): Promise<{ name: string; value: string }[] | string> => // Allow string for error messages
		new Promise((resolve) => {
			const timeout = setTimeout(() => resolve('Request timed out'), 15000);

			ipc.config.retry = 1500;
			ipc.connectTo('bot', () => {
				const server = ipc.of['bot'];
				if (!server) {
					clearTimeout(timeout);
					resolve('IPC connection failed');
					return;
				}
				// Include credentials and guildIds
				// ---> The handler for 'list:roles' in bot.ts will check bot readiness <---
				server.emit('list:roles', { credentials, guildIds: selectedGuildIds });

				// ---> Use 'once' for the response listener <---
				// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
				server.once('list:roles', (data: { name: string; value: string }[] | { error: string }) => {
					clearTimeout(timeout);
					// ---> Check for explicit error from bot process <---
					if (data && typeof data === 'object' && 'error' in data) {
						resolve(data.error); // Resolve with the error message string
					} else if (Array.isArray(data)) {
						resolve(data); // Resolve with the role list
					} else {
						resolve('Invalid response from bot process'); // Handle unexpected response
					}
				});

				// ---> Use 'once' for the error listener <---
				// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
				server.once('error', (err: any) => {
					// ---> Added type any
					clearTimeout(timeout);
					console.error('IPC Error during list:roles:', err);
					resolve('IPC error');
					// ipc.disconnect('bot');
				});

				// server.once('list:roles', () => ipc.disconnect('bot'));
				// server.once('error', () => ipc.disconnect('bot'));
			});
		});

	const roles = await rolesRequest();

	if (typeof roles === 'string') {
		// Handle error string from promise
		return [{ name: roles + endMessage, value: 'false' }];
	}

	if (Array.isArray(roles)) {
		// Filter @everyone - already done in BotInstance.fetchRoles, but keep for safety
		const filtered = roles.filter((r: any) => r.name !== '@everyone');
		if (filtered.length) return filtered;
		else {
			// ---> Refined message <---
			const message =
				'No roles found (excluding @everyone) in the selected server(s), bot lacks permissions, or bot is not ready.' +
				endMessage;
			return [{ name: message, value: 'false' }];
		}
	} else {
		// Handle cases where roles might not be an array (e.g., empty response, error indicator)
		// ---> Refined message <---
		const message = 'Unexpected response, error fetching roles, or bot is not ready.' + endMessage;
		return [{ name: message, value: 'false' }];
	}
};

// Updated ipcRequest to include credentials and use new server ID
export const ipcRequest = (
	type: string,
	parameters: any,
	credentials?: ICredentials,
): Promise<any> => {
	return new Promise((resolve, reject) => {
		// Added reject
		const timeout = setTimeout(() => reject(new Error(`${type} request timed out`)), 15000); // Reject on timeout

		ipc.config.retry = 1500;
		ipc.connectTo('bot', () => {
			const server = ipc.of['bot'];
			if (!server) {
				clearTimeout(timeout);
				reject(new Error('IPC connection failed'));
				return;
			}

			const callbackEvent = `callback:${type}`;

			// Listener for the response
			const listener = (data: any) => {
				clearTimeout(timeout);
				// Check if response indicates failure
				if (data && data.success === false) {
					console.error(`IPC request ${type} failed:`, data.error);
					reject(new Error(data.error || `IPC request ${type} failed`));
				} else {
					resolve(data);
				}
				// Clean up listener? IPC might handle this, but check docs if issues arise.
				// server.off(callbackEvent, listener); // Potentially needed
			};
			// @ts-ignore - Suppress incorrect TS error for node-ipc 'once' method
			server.once(callbackEvent, listener); // Use once to auto-remove listener after response

			// Handle IPC errors during the request
			server.on('error', (err: any) => {
				clearTimeout(timeout);
				console.error(`IPC Error during ${type} request:`, err);
				reject(new Error('IPC error during request'));
				// server.off(callbackEvent, listener); // Clean up listener on error
			});

			// Send event to bot, including credentials if provided
			const payload = credentials ? { ...parameters, credentials } : parameters;
			server.emit(type, payload);
		});
	});
};
