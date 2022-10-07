'use strict';

const fs = require('fs');
const path = require('path');

const {execShell} = require('./utils');

class VideoConverter{
	static async imageToVideo(image, newName, duration, fps){
		await execShell(`ffmpeg -loop 1 -framerate ${fps} -i "${image}" -c:v libx264 -t ${duration} -pix_fmt yuv420p "${newName}" -y`);
		return newName;
	}

	static async #parseMetadata(vid){
		const raw = await execShell(`ffprobe "${vid}" -hide_banner`);
		const lines = raw.split('\n');
		console.log(lines);

		const data = {
			streams: []
		};
		let stream = -1;

		for (let i = 1; i < lines.length; i++){ //skip first as it contains file name
			const line = lines[i].trim();
			const parts = line.split(':');

			let eObj = stream > -1 ? data.streams[stream] : data;

			if (parts[0] === 'Metadata'){
				continue;
			}

			if (parts[0].indexOf('Stream') > - 1){
				eObj = {};

				parts.splice(0, 2);
				const type = parts.shift().trim();
				eObj.type = type;
				const newSplit = parts.join(':').split(',');

				if (type === 'Video'){
					eObj.encoding = newSplit.shift().trim();
					eObj['colour_space'] = newSplit.splice(0, newSplit.length - 5).join(',').trim();
					eObj.size = newSplit.shift().trim();
					eObj.rate = newSplit.shift().trim();
					eObj.fps = newSplit.shift().trim().split(' ')[0];
					eObj.tbf = newSplit.shift().trim().split(' ')[0];
					eObj.tbn = newSplit.shift().trim();
				} else if (type === 'Audio'){
					eObj.encoding = newSplit.shift().trim();
					eObj.quality = newSplit.shift().trim();
					eObj['output_type'] = newSplit.shift().trim();
					eObj.fltp = newSplit.shift().trim();
					eObj.rate = newSplit.shift().trim();
				}

				data.streams.push(eObj);
				stream++;
				continue;
			}

			if (parts.length <= 1){
				continue;
				//nothing else we can do here
			}

			if (parts.length === 2){
				eObj[parts[0].trim()] = parts[1].trim();
			}

			if (parts[0].indexOf('creation_time') > -1){
				eObj[parts.shift().trim()] = parts.join(':').trim();
			}

			if (parts[0].indexOf('Duration') > -1){
				const key = parts.shift();
				const resplit = parts.join(':').split(',');

				eObj[key.toLowerCase().trim()] = resplit[0].trim();

				for (let j = 1; j < resplit.length; j++){
					const newParts = resplit[j].split(':');
					eObj[newParts[0].trim()] = newParts[1].trim();
				}
			}
		}

		return data;
	}

	static async #videoToStream(vid){
		if (path.extname(vid) != '.mp4'){
			//convert to mp4 so we're all on the same page :)
			await execShell(`ffmpeg -i "${vid}" "${vid}.mp4"`);
			vid += '.mp4';
		}

		const streamPath = `${vid}.ts`;
		await execShell(`ffmpeg -i "${vid}" -c copy "${streamPath}" -y`);
		return streamPath;
	}

	static async mergeVideos(vid1, vid2, output){
		const streams = await Promise.all([this.#videoToStream(vid1), this.#videoToStream(vid2)]);

		const tempJoin = `${output}-join.ts`;
		if (fs.existsSync(tempJoin)){
			fs.unlinkSync(tempJoin);
		}

		for (let i = 0; i < streams.length; i++){
			const data = fs.readFileSync(streams[i]);
			fs.appendFileSync(tempJoin, data);
		}

		await execShell(`ffmpeg -i "${tempJoin}" -c:v libx264 -preset medium -crf 23 -b:a 128k "${output}" -y`);

		//tidy up after ourselves :)
		fs.unlinkSync(tempJoin);
		streams.forEach(s => fs.unlinkSync(s));

		return output;
	}

	static async addTitleCard(title, video, duration, output){
		const metadata = await this.#parseMetadata(video);
		let stream = metadata.streams.filter(s => s.type === 'Video');

		if (stream.length === 0){
			throw 'Video stream not found!';
		}

		stream = stream[0];

		const tempPath = `${title}.mp4`;
		await this.imageToVideo(title, tempPath, duration, stream.fps);
		await this.mergeVideos(tempPath, video, output);

		fs.unlinkSync(tempPath);
		return output;
	}
}

module.exports = VideoConverter;