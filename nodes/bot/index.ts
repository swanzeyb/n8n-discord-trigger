import { IPCRouter } from './IPCRouter';

// --- Main Execution ---
export default function () {
	// Initialize the IPC Router which sets up the server and handlers
	IPCRouter.initialize();
}

// Optional: Re-export classes/types if needed by other modules directly
// export * from './BotManager';
// export * from './BotInstance';
// export * from './IPCRouter';
// export * from './utils';
