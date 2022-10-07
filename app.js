'use strict';

const msal = require('@azure/msal-node');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { WritableStream } = require('node:stream/web');

const {execShell} = require('./utils');


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
	const vidRaw = `${dlPath} - noAud.mp4`;
	const audRaw = `${dlPath}.mp3`;
	const titleVid = `${title}.mp4`;
	const vidStream = `${dlPath}.ts`;
	const titleStream = `${title}.ts`;
	const tempJoin = `${dlPath}-join.ts`;
	const mutedAll = `${dlPath} - muted.mp4`;
	const all = `${dlPath} - all.mp4`;

	const streams = [titleStream, vidStream];
	const files = [vidRaw, audRaw, titleVid, vidStream, titleStream, tempJoin, mutedAll];

	await execShell(`ffmpeg -i "${dlPath}" -c:v copy -c:a libmp3lame -map 0:a "${audRaw}" -map 0:v "${vidRaw}" -y`);
	await execShell(`ffmpeg -loop 1 -i "${title}" -c:v libx264 -framerate 30 -t 5 "${titleVid}" -y`);
	await execShell(`ffmpeg -i "${titleVid}" -vcodec copy "${titleStream}" -y`);
	await execShell(`ffmpeg -i "${vidRaw}" -vcodec copy "${vidStream}" -y`);

	if (fs.existsSync(tempJoin)){
		fs.unlinkSync(tempJoin);
	}

	for (let i = 0; i < streams.length; i++){
		const data = fs.readFileSync(streams[i]);
		fs.appendFileSync(tempJoin, data);
	}

	await execShell(`ffmpeg -i "${tempJoin}" -acodec copy -vcodec copy "${mutedAll}" -y`);
	await execShell(`ffmpeg -i "${mutedAll}" -i "${audRaw}" -filter_complex "adelay=5000|5000" -c:v copy "${all}" -y`);

	//aaand finally overwrite the old vid
	fs.unlinkSync(dlPath);

	//now let's tidy up
	files.forEach(f => fs.unlinkSync(f));

	console.log(`Finished processing ${name} - the video can be found at ${all}`);

	return all;
}

async function main() {
	const config = require('./config');

	const dlPath = path.join(__dirname, 'tmp');
	if (!fs.existsSync(dlPath)) {
		fs.mkdirSync(dlPath, { recursive: true });
	}

	const fileBase = path.join(config.files.root, String(new Date().getFullYear() - 1));
	const dirs = await listFiles(config, fileBase);

	//todo: iterate dirs
	const folder = path.join(fileBase, dirs.value[0].name);
	const files = await listFiles(config, folder);
	const videos = (await Promise.all(files.value.map(f => processFile(dlPath, 'Brass Solo - 10 & Under', f)))).filter(x => x);

	//4. Combine files
	// const master = 'tmp/A1.mp4';
	// if (videos.length === 1){
	// 	//rename only video to final video
	// 	fs.renameSync(videos[0], master);
	// } else {
	// 	await VideoConverter.mergeVideos(videos[0], videos[1], master);
	// 	//this would possibly be better as one method call, taking a dynamic number of videos?
	// 	for (let i = 2; i < videos.length; i++){
	// 		await VideoConverter.mergeVideos(master, videos[i], master);
	// 	}
	// }

	//console.log(`Final video merged and available at ${master}`);

	//5. Upload final video
}

main().catch(e => {
	console.error(e);
});