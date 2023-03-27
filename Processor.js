'use strict';

const { parentPort, workerData } = require('worker_threads');
const sharp = require('sharp');
const { WritableStream } = require('node:stream/web');
const path = require('path');
const fs = require('fs');

const { removeMany, removeFolder } = require('./utils');
const VideoConverter = require('./VideoConverter');
const Colour = require('./Colour');
const Utils = require('./utils');

const today = new Date();
const titleConfig = {
	width: 1920,
	height: 1080,
	title: `I&E ${today.getFullYear()}`
};

const dlPath = workerData.dlPath;
const config = workerData.config;

let isWorking = false;

async function processFiles(directory, files){
	if (!files || !files.value || files.value.length === 0) {
		return done();
	}

	const videos = (await Promise.all([...files.value.map(f => processFile(dlPath, directory.name, f)), generateTitle({
		category: '',
		band: directory.name,
		name: titleConfig.title,
		width: titleConfig.width,
		height: titleConfig.height,
		path: path.join('tmp', `${directory.name}.jpg`)
	})])).filter(x => x);

	const title = videos.pop();
	const withoutTitle = videos[0];
	videos[0] = await VideoConverter.addTitleToVideo(title, videos[0], 5, true);

	if(videos[0].indexOf(":\\") < 0){
		videos[0] = path.join(__dirname, videos[0]);
	}

	//4. Combine files
	const master = path.join('tmp', `${directory.name}.mp4`);
	if (videos.length === 0) {
		console.log();
		return '';
	}

	if (videos.length === 1) {
		//rename only video to final video
		fs.renameSync(videos[0], master);
	} else {
		const tempJoin = await VideoConverter.combineCommonFormatVideos(...videos);
		fs.renameSync(tempJoin, master);
	}

	removeMany([...videos, title, withoutTitle]);
	console.log();

	return done(master);
}

function logProcessStart(category, message){
	Colour.writeColouredText(`${category.trim().substring(0, 2)}: ${message}`, Colour.OPTIONS.FG_MAGENTA);
}

function logProcessEnd(category, message){
	Colour.writeColouredText(`${category.trim().substring(0, 2)}: ${message}`, Colour.OPTIONS.FG_CYAN);
}

async function processFile(dlPath, category, fileData) {
	if (!('file' in fileData)) {
		return '';
	}

	const parts = path.parse(fileData.name).name.split(' - ');
	const name = parts[0].trim();
	const toRemove = [];
	let band = '';
	let trusted = false;

	if (parts.length >= 2) {
		band = parts[1].trim();
	}

	logProcessStart(category, `Downloading ${name} of ${band}, who has entered category ${category}...`);

	//1. Download file
	dlPath = await downloadFile(dlPath, fileData, category.substring(0,2));

	logProcessEnd(category, `Downloaded ${name} of ${band} to ${dlPath}`);

	if(await VideoConverter.isPortrait(dlPath)){
		logProcessStart(category, `${name} of ${band} filmed in portrait - adding background to make landscape!`);
		toRemove.push(dlPath);
		dlPath = await VideoConverter.addLandscapeBackgroundToPortraitVideo(dlPath, "bg.png", titleConfig.height);
		logProcessEnd(category, `${name} of ${band} is now landscape`);
		trusted = true;
	}

	//2. Generate title card
	logProcessStart(category, `Generating title card for ${name} of ${band}`);
	const title = await generateTitle({
		category: category?.trim() ?? '',
		band: band?.trim() ?? '',
		name: name?.trim() ?? '',
		width: titleConfig.width,
		height: titleConfig.height,
		path: dlPath + '.jpg'
	});
	logProcessEnd(category, `Generated title card for ${name} of ${band} at ${title}`);

	//3. Add title card to video
	//yeahhh so this is where it gets horrible - we use ffmpeg here to do things!
	logProcessStart(category, `Adding title card to video entry of ${name} of ${band}`);
	const all = await VideoConverter.addTitleToVideo(title, dlPath, 5, trusted);
	toRemove.push(title, dlPath);
	logProcessEnd(category, `${name} of ${band} now has a title card!`);

	logProcessStart(category, `Removing ${toRemove.length} temp files`);
	removeMany(toRemove);
	logProcessEnd(category, "Temporary files removed");

	Colour.writeColouredText(`Finished processing ${name} of ${band} - final video is available at ${all}`, Colour.OPTIONS.FG_GREEN);
	return all;
}

async function downloadFile(dlPath, fileData, prefix = '') {
	dlPath = path.join(dlPath, prefix + fileData.name);
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
      <text x="50%" y="35%" text-anchor="middle" class="name">${opts.name.toUpperCase().replaceAll('&', '&amp;')}</text>
	  <text x="50%" y="50%" text-anchor="middle" font-style="italic" class="band">${opts.band.replaceAll('&', '&amp;')}</text>
	  <text x="50%" y="65%" text-anchor="middle" class="category">${opts.category.replaceAll('&', '&amp;')}</text>
    </svg>
	`;

	const buffer = Buffer.from(svgImage);

	const byba = await sharp('byba.png').flatten({ background: '#FFF' }).resize({ height: opts.height / 2 }).ensureAlpha(0.4).toBuffer();
	const tymba = await sharp('TYMBA.png').flatten({ background: '#FFF' }).resize({ height: opts.height / 2 }).ensureAlpha(0.4).toBuffer();
	const sponsor = await sharp('marching arts.png').flatten({ background: '#FFF' }).resize({ height: opts.height * 0.1 }).toBuffer();

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
			input: sponsor,
			left: opts.width * 0.4,
			top: opts.height * 0.85
		},
		{
			input: buffer,
			top: 0,
			left: 0
		}
	]).toFile(opts.path);

	return opts.path;
}

function done(mergedFile){
	isWorking = false;
	const msg = {
		type: "DONE"
	};

	if(mergedFile != null){
		msg.file = mergedFile;
	}

	parentPort.postMessage(msg);
	console.timeEnd(timerName);
	workStart = 0;
}

let timerName = "";
let workStart = 0;
parentPort.on('message', async (msg) => {
	if(msg?.type && msg.type == "FILE"){
		timerName = msg.name;
		workStart = performance.now();
		console.time(timerName);

		isWorking = true;
		const files = await Utils.listFiles(config, path.join(workerData.fileBase, msg.name))
		await processFiles(msg, files);

	} else if(msg.type == "STATUS"){
		const data = {
			type: 'STATUS',
			isWorking
		};

		if(isWorking){
			data.job = timerName,
			data.start = workStart
		};

		parentPort.postMessage(data);
	}
});