'use strict';

const exec = require('child_process').exec;

module.exports = {
	execShell(cmd) {
		//console.log(`>>> OS: ${cmd}`);
		return new Promise((resolve, reject) => {
			exec(cmd, (error, stdout, stderr) => {
				if (error) {
					console.warn(error);
					reject(error);
				}
				resolve(stdout ? stdout : stderr);
			});
		});
	}
};