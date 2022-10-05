'use strict';

const msal = require('@azure/msal-node');
const path = require('path');
const fs = require('fs');

const { WritableStream } = require('node:stream/web');

// async function getToken(config) {
// 	const cca = new msal.ConfidentialClientApplication(config);
// 	const resp = await cca.acquireTokenByClientCredential({
// 		scopes: ['https://graph.microsoft.com/.default']
// 	});

// 	return resp.accessToken;
// }

function listFiles(config, path) {
	//const url = `https://graph.microsoft.com/v1.0/users/${config.files.user}/drive/root:${path}:/children`;
	//const token = await getToken(config);

	//we don't have the auth set up yet - TODO
	// const res = await fetch(url, {
	// 	headers: {
	// 		'Authorization': `Bearer ${token}`
	// 	}
	// });

	return require('./sample-response');

	//return res;
}

async function downloadFile(dlPath, fileData){
	dlPath = path.join(dlPath, fileData.name);
	console.log(`Saving file to ${dlPath}...`);
	const res = await fetch(fileData['@microsoft.graph.downloadUrl']);
	const fileStream = fs.createWriteStream(dlPath);
	const stream = new WritableStream({
		write(chunk){
			fileStream.write(chunk);
		}
	});

	res.body.pipeTo(stream);

	return dlPath;
}

async function processFile(dlPath, category, fileData){
	if (!('file' in fileData)){
		return;
	}

	const [band, name, _] = fileData.name.split('-');
	console.log(`Processing entry for ${name} of ${band}, who has entered category ${category}...`);

	//1. Download file
	dlPath = await downloadFile(dlPath, fileData);

	//2. Generate title card

	//3. Add title card to video
}

async function main() {
	const config = require('./config');

	const dlPath = path.join(__dirname, 'tmp');
	if (!fs.existsSync(dlPath)){
		fs.mkdirSync(dlPath, { recursive: true });
	}

	const fileBase = path.join(config.files.root, String(new Date().getFullYear()));
	const files = await listFiles(config, fileBase);

	await Promise.all(files.value.map(f => processFile(dlPath, 'A1', f)));

	//4. Combine files

	//5. Upload final video
}

main().catch(e => {
	console.error(e);
});