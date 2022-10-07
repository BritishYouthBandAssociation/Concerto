'use strict';

const fs = require('fs');

const {execShell, removeMany} = require('./utils');

class VideoConverter{
	static async splitToAudioVideo(video){
		const audioPath = `${video}.mp3`;
		const videoPath = `${video} - muted.mp4`;

		await execShell(`ffmpeg -i "${video}" -c:v copy -c:a libmp3lame -map 0:a "${audioPath}" -map 0:v "${videoPath}" -y`);

		return [audioPath, videoPath];
	}

	static async #videoToStream(video){
		const output = `${video}.ts`;
		await execShell(`ffmpeg -i "${video}" -vcodec copy "${output}" -y`);
		return output;
	}

	static #combineStreams(streams){
		if (streams.length === 0){
			throw 'Expected one or more streams';
		}

		const combined = `${streams[0]}-all.ts`;

		if (fs.existsSync(combined)){
			fs.unlinkSync(combined);
		}

		for (let i = 0; i < streams.length; i++){
			const data = fs.readFileSync(streams[i]);
			fs.appendFileSync(combined, data);
		}

		return combined;
	}

	static async imageToVideo(image, duration){
		const output = `${image}.mp4`;
		await execShell(`ffmpeg -loop 1 -i "${image}" -c:v libx264 -framerate 30 -t ${duration} "${output}" -y`);
		return output;
	}

	static async addAudioToVideo(audio, video, delay = 0){
		delay = delay * 1000;
		const output = `${video}-merged.mp4`;
		await execShell(`ffmpeg -i "${video}" -i "${audio}" -filter_complex "adelay=${delay}}|${delay}" -c:v copy "${output}" -y`);
		return output;
	}

	static async combineVideos(...videos){
		if (videos.length === 0){
			throw 'Expected one or more videos to convert!';
		}

		console.log('Combining videos:');
		console.log(videos);
		console.log();

		const output = `${videos[0]}-all.mp4`;

		const streams = await Promise.all(videos.map(v => this.#videoToStream(v)));
		const combined = await this.#combineStreams(streams);

		await execShell(`ffmpeg -i "${combined}" -c:v copy -c:a libmp3lame "${output}" -y`);

		//remove unneeded streams
		await removeMany([...streams, combined]);

		return output;
	}

	static async addTitleToVideo(title, video, duration){
		const [audio, muted] = await this.splitToAudioVideo(video);
		const titleVid = await this.imageToVideo(title, duration);
		const combined = await this.combineVideos(titleVid, muted);
		const final = await this.addAudioToVideo(audio, combined, duration);

		await removeMany([audio, muted, titleVid, combined]);

		return final;
	}
}

module.exports = VideoConverter;