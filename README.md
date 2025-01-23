# n8n-nodes-discord-trigger

![n8n.io - Workflow Automation](https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png)

[n8n](https://www.n8n.io) nodes to trigger workflows from Discord messages.


This node utilizes a Discord bot to transmit or receive data from child processes when a node is executed. It is standalone but heavily inspired by `n8n-nodes-discord`.


[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Bot Setup](#bot-setup)  
[Operations](#operations)  
[Credentials](#credentials)  <!-- delete if no auth needed -->  
[Compatibility](#compatibility)  
[Usage](#usage)  <!-- delete if not using this section -->  
[Resources](#resources)  
[Version history](#version-history)  <!-- delete if not using this section -->  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.


## Bot Setup

To send, listen to messages, or fetch the list of channels or roles, you need to set up a bot using the [Discord Developer Portal](https://discord.com/developers/applications).

1. Create a new application and set it up as a bot.
2. Enable the **Privileged Gateway Intents** for Message Intent.
3. Add the bot to your server with at least **read channel permissions**.



## Operations

With this node, you can:
- Listen to Discord chat messages.
- React to messages with specific patterns or triggers.
- Fetch lists of channels and roles.



## Credentials

You need to authenticate the node with the following credentials:
- **Client ID**: The OAuth2 client ID of the Discord App.
- **Bot Token**: The bot token of the Discord App.
- **n8n API Key**: The API key of your n8n server.
- **Base URL**: The API URL of your n8n instance (e.g., `https://n8n.example.com/api/v1`).

Refer to the [official n8n documentation](https://docs.n8n.io/) for more details.


## Compatibility

(coming soon)


## Usage

To use this node:
1. Install it as a community node in your n8n instance.
2. Configure the required credentials.
3. Set up triggers for Discord messages based on your use case.

For more help on setting up n8n workflows, check the [Try it out documentation](https://docs.n8n.io/try-it-out/).


## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* _Link to app/service documentation._

## Version history

- **v0.2.0**: A second node Discord Interaction is added to send a message with the same credentials. Additionally roles of users can be added or removed based on interaction.
- **v0.1.5**: Initial release with message triggers and channel/role fetching capabilities.

