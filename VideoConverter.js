'use strict';

const fs = require('fs');

const {execShell} = require('./utils');

class VideoConverter{
	static async imageToVideo(image, newName, duration){
		await execShell(`ffmpeg -loop 1 -framerate 30 -i "${image}" -c:v libx264 -t ${duration} -pix_fmt yuv420p "${newName}" -y`);
		return newName;
	}

	static async #videoToStream(vid){
		const streamPath = `${vid}.ts`;
		await execShell(`ffmpeg -i "${vid}" -c:v libx264 -c:a aac -b:a 160k -bsf:v h264_mp4toannexb -f mpegts -crf 32 "${streamPath}" -y`);
		return streamPath;
	}

	static async mergeVideos(vid1, vid2, output){
		const [stream1, stream2] = await Promise.all([this.#videoToStream(vid1), this.#videoToStream(vid2)]);
		await execShell(`ffmpeg -i "concat:${stream1}|${stream2}" -c copy -bsf:a aac_adtstoasc "${output}" -y`);

		//tidy up after ourselves :)
		fs.unlinkSync(stream1);
		fs.unlinkSync(stream2);

		return output;
	}
}

module.exports = VideoConverter;