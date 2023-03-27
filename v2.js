const { readdirSync } = require("fs");
const path = require("path");
const fs = require('fs');

const { execShell } = require("./utils");
const VideoConverter = require("./VideoConverter");
const Colour = require("./Colour");


const base = "C:\\Users\\luke\\Downloads\\I&E playground\\";

async function framerate(vid) {
	const res = await execShell(`ffprobe -v error -select_streams v -of default=noprint_wrappers=1:nokey=1 -show_entries stream=r_frame_rate "${vid}"`);
	return eval(res);
}

async function processDirectory(dir) {
	console.time(dir);
	const categoryName = dir.split(" - ")[1].trim();
	const inputs = readdirSync(path.join(base, dir)).filter(f => !f.endsWith("-final.mp4") && !f.endsWith("-all.mp4") && !f.endsWith("-landscape.mp4"));
	const processed = [];

	for (let i = 0; i < inputs.length; i++) {
		let vid = inputs[i];

		if(vid.indexOf(":\\") < 0){
			vid = path.join(base, dir, vid);
		}

		// if (await VideoConverter.isPortrait(vid)) {
		// 	console.log(`${vid} is portrait - making landscape...`);
		// 	vid = await VideoConverter.addLandscapeBackgroundToPortraitVideo(vid, path.join(__dirname, 'bg.png'));
		// }

		const res = await processFile(vid, categoryName);
		console.log(`Processed video to ${res}`);
		processed.push(res);
	};

	const category = await mergeWithTitle(categoryName, ...processed);
	console.log(`Merged category to ${category}`);
	console.timeEnd(dir);

	return category;
}

async function mergeWithTitle(title, ...videos) {
	if (videos.length === 0) {
		throw 'Expected one or more videos to process!';
	}

	const output = videos[0] + "-all.mp4";
	const colour = 'fontcolor=0x282360';

	let inputs = "";
	let filter = "";

	for (let i = 0; i < videos.length; i++) {
		inputs += ` -i "${videos[i]}"`;
		filter += ` [${i + 1}:v] [${i + 1}:a]`;
	}

	await execShell(`ffmpeg -i "${path.join(__dirname, "bg.png")}" ${inputs.trim()} -filter_complex "${filter} concat=n=${videos.length}:v=1:a=1 [v] [a];[v]setpts=PTS-STARTPTS+5/TB[v];[0:v][v]overlay[v];[a]adelay=5000|5000[a];[v]drawtext=fontfile='/Users/luke/Downloads/font.ttf':${colour}:fontsize=70:x=(w-text_w)/2:y=(h*0.35):text='${title.toUpperCase()}':enable='between(t,0,4)',drawtext=fontfile='/Users/luke/Downloads/Open_Sans/static/OpenSans/OpenSans-Regular.ttf':${colour}:fontsize=50:x=(w-text_w)/2:y=(h*0.65):text='I&E 2022':enable='between(t,0,4)'[v]" -map "[v]" -map "[a]" "${output}" -y`);

	return output;
}

async function merge(...videos) {
	if (videos.length === 0) {
		throw 'Expected one or more videos to process!';
	}

	// let offset = 0;
	// while(videos.length > 5){
	// 	const data = videos.splice(offset, 5);
	// 	const processed = await merge(...data);
	// 	videos.splice(offset, 0, processed);
	// 	offset++;

	// 	if(offset >= videos.length){
	// 		offset = 0;
	// 	}
	// }

	const parsed = path.parse(videos[0]);
	const output = path.join(__dirname, 'tmp', parsed.name + "-all.mp4");

	let inputs = "";
	let filter = "";

	for (let i = 0; i < videos.length; i++) {
		inputs += ` -i "${videos[i]}"`;
		filter += ` [${i}:v] [${i}:a]`;
	}

	await execShell(`ffmpeg ${inputs.trim()} -filter_complex "${filter} concat=n=${videos.length}:v=1:a=1 [v] [a]" -map "[v]" -map "[a]" "${output}" -y`);

	return output;
}

async function processFile(file, category) {
	console.time(file);

	const duration = 5;
	const targetFPS = 30;
	const target_w = 1920;
	const target_h = 1080;
	const colour = 'fontcolor=0x282360';
	const enabled = `enable='between(t,0,${duration - 0.1})'`;

	const output = `${file}-final.mp4`;
	const bg = path.join(__dirname, "bg.png");

	const fileData = path.parse(file);
	const parts = path.parse(file).name.replaceAll(fileData.ext, "").split(' - ');
	const name = parts[0].trim().replaceAll("'", "’");
	let band = '';

	if (parts.length > 1) {
		band = parts[1].replaceAll("'", "’");
	}

	const isLandscape = await VideoConverter.isLandscape(file);

	//pad=iw:2*trunc(ih*${target_w}/${target_h}):(ow-iw)/2:(oh-ih)/2,

	let inputs = `-i "${file}" `;
	let filter = "";
	let bgLabel = "[1:v]";
	if(isLandscape){
		Colour.writeColouredText("Video is landscape", Colour.OPTIONS.FG_CYAN);
		inputs += `-loop 1 -t 5 -i "${bg}" -t 6 -f lavfi -i color=c=black:s=1920x1080:r=30`;
		filter = `[2:v]${bgLabel}overlay=eof_action=pass[bg];`; //make bg black after 5s so we don't have tiny lil title card bits
		bgLabel = "[bg]";
	} else {
		Colour.writeColouredText("Video is portrait", Colour.OPTIONS.FG_YELLOW);
		inputs += `-i "${bg}"`;
	}

	filter += `[0:v]scale=${target_w}x${target_h}:force_original_aspect_ratio=decrease,fps=${targetFPS},setpts=PTS-STARTPTS+${duration}/TB[delayed];`; //offset video start for title card
	filter += `${bgLabel}[delayed]overlay=(W-w)/2:(H-h)/2[out];` //overlay bg and video
	filter += `[0:a]adelay=${duration * 1000}|${duration * 1000}[aud];` //delay our audio too
	filter += `[out]drawtext=fontfile='/Users/luke/Downloads/font.ttf':${colour}:fontsize=70:x=(w-text_w)/2:y=(h*0.35):text='${name.toUpperCase()}':${enabled}`; //add participant

	if (band.trim().length > 0) {
		filter += `,drawtext=fontfile='/Users/luke/Downloads/Open_Sans/static/OpenSans/OpenSans-Light.ttf':${colour}:fontsize=70:x=(w-text_w)/2:y=(h)/2:text='${band}':${enabled}` //add band
	}
	
	filter += `,drawtext=fontfile='/Users/luke/Downloads/Open_Sans/static/OpenSans/OpenSans-Regular.ttf':${colour}:fontsize=50:x=(w-text_w)/2:y=(h*0.65):text='${category}':${enabled}[out]`; //add category
	
	const cmd = `ffmpeg ${inputs} -filter_complex "${filter}" -map [out] -map [aud] -r ${targetFPS} -c:v libx264 -preset ultrafast "${output}" -y`;
	await execShell(cmd);
	console.timeEnd(file);

	return output;
}

async function main() {
	console.time("app");

	const dirs = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
	const categories = [];

	const introSrc = path.join(__dirname, "intro.mp4");
	const breakSrc = path.join(__dirname, "Mid sponsor.mp4");
	const sponsorSrc = path.join(__dirname, "sponsor.mp4");
	
	let runningTime = (await VideoConverter.getDuration(introSrc)).totalSeconds;
	const breakTime = (await VideoConverter.getDuration(breakSrc)).totalSeconds;
	const sponsorTime = (await VideoConverter.getDuration(sponsorSrc)).totalSeconds;
	
	categories.push(introSrc, sponsorSrc);
	
	const runningOrder = [{
		name: "Intro",
		path: introSrc,
		duration: runningTime,
		startTime: 0
	}, {
		name: "Ad",
		path: sponsorSrc,
		duration: sponsorTime,
		startTime: runningTime
	}];
	
	let timeSinceBreak = 0;

	console.time("Process categories");
	for (let i = 0; i < dirs.length; i++) {
		const res = await processDirectory(dirs[i]);
		categories.push(res);

		const duration = await VideoConverter.getDuration(res);

		runningOrder.push({
			name: dirs[i],
			path: res,
			duration: duration,
			startTime: runningTime
		});

		runningTime += duration.totalSeconds;
		timeSinceBreak += duration.totalSeconds;

		if (timeSinceBreak >= 3600 && dirs.length - i > 2 && dirs[i].substring(0, 1) != dirs[i + 1].substring(0, 1)) {
			categories.push(breakSrc);

			runningOrder.push({
				name: 'Break',
				path: breakSrc,
				duration: breakTime,
				startTime: runningTime
			});

			console.log(`${timeSinceBreak} seconds since break - adding break at ${runningTime} for ${breakTime + sponsorTime} seconds`);

			timeSinceBreak = 0;
			runningTime += breakTime + sponsorTime;
		}
	}
	console.timeEnd("Process categories");

	categories.push(sponsorSrc);

	runningOrder.push({
		name: "Outro",
		path: sponsorSrc,
		duration: sponsorTime,
		startTime: runningTime
	});

	fs.writeFileSync(path.join(__dirname, "tmp", "running-order.json"), JSON.stringify(runningOrder));

	// const runningOrder = require(path.join(__dirname, "tmp", "running-order.json"));
	// const categories = runningOrder.map(r => {
	// 	if(r.name == "Intro"){
	// 		return path.join(__dirname, "intro.mp4");
	// 	}

	// 	if(r.name == "Break"){
	// 		return path.join(__dirname, "Mid sponsor.mp4");
	// 	}

	// 	if(r.name == "Outro"){
	// 		return path.join(__dirname, "sponsor.mp4");
	// 	}

	// 	if(r.name.indexOf(".mov-final") < 0){
	// 		return r.name.replace("-final", ".mp4-final");
	// 	} else {
	// 		return r.name.replace("-final", "-final.mp4");
	// 	}

	// 	return r.name;
	// });

	// categories.splice(1, 0, path.join(__dirname, "sponsor.mp4"));

	const finals = await merge(...categories);
	console.log(`Final - ${finals}`);

	console.timeEnd("app");
}

main().catch(e => {
	console.log(e);
	console.timeEnd("app");
});