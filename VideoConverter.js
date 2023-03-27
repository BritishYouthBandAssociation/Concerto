'use strict';

const fs = require('fs');

const {execShell, removeMany} = require('./utils');

class VideoConverter{
	static #videoCodec = 'libx264';
	static #audioCodec = 'libmp3lame';
	static #framerate = 25;

	static async splitToAudioVideo(video, trusted = false){
		const audioPath = `${video}.mp3`;
		const videoPath = `${video} - muted.mp4`;

		let cmd = `ffmpeg -i "${video}" -map 0:a "${audioPath}" -map 0:v "${videoPath}" -y`;
		if(!trusted){
			// const currFramerate = await this.#getFramerate(video);
			// const adjustment = this.#framerate / currFramerate;
			cmd = `ffmpeg -i "${video}" -c:v ${this.#videoCodec} -c:a ${this.#audioCodec} -map 0:a "${audioPath}" -map 0:v "${videoPath}" -y`;
		}

		await execShell(cmd);

		return [audioPath, videoPath];
	}

	static async #videoToStream(video, trusted = false){
		const output = `${video}.ts`;

		let cmd = `ffmpeg -i "${video}" -c:v ${this.#videoCodec} -c:a ${this.#audioCodec} "${output}" -y`;
		if(trusted){
			cmd = `ffmpeg -i "${video}" -c copy "${output}" -y`;
		}


		await execShell(cmd);
		return output;
	}

	// static #combineStreams(streams){
	// 	if (streams.length === 0){
	// 		throw 'Expected one or more streams';
	// 	}

	// 	const combined = `${streams[0]}-all.ts`;

	// 	if (fs.existsSync(combined)){
	// 		fs.unlinkSync(combined);
	// 	}

	// 	for (let i = 0; i < streams.length; i++){
	// 		const data = fs.readFileSync(streams[i]);
	// 		fs.appendFileSync(combined, data);
	// 	}

	// 	return combined;
	// }

	static async imageToVideo(image, duration){
		const output = `${image}.mp4`;
		await execShell(`ffmpeg -loop 1 -i "${image}" -c:v ${this.#videoCodec} -c:a ${this.#audioCodec} -t ${duration} "${output}" -y`);
		return output;
	}

	static async addAudioToVideo(audio, video, delay = 0){
		delay = delay * 1000;
		const output = `${video}-merged.mp4`;
		await execShell(`ffmpeg -i "${video}" -i "${audio}" -filter_complex "adelay=${delay}|${delay}" -c:v copy "${output}" -y`);
		return output;
	}

	static async combineVideos(...videos){
		if (videos.length === 0){
			throw 'Expected one or more videos to convert!';
		}

		const output = `${videos[0]}-all.mp4`;

		let streams = [];
		if(videos.length < 10){
			streams = await Promise.all(videos.map(v => this.#videoToStream(v)));
		} else {
			while(videos.length){
				const batch = videos.splice(0, 5);
				const processed = await Promise.all(batch.map(b => this.#videoToStream(b)));
				streams = streams.concat(processed);
			}
		}
		//const combined = await this.#combineStreams(streams);

		const input = (streams.length == 1) ? streams[0] : "concat:" + streams.join("|");

		await execShell(`ffmpeg -fflags +igndts -i "${input}" -c copy "${output}" -y`);

		//remove unneeded streams
		await removeMany(streams);

		return output;
	}

	static async combineCommonFormatVideos(...videos){
		if (videos.length === 0){
			throw 'Expected one or more videos to convert!';
		}

		const output = `${videos[0]}-all.mp4`;

		const streams = await Promise.all(videos.map(v => this.#videoToStream(v, true)));
		//const combined = await this.#combineStreams(streams);

		const input = (streams.length == 1) ? streams[0] : "concat:" + streams.join("|");

		await execShell(`ffmpeg -i "${input}" -c copy "${output}" -y`);

		//remove unneeded streams
		await removeMany(streams);

		return output;

		//:(
		//return VideoConverter.combineVideos(...videos);

		// const intermediate = `${videos[0]}-combiner.txt`;

		// let videoData = "";
		// for(let i = 0; i < videos.length; i++){
		// 	videoData += `file '${videos[i]}'\n`;
		// 	//const dur = await this.getDuration(videos[i]);
		// 	//videoData += `duration ${dur.totalSeconds}\n`;
		// }

		// fs.writeFileSync(intermediate, videoData);

		// await execShell(`ffmpeg -f concat -safe 0 -i "${intermediate}" -c copy "${output}" -y`);
		// await removeMany([intermediate]);
		// return output;
	}

	static async addTitleToVideo(title, video, duration, trusted = false){
		//we need to extract/readd audio as the concat takes the no audio from the title and assumes we want no title!
		const [audio, muted] = await this.splitToAudioVideo(video, trusted);
		const titleVid = await this.imageToVideo(title, duration);
		const combined = await this.combineCommonFormatVideos(titleVid, muted);
		const final = await this.addAudioToVideo(audio, combined, duration);

		await removeMany([titleVid, audio, muted, combined]);

		return final;
	}

	static async isPortrait(video){
		const result = await execShell(`ffprobe -v error -read_intervals "%+#0" -select_streams v:0 -show_entries stream=width,height:side_data=rotation -of csv=p=0 "${video}"`);
		const [width, height, rotation] = result.trim().split(",");

		if(!rotation){
			return height > width;
		}

		return width > height;
	}

	static async isLandscape(video){
		return !(await this.isPortrait(video));
	}

	static async addLandscapeBackgroundToPortraitVideo(video, background, size = null){
		size ??= 1080;
		const output = `${video}-landscaped.mp4`;

		await execShell(`ffmpeg -loop 1 -i "${background}" -i "${video}" -c:v ${this.#videoCodec} -c:a ${this.#audioCodec} -filter_complex "[1:v]scale=-1:1080[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2:shortest=1" "${output}" -y`);
		return output;
	}

	static async getDuration(video){
		const response = parseFloat(await execShell(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${video}"`));
		return {
			totalSeconds: response,
			minutes: response / 60,
			seconds: response % 60
		};
	}

	static async #getFramerate(video){
		const response = await execShell(`ffprobe -v error -select_streams v -of default=noprint_wrappers=1:nokey=1 -show_entries stream=r_frame_rate "${video}"`);
		return eval(response.trim());
	}
}

module.exports = VideoConverter;