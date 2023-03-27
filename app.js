'use strict';

const path = require('path');
const fs = require('fs');

const { listFiles, removeFolder } = require('./utils');
const VideoConverter = require('./VideoConverter');
const Colour = require('./Colour');
const ProcessManager = require('./ProcessManager');
const Utils = require('./utils');

const today = new Date();


function printDone(finalPath) {
	Colour.writeColouredText(`
-	
	 ▄▀▀█▄   ▄▀▀▀▀▄    ▄▀▀▀▀▄          ▄▀▀█▄▄   ▄▀▀▀▀▄   ▄▀▀▄ ▀▄  ▄▀▀█▄▄▄▄ 
	▐ ▄▀ ▀▄ █    █    █    █          █ ▄▀   █ █      █ █  █ █ █ ▐  ▄▀   ▐ 
	  █▄▄▄█ ▐    █    ▐    █          ▐ █    █ █      █ ▐  █  ▀█   █▄▄▄▄▄  
	 ▄▀   █     █         █             █    █ ▀▄    ▄▀   █   █    █    ▌  
	█   ▄▀    ▄▀▄▄▄▄▄▄▀ ▄▀▄▄▄▄▄▄▀      ▄▀▄▄▄▄▀   ▀▀▀▀   ▄▀   █    ▄▀▄▄▄▄   
	▐   ▐     █         █             █     ▐           █    ▐    █    ▐   
	          ▐         ▐             ▐                 ▐         ▐        
-
	`, Colour.OPTIONS.BG_GREEN, Colour.OPTIONS.FG_WHITE);
	console.log();
	Colour.writeColouredText(`Your videos are available in ${finalPath}`, Colour.OPTIONS.FG_GREEN, Colour.OPTIONS.UNDERSCORE);
}

async function finalize(dlPath) {
	const runningOrder = [];
	const files = fs.readdirSync(dlPath).filter(f => f.endsWith(".mp4") && !f.endsWith("-all.mp4"));
	files.sort();

	let timeSinceBreak = 0;
	let runningTime = 0;
	const breakTime = 240;
	const sponsorTime = 60;

	console.log();
	console.log();

	for (let index = 0; index < files.length; index++) {
		const f = files[index];
		let fullPath = f;

		if(f.indexOf(":\\") < 0){
			fullPath = path.join(dlPath, f);;
			files[index] = fullPath;
		}

		let duration = null;
		try{
			duration = await VideoConverter.getDuration(fullPath);
		} catch (ex){
			//one of the weird leftovers - skip
			files.splice(index, 1);
			index--;
			continue;
		}

		runningOrder.push({
			name: f.replace(".mp4", ""),
			duration: duration,
			startTime: runningTime
		});

		console.log(`${f.replace(".mp4", "")} starting at ${runningTime} and lasting for ${duration.minutes}:${duration.seconds}`);

		runningTime += duration.totalSeconds;
		timeSinceBreak += duration.totalSeconds;

		if (timeSinceBreak >= 3600 && files.length - index > 2 && f.substring(0, 1) != files[index + 1].substring(0, 1)) {
			files.splice(index + 1, 0, path.join(__dirname, 'countdown timer.mp4'), path.join(__dirname, 'sponsor.mp4'));
			index += 2;

			runningOrder.push({
				name: 'BREAK',
				duration: breakTime + sponsorTime,
				startTime: runningTime
			});

			console.log(`${timeSinceBreak} seconds since break - adding break at ${runningTime} for ${breakTime + sponsorTime} seconds`);

			timeSinceBreak = 0;
			runningTime += breakTime + sponsorTime;
		}
	}

	console.log("Running order");
	console.log(runningOrder);

	console.log();
	console.log(`Total duration: ${runningTime} (${runningTime / 60}m ${runningTime % 60}s)`);

	console.log("Merging final video");

	// let offset = 0;

	// while (files.length > 5) {
	// 	const batch = files.splice(offset, 5);
	// 	const merged = await VideoConverter.combineVideos(...batch);
	// 	categories.splice(offset, 0, merged);
	// 	offset++;

	// 	if (offset >= categories.length) {
	// 		offset = 0;
	// 	}

	// 	console.log(`Num left: ${categories.length}`);
	// 	console.log(`Next offset: ${offset}`);
	// }

	const final = await VideoConverter.combineCommonFormatVideos(...files);
	fs.renameSync(final, path.join(dlPath, `I-E ${today.getFullYear()}.mp4`));

	console.log("Done!");
	console.timeEnd("app");
}

async function main() {
	const test = false;

	console.time("app");
	const config = require('./config');

	const dlPath = path.join(__dirname, 'tmp');

	if (!test) {
		if (fs.existsSync(dlPath)) {
			//clean up after previous run
			Colour.writeColouredText(`Removing ${dlPath} ready for new run`, Colour.OPTIONS.FG_RED);
			removeFolder(dlPath);
		}

		fs.mkdirSync(dlPath, { recursive: true });

		const fileBase = path.join(config.files.root, String(new Date().getFullYear()));
		const response = await listFiles(config, fileBase);
		const dirs = response.value.filter(d => !['full', 'intro', 'unprocessed'].includes(d.name.toLowerCase()));


		const procMan = new ProcessManager(dirs.filter(d => ["A2", "M2"].includes(d.name.substring(0, 2).trim())), {
			count: 3,
			workerData: {
				dlPath,
				config,
				fileBase
			}
		});

		procMan.addEventListener("done", async () => {
			await finalize(dlPath);
		});

		procMan.run();
	} else {
		await finalize(dlPath);
	}

	//iterate dirs in batches, as all at once crashed my laptop :)
	// while (dirs.length > 0) {
	// 	const batch = dirs.splice(0, 3);
	// 	const processed = await Promise.all(batch.map(d => processDirectory(config, fileBase, dlPath, d)));
	// 	categories = categories.concat(processed.filter(x => x));
	// }

	// let offset = 0;

	// while(categories.length > 5){
	// 	const batch = categories.splice(offset, 5);
	// 	console.log(batch);
	// 	const merged = await VideoConverter.combineVideos(...batch);
	// 	categories.splice(offset, 0, merged);
	// 	offset++;

	// 	if(offset >= categories.length){
	// 		offset = 0;
	// 	}

	// 	console.log(`Num left: ${categories.length}`);
	// 	console.log(`Next offset: ${offset}`);
	// }

	// const final = await VideoConverter.combineVideos(...categories);
	// fs.renameSync(final, path.join(dlPath, `I-E ${today.getFullYear()}.mp4`));

	// printDone(dlPath);

	//5. Upload final video
	//uploadVideo(config, 'tmp/A1.mp4', fileBase, 'full');
}

main().catch(e => {
	console.error(e);
});