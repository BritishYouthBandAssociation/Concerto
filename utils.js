'use strict';

const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const Colour = require('./Colour');

class Utils {
	static execShell(cmd) {
		//console.log(`>>> OS: ${cmd}`);
		return new Promise((resolve, reject) => {
			exec(cmd, (error, stdout, stderr) => {
				if (error) {
					console.warn(error);
					return reject(error);
				}
				resolve(stdout ? stdout : stderr);
			});
		});
	}

	static removeMany(files) {
		files.forEach(f => {
			try {
				if (fs.existsSync(f)) {
					fs.unlinkSync(f);
				}
			} catch {
				Colour.writeColouredText(`Failed to remove ${f}`, Colour.OPTIONS.FG_RED);
			}
		});
	}

	static removeFolder(folderPath) {
		Utils.removeMany(fs.readdirSync(folderPath).map(f => path.join(folderPath, f)));
		fs.rmdirSync(folderPath);
	}
}

module.exports = Utils;