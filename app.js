'use strict';

//const msal = require('@azure/msal-node');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

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

	config.path = path;
	return require('./sample-response');

	//return res;
}

async function generateTitle(opts) {
	const svgImage = `
	<svg width="${opts.width}" height="${opts.height}">
		<style>
		.name { 
			fill: #000; 
			font-size: 70px; 
			font-weight: bold; 
			font-family: 'Asket'; 
		}

		.band, .category{
			fill: #000;
			font-family: 'Open Sans';
		}
		
		.band { 
			font-size: 70px;
			font-weight: lighter;
		}

		.category{
			font-size: 50px;
		}
      </style>
      <text x="50%" y="30%" text-anchor="middle" class="name">${opts.name.toUpperCase()}</text>
	  <text x="50%" y="50%" text-anchor="middle" font-style="italic" class="band">${opts.band.replaceAll('&', '&amp;')}</text>
	  <text x="50%" y="70%" text-anchor="middle" class="category">${opts.category.replaceAll('&', '&amp;')}</text>
    </svg>
	`;

	const buffer = Buffer.from(svgImage);

	const logo = await sharp('byba.png').toBuffer();

	await sharp({
		create: {
			width: opts.width,
			height: opts.height,
			channels: 4,
			background: {
				r: 255,
				g: 255,
				b: 255,
				alpha: 1
			}
		}
	}).composite([
		{
			input: logo,
			top: 200,
			left: -400
		},
		{
			input: buffer,
			top: 0,
			left: 0
		}
	]).toFile(opts.path);
}

async function downloadFile(dlPath, fileData) {
	dlPath = path.join(dlPath, fileData.name);
	console.log(`Saving file to ${dlPath}...`);
	const res = await fetch(fileData['@microsoft.graph.downloadUrl']);
	const fileStream = fs.createWriteStream(dlPath);
	const stream = new WritableStream({
		write(chunk) {
			fileStream.write(chunk);
		}
	});

	res.body.pipeTo(stream);

	return dlPath;
}

async function processFile(dlPath, category, fileData) {
	if (!('file' in fileData)) {
		return;
	}

	const [band, name, _] = fileData.name.split('-');
	console.log(`Processing entry for ${name} of ${band}, who has entered category ${category}...`);

	//1. Download file
	dlPath = await downloadFile(dlPath, fileData);

	//2. Generate title card
	const title = await generateTitle({
		category: category.trim(),
		band: band.trim(),
		name: name.trim(),
		width: 1920,
		height: 1080,
		path: dlPath + '.jpg'
	});

	//3. Add title card to video
}

async function main() {
	const config = require('./config');

	const dlPath = path.join(__dirname, 'tmp');
	if (!fs.existsSync(dlPath)) {
		fs.mkdirSync(dlPath, { recursive: true });
	}

	const fileBase = path.join(config.files.root, String(new Date().getFullYear()));
	const files = await listFiles(config, fileBase);

	await Promise.all(files.value.map(f => processFile(dlPath, 'Brass Solo - 10 & Under', f)));

	//4. Combine files

	//5. Upload final video
}

main().catch(e => {
	console.error(e);
});