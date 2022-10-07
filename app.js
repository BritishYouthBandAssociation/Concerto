'use strict';

const msal = require('@azure/msal-node');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { WritableStream } = require('node:stream/web');

const {removeMany} = require('./utils');
const VideoConverter = require('./VideoConverter');


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

	const json = await res.json();
	return json;
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
      <text x="50%" y="25%" text-anchor="middle" class="name">${opts.name.toUpperCase().replaceAll('&', '&amp;')}</text>
	  <text x="50%" y="45%" text-anchor="middle" font-style="italic" class="band">${opts.band.replaceAll('&', '&amp;')}</text>
	  <text x="50%" y="60%" text-anchor="middle" class="category">${opts.category.replaceAll('&', '&amp;')}</text>
    </svg>
	`;

	const buffer = Buffer.from(svgImage);

	const byba = await sharp('byba.png').flatten({ background: '#FFF' }).resize({ height: opts.height / 2 }).ensureAlpha(0.4).toBuffer();
	const tymba = await sharp('TYMBA.png').flatten({ background: '#FFF' }).resize({ height: opts.height / 2 }).ensureAlpha(0.4).toBuffer();

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
			input: byba,
			top: opts.height / 4,
			left: -300
		},
		{
			input: tymba,
			top: opts.height / 4,
			left: opts.width - 270
		},
		{
			input: buffer,
			top: 0,
			left: 0
		}
	]).toFile(opts.path);

	return opts.path;
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

	await res.body.pipeTo(stream);

	return dlPath;
}

async function processFile(dlPath, category, fileData) {
	if (!('file' in fileData)) {
		return '';
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
	//yeahhh so this is where it gets horrible - we use ffmpeg here to do things!
	const all = await VideoConverter.addTitleToVideo(title, dlPath, 5);

	removeMany([dlPath, title]);

	console.log(`Finished processing ${name} - the video can be found at ${all}`);

	return all;
}

async function processDirectory(config, fileBase, dlPath, directory){
	const folder = path.join(fileBase, directory.name);
	const files = await listFiles(config, folder);
	const videos = [];

	//sync crashes the server!
	for (let i = 0; i < files.value.length; i++){
		videos.push(await processFile(dlPath, 'Brass Solo - 10 & Under', files.value[i]));
	}

	console.log();
	console.log('Exported videos:');
	console.log(videos);
	console.log();

	//4. Combine files
	const master = path.join('tmp', `${directory.name}.mp4`);
	if (videos.length === 0){
		return '';
	}

	if (videos.length === 1){
		//rename only video to final video
		fs.renameSync(videos[0], master);
	} else {
		const tempJoin = await VideoConverter.combineVideos(...videos);
		fs.renameSync(tempJoin, master);
	}

	removeMany(videos);

	console.log(`Final video merged and available at ${master}`);

	return master;
}

async function main() {
	const start = new Date();
	console.log(`Start: ${start}`);
	console.log();

	const config = require('./config');

	const dlPath = path.join(__dirname, 'tmp');
	if (!fs.existsSync(dlPath)) {
		fs.mkdirSync(dlPath, { recursive: true });
	}

	const fileBase = path.join(config.files.root, String(new Date().getFullYear() - 1));
	const response = await listFiles(config, fileBase);
	const dirs = response.value.filter(d => !['full','intro'].includes(d.name.toLowerCase()));

	//iterate dirs in batches, as all at once crashed my laptop :)
	while (dirs.length > 0){
		console.log(dirs.length);

		const batch = dirs.splice(0, 1);
		//multiple crash the server!
		console.log(batch);
		console.log();

		await Promise.all(batch.map(d => processDirectory(config, fileBase, dlPath, d))).catch(e => console.error(e));

		console.log(dirs.length);
	}

	//5. Upload final video
	//uploadVideo(config, 'tmp/A1.mp4', fileBase, 'full');
}

main().catch(e => {
	console.error(e);
});