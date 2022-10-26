'use strict';

const exec = require('child_process').exec;
const fs = require('fs');

module.exports = {
	execShell(cmd) {
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
	},

	removeMany(files) {
		files.forEach(f => {
			if (fs.existsSync(f)) {
				fs.unlinkSync(f);
			}
		});
	}
};