import { ICredentials } from '../../credentials/DiscordBotTriggerApi.credentials'; // Assuming ICredentials path
import { BotInstance } from './BotInstance'; // Import BotInstance

// +++ Start: Added BotManager Class +++
export class BotManager {
	private botInstances: Map<string, BotInstance>; // Added type annotation

	constructor() {
		this.botInstances = new Map();
	}

	async connectBot(
		credentials: ICredentials,
	): Promise<{ instanceId: string; status: 'ready' | 'already' | 'error'; error?: string }> {
		const instanceId = this.generateInstanceId(credentials);

		// Check if bot instance already exists and is ready or logging in
		const existingInstance = this.botInstances.get(instanceId);
		if (existingInstance) {
			if (existingInstance.isReady()) {
				return { instanceId, status: 'already' };
			}
			if (existingInstance.isLoggingIn()) {
				// Wait briefly for login to complete or fail
				await new Promise((resolve) => setTimeout(resolve, 2000)); // Adjust timeout as needed
				if (existingInstance.isReady()) {
					return { instanceId, status: 'already' };
				} else if (existingInstance.hasError()) {
					// Clear error and attempt reconnect
					existingInstance.clearError();
					console.log(`Retrying connection for bot ${credentials.clientId}...`);
					// Fall through to connect logic
				} else {
					return { instanceId, status: 'error', error: 'Login in progress, please wait.' };
				}
			} else if (existingInstance.hasError()) {
				// Clear error and attempt reconnect
				existingInstance.clearError();
				console.log(`Retrying connection for bot ${credentials.clientId} after previous error...`);
				// Fall through to connect logic
			} else {
				// Should not happen, but handle potential inconsistent state
				console.warn(
					`Bot instance ${instanceId} exists but is not ready, logging in, or in error state. Attempting reconnect.`,
				);
				// Fall through to connect logic
			}
		}

		// Create and connect new bot instance or reconnect existing one
		console.log(`Connecting bot ${credentials.clientId}...`);
		const botInstance = existingInstance || new BotInstance(credentials);
		if (!existingInstance) {
			this.botInstances.set(instanceId, botInstance);
		}

		const connected = await botInstance.connect();

		if (connected) {
			return { instanceId, status: 'ready' };
		} else {
			// Connection failed, keep the instance in the map to potentially retry later
			// The error state is set within botInstance.connect()
			return {
				instanceId,
				status: 'error',
				error: botInstance.getError() || 'Unknown connection error',
			};
		}
	}

	getBotInstance(instanceId: string): BotInstance | undefined {
		return this.botInstances.get(instanceId);
	}

	getBotByCredentials(credentials: ICredentials): BotInstance | undefined {
		const instanceId = this.generateInstanceId(credentials);
		return this.getBotInstance(instanceId);
	}

	private generateInstanceId(credentials: ICredentials): string {
		// Create unique ID based on clientId to identify this bot instance
		return `bot-${credentials.clientId}`;
	}

	disconnectBot(instanceId: string): void {
		const instance = this.botInstances.get(instanceId);
		if (instance) {
			instance.disconnect();
			this.botInstances.delete(instanceId);
			console.log(`Bot instance ${instanceId} disconnected and removed.`);
		}
	}

	getAllBotInstances(): BotInstance[] {
		return Array.from(this.botInstances.values());
	}
}
// +++ End: Added BotManager Class +++
