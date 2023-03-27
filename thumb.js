const path = require('path');
const {readdirSync} = require('fs');
const {execShell} = require('./utils');

async function processDir(dir){
	const inputs = readdirSync(dir).filter(f => !f.endsWith("-final.mp4") && !f.endsWith("-all.mp4") && !f.endsWith("-landscape.mp4"));
	await Promise.all(inputs.map(i => {
		const file = path.join(dir, i);
		return execShell(`ffmpeg -sseof -3 -i "${file}" -update 1 -q:v 1 "${file}.jpg"`);
	}));
}

async function main(){
	const base = "C:\\Users\\luke\\Downloads\\I&E playground\\";
	const dirs = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(base, d.name));
	await Promise.all(dirs.map(d => {
		return processDir(d);
	}));
}

main();