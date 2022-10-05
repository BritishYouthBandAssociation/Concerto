'use strict';

const msal = require('@azure/msal-node');
const path = require('path');

async function getToken(config) {
	const cca = new msal.ConfidentialClientApplication(config);
	const resp = await cca.acquireTokenByClientCredential({
		scopes: ['https://graph.microsoft.com/.default']
	});

	return resp.accessToken;
}

async function listFiles(config, path) {
	const url = `https://graph.microsoft.com/v1.0/users/${config.files.user}/drive/root:${path}:/children`;
	const token = await getToken(config);

	const res = await fetch(url, {
		headers: {
			'Authorization': `Bearer ${token}`
		}
	});

	return res;
}

async function main() {
	const config = require('./config');

	//1. Download files
	const fileBase = path.join(config.files.root, String(new Date().getFullYear()));
	const files = await listFiles(config, fileBase);

	console.log(files);

	//for each file:
	//	2. Generate title card

	//	3. Add title card to video

	//4. Combine files

	//5. Upload final video
}

main().catch(e => {
	console.error(e);
});