'use strict';

const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');
const Colour = require('./Colour');
const msal = require('@azure/msal-node');

class Utils {
	static execShell(cmd) {
		Colour.writeColouredText(`OS: ${cmd}`, Colour.OPTIONS.FG_BLUE);
		console.log();
		
		return new Promise((resolve, reject) => {
			exec(cmd, {maxBuffer: 1024 * 999999}, (error, stdout, stderr) => {
				if (error) {
					console.warn(error);
					return reject(error);
				}

				//console.log(stdout ? stdout : stderr);

				resolve(stdout ? stdout : stderr);
			});
		});
	}

	static removeMany(files) {
		files.forEach(f => {
			try {
				if (fs.existsSync(f)) {
					fs.unlinkSync(f);
				} else {
					Colour.writeColouredText(`${f} does not exist`, Colour.OPTIONS.FG_RED);
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

	static async getToken(config) {
		const cca = new msal.ConfidentialClientApplication(config);
		const resp = await cca.acquireTokenByClientCredential({
			scopes: ['https://graph.microsoft.com/.default']
		});
	
		return resp.accessToken;
	}
	
	static async listFiles(config, path) {
		const url = `https://graph.microsoft.com/v1.0/users/${config.files.user}/drive/root:${path}:/children`;
		const token = await Utils.getToken(config);
	
		const res = await fetch(url, {
			headers: {
				'Authorization': `Bearer ${token}`
			}
		});
	
		const json = await res.json();
		return json;
	}

	static async sleep(milliseconds){
		return new Promise(resolve => setTimeout(resolve, milliseconds));
	}
}

module.exports = Utils;