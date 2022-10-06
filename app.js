'use strict';

const msal = require('@azure/msal-node');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { exec } = require('child_process');
const { WritableStream } = require('node:stream/web');

function Cmd(){
	this.execute = function(cmd){
		return new Promise((resolve, reject) => {
			exec(cmd, (error, stdout) => {
				if (error){
					reject(error);
					return;
				}

				resolve(stdout);
			});
		});
	};
}

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

	console.log(url);

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

	const byba = await sharp('byba.png').flatten({background: '#FFF'}).resize({height: opts.height / 2}).ensureAlpha(0.4).toBuffer();
	const tymba = await sharp('TYMBA.png').flatten({background: '#FFF'}).resize({height: opts.height / 2}).ensureAlpha(0.4).toBuffer();

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
	//yeahhh so this is where it gets horrible - we use ffmpeg here to do things!
	const cmd = new Cmd();
	await cmd.execute(`ffmpeg -loop 1 -framerate 30 -i "${title}" -c:v libx264 -t 5 -pix_fmt yuv420p "${title}.mp4"`);
	await Promise.all([cmd.execute(`ffmpeg -i "${title}.mp4" -c copy -bsf:v h264_mp4toannexb -f mpegts "${title}.ts"`), cmd.execute(`ffmpeg -i "${dlPath}" -c copy -bsf:v h264_mp4toannexb -f mpegts "${dlPath}.ts"`)]);
	await cmd.execute(`ffmpeg -i "concat:${title}.ts|${dlPath}.ts" -c copy -bsf:a aac_adtstoasc "${dlPath} - final.mp4"`);
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
	console.log(dirs.value[0]);
	const folder = path.join(fileBase, dirs.value[0].name);
	const files = await listFiles(config, folder);

	await Promise.all(files.value.map(f => processFile(dlPath, 'Brass Solo - 10 & Under', f)));

	//4. Combine files

	//5. Upload final video
}

main().catch(e => {
	console.error(e);
});