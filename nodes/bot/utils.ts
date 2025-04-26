import {
	EmbedBuilder,
	AttachmentBuilder,
	ColorResolvable,
	BufferResolvable, // Added for Buffer type
} from 'discord.js';

// --- Standalone Utility Functions ---

// Moved prepareMessage outside classes as it's a utility
// ---> ADDED export <-----
export function prepareMessage(nodeParameters: any): any {
	// prepare embed messages, if they are set by the client
	const embedFiles: AttachmentBuilder[] = []; // Use AttachmentBuilder type
	let embed: EmbedBuilder | undefined;
	if (nodeParameters.embed) {
		embed = new EmbedBuilder();
		if (nodeParameters.title) embed.setTitle(nodeParameters.title);
		if (nodeParameters.url) embed.setURL(nodeParameters.url);
		if (nodeParameters.description) embed.setDescription(nodeParameters.description);
		if (nodeParameters.color) embed.setColor(nodeParameters.color as ColorResolvable);
		if (nodeParameters.timestamp) {
			try {
				const timestampDate = Date.parse(nodeParameters.timestamp);
				if (!isNaN(timestampDate)) {
					embed.setTimestamp(timestampDate);
				} else {
					console.warn(`Invalid timestamp format: ${nodeParameters.timestamp}`);
				}
			} catch (e) {
				console.warn(`Error parsing timestamp: ${nodeParameters.timestamp}`, e);
			}
		}
		if (nodeParameters.footerText) {
			let iconURL = nodeParameters.footerIconUrl;
			if (iconURL && iconURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = iconURL.split(';base64,').pop();
					if (base64Data) {
						const buffer = Buffer.from(base64Data, 'base64');
						const attachmentName = `footer_icon.${iconURL.substring(iconURL.indexOf('/') + 1, iconURL.indexOf(';'))}`;
						const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
						embedFiles.push(attachment);
						iconURL = `attachment://${attachmentName}`;
					} else {
						iconURL = undefined; // Reset if base64 data is invalid
					}
				} catch (e) {
					console.warn(`Error processing base64 footer icon: ${e}`);
					iconURL = undefined; // Reset on error
				}
			}
			embed.setFooter({
				text: nodeParameters.footerText,
				...(iconURL ? { iconURL } : {}),
			});
		}
		if (nodeParameters.imageUrl) {
			let imageUrl = nodeParameters.imageUrl;
			if (imageUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = imageUrl.split(';base64,').pop();
					if (base64Data) {
						const buffer = Buffer.from(base64Data, 'base64');
						const attachmentName = `image.${imageUrl.substring(imageUrl.indexOf('/') + 1, imageUrl.indexOf(';'))}`;
						const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
						embedFiles.push(attachment);
						imageUrl = `attachment://${attachmentName}`;
						embed.setImage(imageUrl);
					} else {
						imageUrl = undefined; // Reset if base64 data is invalid
					}
				} catch (e) {
					console.warn(`Error processing base64 image: ${e}`);
					imageUrl = undefined; // Reset on error
				}
			} else {
				embed.setImage(imageUrl);
			}
		}
		if (nodeParameters.thumbnailUrl) {
			let thumbnailUrl = nodeParameters.thumbnailUrl;
			if (thumbnailUrl.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = thumbnailUrl.split(';base64,').pop();
					if (base64Data) {
						const buffer = Buffer.from(base64Data, 'base64');
						const attachmentName = `thumbnail.${thumbnailUrl.substring(thumbnailUrl.indexOf('/') + 1, thumbnailUrl.indexOf(';'))}`;
						const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
						embedFiles.push(attachment);
						thumbnailUrl = `attachment://${attachmentName}`;
						embed.setThumbnail(thumbnailUrl);
					} else {
						thumbnailUrl = undefined; // Reset if base64 data is invalid
					}
				} catch (e) {
					console.warn(`Error processing base64 thumbnail: ${e}`);
					thumbnailUrl = undefined; // Reset on error
				}
			} else {
				embed.setThumbnail(thumbnailUrl);
			}
		}
		if (nodeParameters.authorName) {
			let iconURL = nodeParameters.authorIconUrl;
			if (iconURL && iconURL.match(/^data:image\/(png|jpeg|jpg|gif);base64,/)) {
				try {
					const base64Data = iconURL.split(';base64,').pop();
					if (base64Data) {
						const buffer = Buffer.from(base64Data, 'base64');
						const attachmentName = `author_icon.${iconURL.substring(iconURL.indexOf('/') + 1, iconURL.indexOf(';'))}`;
						const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
						embedFiles.push(attachment);
						iconURL = `attachment://${attachmentName}`;
					} else {
						iconURL = undefined; // Reset if base64 data is invalid
					}
				} catch (e) {
					console.warn(`Error processing base64 author icon: ${e}`);
					iconURL = undefined; // Reset on error
				}
			}
			embed.setAuthor({
				name: nodeParameters.authorName,
				...(nodeParameters.authorUrl ? { url: nodeParameters.authorUrl } : {}),
				...(iconURL ? { iconURL } : {}),
			});
		}
		if (nodeParameters.fields?.field) {
			const fields = Array.isArray(nodeParameters.fields.field)
				? nodeParameters.fields.field
				: [nodeParameters.fields.field];
			fields.forEach((field: any) => {
				if (field.name && field.value) {
					embed?.addFields({
						name: field.name,
						value: field.value,
						inline: field.inline || false,
					});
				}
			});
		}
	}

	// add all the mentions at the end of the message
	let mentions = '';
	if (nodeParameters.mentionRoles) {
		const roles = Array.isArray(nodeParameters.mentionRoles)
			? nodeParameters.mentionRoles
			: [nodeParameters.mentionRoles];
		roles.forEach((role: string) => {
			if (role) mentions += ` <@&${role}>`;
		});
	}
	// Add user mentions if provided
	if (nodeParameters.mentionUsers) {
		const users = Array.isArray(nodeParameters.mentionUsers)
			? nodeParameters.mentionUsers
			: [nodeParameters.mentionUsers];
		users.forEach((user: string) => {
			if (user) mentions += ` <@${user}>`;
		});
	}

	let content = '';
	if (nodeParameters.content) content += nodeParameters.content;
	// Append mentions to content if they exist
	if (mentions) content += mentions;

	// if there are files, add them aswell
	let files: (AttachmentBuilder | BufferResolvable | string)[] = []; // Allow different types
	if (nodeParameters.files?.file) {
		const inputFiles = Array.isArray(nodeParameters.files.file)
			? nodeParameters.files.file
			: [nodeParameters.files.file];
		inputFiles.forEach((file: any) => {
			if (file.url) {
				files.push(file.url); // Add URL directly
			} else if (file.base64) {
				try {
					const buffer = Buffer.from(file.base64, 'base64');
					const attachment = new AttachmentBuilder(buffer, { name: file.name || 'file.dat' }); // Use provided name or default
					files.push(attachment);
				} catch (e) {
					console.warn(`Error processing base64 file ${file.name || ''}: ${e}`);
				}
			}
		});
	}
	if (embedFiles.length) files = files.concat(embedFiles);

	// prepare the message object how discord likes it
	const sendObject: any = {
		content: content || '', // Ensure content is at least an empty string
		...(embed ? { embeds: [embed] } : {}),
		...(files.length ? { files } : {}),
	};

	// Add reply options if messageIdToReply is provided
	if (nodeParameters.messageIdToReply) {
		sendObject.reply = {
			messageReference: nodeParameters.messageIdToReply,
			failIfNotExists: nodeParameters.failIfNotExists ?? true, // Default to true
		};
	}

	return sendObject;
}
